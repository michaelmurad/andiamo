# Review 2: BLOCK

Fresh reviewer agent, same brief. Findings and what changed.

## Blocking

**B-1. Truncation and refusal still became error rows.** The SDK's structured-output parser throws on invalid or
cut-off JSON, so those cases left the means.
- Fix: `parseOutput` in src/lib/ai/select.ts reads structured output without throwing (create + safeParse);
  invalid or cut-off output is a null shortlist with its stop_reason, scored 0. The judge uses the same path,
  so a truncated judge reply is retried. The run summary prints error rows and warns when means cover fewer
  rows than planned. Tests: `parseOutput` returns null for cut-off, prose, wrong-shape and missing output.

**B-2. Holdout not blind to judge wording.** The sorbet example predates the holdout outputs (written for judge
v3, before they existed; the model under test never sees judge text), but the holdout trips' themes
(wheelchair, vegan) were chosen after writing themed examples.
- Fix: judge v8 uses only theme-neutral invented examples; a second blind batch (calibration/cases-2.yaml) was
  generated after v8 was frozen, labelled before the judge ran, and scored once.

**B-3. Answer key edited towards the judge.** Correct: two tune labels were added after seeing judge flags.
- Fix: both reverted. metrics.md no longer argues that holdout disagreements were key errors.

**B-4. `grounded` rewards reasons that say nothing.**
- Fix: new code metric `specific` (a reason must mention something distinctive from the description beyond
  the name). It passes 97% of past reasons; the ones it fails are genuinely vague.

**B-5. Checksum didn't cover the dataset.**
- Fix: harness_paths now includes src/data/italy.json, the data layer, settings and the calibration files.

## Is `grounded` trustworthy enough to steer? (reviewer: no)
Agreed. The blind batch-2 result is 81.3%. `grounded` is now a guardrail only (a drop of more than 0.10 reverts
a round); the loop targets checks, rubric, specific and style. See metrics.md.

## Non-blocking
- Eval retries 429/5xx more than production. Kept: those are infra failures, recorded per row, not quality.
- Judge not told a pick is a day trip. Fixed: the pick line says so.
- metrics.md "one retry" wording. Fixed.
