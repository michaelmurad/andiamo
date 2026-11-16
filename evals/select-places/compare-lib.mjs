// The keep/revert rule for the select-places loop, as pure functions over result rows, so it can be tested.
// compare.mjs reads the files and calls decide(); decide()'s comment states the rule in words.

export const METRICS = ['checks', 'rubric', 'grounded', 'style', 'specific'];

/** Differences are means of small fractions; compare with a margin so float rounding can't decide a round. */
const EPS = 1e-9;
const above = (x, floor) => x > floor + EPS;
const below = (x, floor) => x < -floor - EPS;

export const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;
export const median = xs => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

/** Per case: the mean of a metric over its reps. */
export function perCase(rows, ids, metric) {
  const out = {};
  for (const id of ids) {
    const rs = rows.filter(r => r.prompt_id === id);
    if (!rs.length) throw new Error(`no rows for case ${id}`);
    out[id] = mean(rs.map(r => r.grade[metric]));
  }
  return out;
}
export const splitMean = (rows, ids, m) => mean(Object.values(perCase(rows, ids, m)));

/** 95% half-width of the per-case rep0-rep1 difference, at least one rep flipping in one case (0.5 / n). */
export function floors(baselineRows, ids) {
  const out = {};
  for (const m of METRICS) {
    const d = ids.map(id => {
      const rs = baselineRows.filter(r => r.prompt_id === id).sort((a, b) => a.rep - b.rep);
      if (rs.length < 2) throw new Error(`baseline case ${id} needs 2 reps for a noise floor`);
      return rs[0].grade[m] - rs[1].grade[m];
    });
    const sd = Math.sqrt(d.reduce((a, x) => a + (x - mean(d)) ** 2, 0) / (d.length - 1));
    out[m] = Math.max(1.96 * sd / Math.sqrt(d.length), 0.5 / ids.length);
  }
  return out;
}

/** Problems that make a run unfit to compare: mixed prompts, missing reps, unscored attempts. */
export function runProblems(name, rows, ids, reps, openErrors) {
  const problems = [];
  const shas = new Set(rows.map(r => r.prompt_sha));
  if (shas.size !== 1 || shas.has(undefined)) problems.push(`${name}: rows come from ${shas.size} prompt versions`);
  for (const id of ids) {
    const n = rows.filter(r => r.prompt_id === id).length;
    if (n !== reps) problems.push(`${name}: case ${id} has ${n} reps, expected ${reps}`);
  }
  if (openErrors) problems.push(`${name}: ${openErrors} failed attempts not yet re-run (resume the run)`);
  return problems;
}

/**
 * KEEP or REVERT `candidate` against `best`. On the test split: checks may not go down; rubric may not go down
 * beyond noise; checks, rubric or grounded must improve beyond noise. Holds: style and specific within noise;
 * grounded at most -0.10 overall and -0.30 per case; no more shortlist failures; latency and cost at most 1.5x.
 * Train: checks, rubric and grounded may not go down beyond their train floors. style, specific, grounded, shortlist
 * failures, latency and cost are holds. Train checks and rubric may not go down beyond their own floors.
 */
export function decide({ base, best, candidate, config, costOf }) {
  const floor = { test: floors(base, config.test_ids), train: floors(base, config.train_ids) };
  const delta = (split, m) => splitMean(candidate, config[`${split}_ids`], m) - splitMean(best, config[`${split}_ids`], m);
  const sign = x => `${x >= 0 ? '+' : ''}${x.toFixed(3)}`;
  const report = METRICS.map(m =>
    `${m.padEnd(9)} test ${sign(delta('test', m))} (floor ${floor.test[m].toFixed(3)})  train ${sign(delta('train', m))} (floor ${floor.train[m].toFixed(3)})`);

  const fail = [];
  if (below(delta('test', 'checks'), 0)) fail.push('checks went down on test');
  if (below(delta('test', 'rubric'), floor.test.rubric)) fail.push('rubric went down on test beyond noise');
  // A round wins on checks, rubric, or (since run 2, by the user's decision) grounded: fewer factual claims the
  // dataset doesn't support. grounded's judge agreed with a Claude-written key 81% of the time on a blind set, so a
  // grounded-only win is reported with that caveat; checks and rubric still may not drop (rules above and below).
  const won = ['checks', 'rubric', 'grounded'].filter(m => above(delta('test', m), floor.test[m]));
  if (!won.length) fail.push('none of checks, rubric or grounded improved on test beyond noise');
  for (const m of ['style', 'specific']) if (below(delta('test', m), floor.test[m])) fail.push(`${m} dropped beyond noise`);
  if (below(delta('test', 'grounded'), 0.10)) fail.push('grounded dropped by more than 0.10');
  if (below(delta('train', 'grounded'), floor.train.grounded)) fail.push('grounded went down on train beyond noise');
  const ga = perCase(best, config.test_ids, 'grounded'), gb = perCase(candidate, config.test_ids, 'grounded');
  for (const id of config.test_ids) if (below(gb[id] - ga[id], 0.30)) fail.push(`grounded dropped by more than 0.30 in ${id}`);
  const noList = rows => rows.filter(r => r.outcome !== 'shortlist').length;
  if (noList(candidate) > noList(best)) fail.push(`more rows without a shortlist (${noList(candidate)} vs ${noList(best)})`);
  if (median(candidate.map(r => r.latency_s)) > 1.5 * median(best.map(r => r.latency_s))) fail.push('median latency above 1.5x');
  const cost = rows => mean(rows.map(costOf));
  if (cost(candidate) > 1.5 * cost(best)) fail.push(`mean cost above 1.5x ($${cost(candidate).toFixed(4)} vs $${cost(best).toFixed(4)} per row)`);
  for (const m of ['checks', 'rubric']) if (below(delta('train', m), floor.train[m])) fail.push(`${m} went down on train beyond noise`);
  return { fail, report, won };
}
