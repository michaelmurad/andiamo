#!/usr/bin/env node
// Calibrates the grounding judge against a hand-labelled answer key, without calling the model under test.
// Re-runs only the judge (evals/select-places/judge.yaml) on saved shortlists and compares its per-pick
// supported/unsupported calls with calibration/grounding-labels.yaml.
//
//   npm run eval:calibrate                 # both sets
//   npm run eval:calibrate -- --set tune   # one set
//
// Prints agreement, precision and recall on "unsupported" per set, lists every disagreement, and writes the
// full result to .claude/hillclimb/select-places/calibration/<judge-version>/<set>.json.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { PLACE_BY_ID } from '../../src/lib/data/places.ts';
import { loadPrompt, parsePrompt } from '../../src/lib/ai/prompts.ts';
import { judge, loadCases } from './grade.ts';
import { generateFresh } from './calibration/generate.mjs';

const FLOW = '.claude/hillclimb/select-places';
const here = p => fileURLToPath(new URL(p, import.meta.url));
const labels = parse(readFileSync(here('./calibration/grounding-labels.yaml'), 'utf8'));
const cases = new Map([...loadCases(here('./cases.yaml')), ...loadCases(here('./calibration/cases.yaml')), ...loadCases(here('./calibration/cases-2.yaml'))].map(c => [c.id, c]));
const judgePrompt = parsePrompt(readFileSync(here('./judge.yaml'), 'utf8'), 'judge');
const selectPrompt = loadPrompt('select-places');

const only = process.argv.includes('--set') ? process.argv[process.argv.indexOf('--set') + 1] : null;
if (process.argv.includes('--generate')) {
  const batch = process.argv.includes('--batch') ? Number(process.argv[process.argv.indexOf('--batch') + 1]) : 1;
  console.log(`wrote ${await generateFresh(FLOW, batch)}; label it in calibration/grounding-labels.yaml before judging it`);
  process.exit(0);
}
const CONCURRENCY = 5;

async function pool(items, fn) {
  const out = [];
  let i = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}

const totals = {};
for (const set of labels.sets) {
  if (only && set.name !== only) continue;
  const dir = join(FLOW, set.dir);
  const rows = readFileSync(join(dir, 'results.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));

  const results = await pool(rows, async row => {
    const c = cases.get(row.prompt_id);
    const trace = JSON.parse(readFileSync(join(dir, 'traces', `${row.prompt_id}_rep${row.rep}.json`), 'utf8'));
    const output = JSON.parse(trace[2].content);
    if (!c) throw new Error(`no case ${row.prompt_id} in cases.yaml or calibration/cases.yaml`);
    const call = { output, stopReason: 'end_turn', model: row.model, usage: row.usage, prompt: selectPrompt, system: '', user: '' };
    const j = await judge(c, call, c.settings.hub ?? output.hub);
    const wanted = set.unsupported[row.prompt_id] ?? {};
    return j.groundingByPick.map(g => ({
      case: row.prompt_id, id: g.id, name: PLACE_BY_ID.get(g.id)?.name,
      label: g.id in wanted ? 'unsupported' : 'supported',
      judge: g.supported ? 'supported' : 'unsupported',
      judge_claim: g.claim, label_note: wanted[g.id] ?? '',
      judge_usage: j.judge_usage,
    }));
  });

  const picks = results.flat();
  const tp = picks.filter(p => p.label === 'unsupported' && p.judge === 'unsupported').length;
  const fp = picks.filter(p => p.label === 'supported' && p.judge === 'unsupported').length;
  const fn = picks.filter(p => p.label === 'unsupported' && p.judge === 'supported').length;
  const agree = picks.filter(p => p.label === p.judge).length;
  const summary = {
    set: set.name, judge: `${judgePrompt.id}@${judgePrompt.version}`, picks: picks.length,
    agreement: agree / picks.length, precision: tp / Math.max(1, tp + fp), recall: tp / Math.max(1, tp + fn), tp, fp, fn,
  };
  totals[set.name] = summary;

  console.log(`\n[${set.name}] ${summary.judge}: agreement ${(summary.agreement * 100).toFixed(1)}% (${agree}/${picks.length}), `
    + `precision ${(summary.precision * 100).toFixed(0)}%, recall ${(summary.recall * 100).toFixed(0)}% (tp ${tp}, fp ${fp}, fn ${fn})`);
  for (const p of picks.filter(p => p.label !== p.judge)) {
    console.log(`  ${p.judge === 'unsupported' ? 'FALSE FLAG' : 'MISSED    '} ${p.case} ${p.id} ${p.name}: `
      + (p.judge === 'unsupported' ? `judge said "${p.judge_claim}"` : `key: ${p.label_note}`));
  }

  const out = join(FLOW, 'calibration', `v${judgePrompt.version}`);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, `${set.name}.json`), JSON.stringify({ summary, picks }, null, 2));
}
console.log('\n' + JSON.stringify(totals));
