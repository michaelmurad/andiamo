# Review 3: BLOCK

Fresh reviewer agent, same brief. Findings and what changed.

## Blocking

**B1. Timeouts still became error rows.** `instanceof` failed because the runner (ESM) and the app (loaded as
CommonJS under tsx) held different copies of the SDK's error classes.
- Fix: `callSelectModel` (src/lib/ai/select.ts) catches the timeout itself and returns a call with no
  shortlist and stopReason "timeout"; `isTimeoutError` checks the class and the error name. The runner no
  longer special-cases anything. Verified end to end: the real call, loaded through tsx as in the eval, against
  a local server that never answers, returned stopReason "timeout" after 60 s instead of throwing. Unit tests
  cover the class, the name-only copy, and non-timeout errors.

**B2. The composite let `style` gains hide `checks`/`rubric` regressions.**
- Fix: no composite. evals/select-places/compare.mjs decides each round lexicographically: checks may not go
  down; rubric may not go down beyond noise; one of them must improve beyond noise. style, specific and grounded
  are holds only.

**B3. Test set visible to the loop; noise floor undefined.**
- Fix: every run lints prompts/select-places.yaml against all case files (place ids, place names, case notes,
  rubric lines) and refuses to run on a hit; tests cover each. The analyzer gets a scratch copy of train rows
  and traces only. Noise floors are computed from the baseline's two reps (`npm run eval:compare -- --noise`)
  and written to _state.json. A 6-case lockbox (lockbox.yaml) is scored only on the baseline and final prompts.

## Non-blocking
1. `specific` is easy to satisfy. Acknowledged in metrics.md; it is a hold, not a target, so it can't buy a round.
2. `grounded` hold could miss one collapsing case. Fixed: no test case may drop by more than 0.30.
3. Model not locked. Fixed: the lint requires `claude-opus-5-5` (_state.locked_model).
4. A placeholder could be dropped silently. Fixed: the lint requires {{catalog}} and {{request}}.
5. Stale runner comment. Fixed.

Also found while fixing: a lockbox price constraint (Milan, 60% at €) was unsatisfiable; the oracle test caught
it; it is now 30% (Milan has only 4 plannable places at € or free).
