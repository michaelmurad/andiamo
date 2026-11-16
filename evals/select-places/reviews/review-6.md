# Review 6 (verification of review 5): APPROVE

All review-5 fixes confirmed by experiment (20,000-candidate sweep: 0 one-rep-flip KEEPs with the margin, 3,352
without; every lockbox identity refusal fired; prices refuse on unknown models; --check-harness creates nothing).

## Non-blocking findings, fixed after the APPROVE and before the user's approval (not re-reviewed; covered by tests)
1. Boundary test used 4 cases, where the arithmetic is exact. Replaced by a 9 test / 13 train sweep that fails
   with the margin removed (mutation-checked) and passes with it.
2. A consistent edit or deletion of state.best was accepted. compare.mjs now writes decision.json into every
   round it decides and refuses unless state.best is the latest KEEP among them; a round can't be decided twice.
3. Prompt fingerprint covered file text, so a comment change made a "new" prompt. It now covers model, effort,
   max_tokens and the whitespace-normalised system and user text.
4. Timing regex: aperitivi, golden hour, teatime, "a.m.", "10 p.m" (no final dot); tests added.
5. Runner summary priced unknown models at $0 and left out error-row spend. It now throws on an unknown model and
   includes failed-attempt spend.
6. compare.mjs exited 1 (REVERT) on a crash. Crashes now exit 2, like a refusal.
7. prompts.test.ts, normalize.test.ts, parse-hours.test.ts added to harness_paths.
Also: the runner's default reps now come from loop-config.json (2).
