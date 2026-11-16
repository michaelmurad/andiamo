#!/usr/bin/env node
// Decides whether a round is kept, from the files alone, and records the decision itself.
//
//   npm run eval:compare -- v3            KEEP or REVERT v3 against the current best round (writes _state.best on KEEP)
//   npm run eval:compare -- --lockbox v3  the lockbox report: baseline prompt vs v3's prompt on the lockbox cases
//
// Refuses to decide unless: the harness matches the approved sha; every row of each round came from one prompt,
// and the candidate's differs from the best round's; every case has the configured number of reps; and no failed
// attempt is still unscored. The rule itself is decide() in compare-lib.mjs (tested in compare-lib.test.ts).

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { decide, METRICS, runProblems, splitMean } from './compare-lib.mjs';

// A crash (missing or unreadable files) exits 2, like a refusal, never 1 (REVERT) or 0 (KEEP).
process.on('uncaughtException', e => { console.error(`ERROR: ${e?.message ?? e}`); process.exit(2); });

const MAIN = '.claude/hillclimb/select-places';
const GROUNDED_CAVEAT = "Caveat: grounded's judge agreed with a Claude-written answer key 81% of the time on a blind set, and grounded can rise because reasons say less about fit; read the winning round's reasons before calling it a better planner.";
const LOCKBOX = '.claude/hillclimb/select-places-lockbox';
const config = JSON.parse(readFileSync('evals/select-places/loop-config.json', 'utf8'));
const statePath = join(MAIN, '_state.json');
const state = JSON.parse(readFileSync(statePath, 'utf8'));

const lines = p => (existsSync(p) ? readFileSync(p, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : []);
function rowsOf(flow, v) {
  const rows = lines(join(flow, v, 'results.jsonl'));
  if (!rows.length) throw new Error(`no results for ${flow}/${v}`);
  return rows;
}
/** Failed attempts that no later scored row has replaced. */
const openErrors = (flow, v, rows) =>
  lines(join(flow, v, 'errors.jsonl')).filter(e => !rows.some(r => r.prompt_id === e.prompt_id && r.rep === e.rep)).length;

const prices = config.prices;
const costOf = r => [[r.model, r.usage], [r.judge_model, r.judge_usage]].reduce((sum, [m, u]) => {
  const p = prices[m];
  if (!p || !u) return sum;
  return sum + (u.input_tokens * p.in + (u.cache_creation_input_tokens ?? 0) * p.in * 1.25
    + (u.cache_read_input_tokens ?? 0) * p.in * 0.1 + u.output_tokens * p.out) / 1e6;
}, 0);

function harnessApproved() {
  try {
    execFileSync('npx', ['tsx', 'evals/select-places/run-eval.mjs', '--check-harness'], { stdio: 'pipe' });
    return true;
  } catch { return false; }
}

const args = process.argv.slice(2);
const variant = args.find(a => /^v[1-9]\d*$/.test(a));
if (!variant) { console.error('usage: npm run eval:compare -- vN  |  --lockbox vN'); process.exit(2); }
// The loop stops after max_round (a person sets it in loop-config.json, which is in the checksum).
if (!args.includes('--lockbox') && Number(variant.slice(1)) > config.max_round) {
  console.error(`REFUSED\n- ${variant} is past max_round ${config.max_round} in loop-config.json; the loop has stopped`);
  process.exit(2);
}
if (!harnessApproved()) { console.error('REFUSED: the harness differs from the approved sha'); process.exit(2); }

if (args.includes('--lockbox')) {
  // Directional only: 6 cases have no usable noise floor. Reported as is in the final summary.
  const a = rowsOf(LOCKBOX, 'baseline'), b = rowsOf(LOCKBOX, variant);
  // The lockbox is the headline, so check exactly what is compared: all lockbox cases, the main baseline's prompt
  // against the best round's prompt (which must be the variant named).
  const ids = parse(readFileSync('evals/select-places/lockbox.yaml', 'utf8')).cases.map(c => c.id).sort();
  const mainBase = rowsOf(MAIN, 'baseline')[0].prompt_sha;
  const problems = [];
  for (const [name, rows] of [['lockbox baseline', a], [`lockbox ${variant}`, b]]) {
    const got = [...new Set(rows.map(r => r.prompt_id))].sort();
    if (JSON.stringify(got) !== JSON.stringify(ids)) problems.push(`${name}: cases ${got.join(',')} are not lockbox.yaml's ${ids.join(',')}`);
  }
  if (a[0].prompt_sha !== mainBase) problems.push('lockbox baseline was not run on the main baseline prompt');
  if (state.best?.variant !== variant) problems.push(`${variant} is not the best round (${state.best?.variant ?? 'baseline'})`);
  if (b[0].prompt_sha !== state.best?.prompt_sha || b[0].prompt_sha !== rowsOf(MAIN, variant)[0].prompt_sha) {
    problems.push(`lockbox ${variant} was not run on ${variant}'s prompt`);
  }
  problems.push(
    ...runProblems('lockbox baseline', a, ids, config.reps, openErrors(LOCKBOX, 'baseline', a)),
    ...runProblems(`lockbox ${variant}`, b, ids, config.reps, openErrors(LOCKBOX, variant, b)),
  );
  if (problems.length) { console.error(`REFUSED\n- ${[...new Set(problems)].join('\n- ')}`); process.exit(2); }
  console.log(`lockbox, ${ids.length} cases (directional): baseline prompt -> ${variant} prompt`);
  for (const m of METRICS) console.log(`  ${m.padEnd(9)} ${splitMean(a, ids, m).toFixed(3)} -> ${splitMean(b, ids, m).toFixed(3)}`);
  // The carry-over test covers every metric the best round won on, so a grounded-only win is checked on grounded too.
  const wonOn = JSON.parse(readFileSync(join(MAIN, variant, 'decision.json'), 'utf8')).won ?? [];
  const tests = [
    ['checks', splitMean(b, ids, 'checks') >= splitMean(a, ids, 'checks')],
    ['rubric', splitMean(b, ids, 'rubric') >= splitMean(a, ids, 'rubric') - 0.5 / ids.length],
    ...(wonOn.includes('grounded') ? [['grounded', splitMean(b, ids, 'grounded') >= splitMean(a, ids, 'grounded')]] : []),
  ];
  const failed = tests.filter(([, ok]) => !ok).map(([m]) => m);
  console.log(failed.length ? `DOES NOT CARRY OVER (${failed.join(', ')})` : `CARRIES OVER (${tests.map(([m]) => m).join(', ')})`);
  if (wonOn.includes('grounded')) console.log(GROUNDED_CAVEAT);
  process.exit(0);
}

// compare.mjs writes a decision.json into every round it decides; the best round must be the latest KEEP, so a
// stale or hand-edited state.best (or a deleted one) is refused instead of silently lowering the bar.
const decisions = readdirSync(MAIN).filter(d => /^v[1-9]\d*$/.test(d) && existsSync(join(MAIN, d, 'decision.json')))
  .map(d => ({ variant: d, n: Number(d.slice(1)), ...JSON.parse(readFileSync(join(MAIN, d, 'decision.json'), 'utf8')) }))
  .sort((x, y) => x.n - y.n);
const lastKeep = decisions.filter(d => d.decision === 'KEEP').at(-1)?.variant ?? 'baseline';
if ((state.best?.variant ?? 'baseline') !== lastKeep) {
  console.error(`REFUSED\n- state.best is ${state.best?.variant ?? 'absent'}, but the latest KEEP recorded by compare.mjs is ${lastKeep}`);
  process.exit(2);
}
if (decisions.some(d => d.variant === variant)) { console.error(`REFUSED\n- ${variant} has already been decided`); process.exit(2); }
const best = state.best?.variant ?? 'baseline';
const base = rowsOf(MAIN, 'baseline');
const [a, b] = [rowsOf(MAIN, best), rowsOf(MAIN, variant)];
const allIds = [...config.train_ids, ...config.test_ids];
const problems = [];
// `best` lives in unprotected state, so confirm it names the round whose prompt compare.mjs recorded.
if (best !== 'baseline' && a[0].prompt_sha !== state.best.prompt_sha) problems.push(`state.best (${best}) doesn't match the prompt compare.mjs recorded for it`);
// A prompt already scored in an earlier round can't be re-run under a new number for another draw of the noise.
for (const d of readdirSync(MAIN).filter(d => /^(baseline|v[1-9]\d*)$/.test(d) && d !== variant)) {
  const earlier = lines(join(MAIN, d, 'results.jsonl'));
  if (earlier.length && earlier[0].prompt_sha === b[0].prompt_sha) problems.push(`${variant} reuses ${d}'s prompt`);
}
problems.push(
  ...runProblems(best, a, allIds, config.reps, openErrors(MAIN, best, a)),
  ...runProblems(variant, b, allIds, config.reps, openErrors(MAIN, variant, b)),
);
// The cost hold must not pass because a price is missing.
for (const r of [...a, ...b]) for (const m of [r.model, r.judge_model]) if (m && !prices[m]) problems.push(`no price for ${m} in loop-config.json`);
if (problems.length) { console.error(`REFUSED\n- ${[...new Set(problems)].join('\n- ')}`); process.exit(2); }

const { fail, report, won } = decide({ base, best: a, candidate: b, config, costOf });
console.log(`${variant} vs ${best}\n${report.join('\n')}`);
const record = decision => writeFileSync(join(MAIN, variant, 'decision.json'),
  JSON.stringify({ decision, against: best, prompt_sha: b[0].prompt_sha, report, fail, won,
    ...(won.includes('grounded') ? { caveat: GROUNDED_CAVEAT } : {}), decided_by: 'evals/select-places/compare.mjs' }, null, 2) + '\n');
if (fail.length) { record('REVERT'); console.log(`REVERT\n- ${fail.join('\n- ')}`); process.exit(1); }
record('KEEP');
state.best = { variant, prompt_sha: b[0].prompt_sha, decided_by: 'evals/select-places/compare.mjs' };
writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');
console.log(`KEEP on ${won.join(', ')} (recorded ${variant} as best)`);
if (won.includes('grounded')) console.log(GROUNDED_CAVEAT);
