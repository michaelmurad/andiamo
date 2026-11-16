# Review 4: BLOCK

Fresh reviewer agent, same brief. Findings and what changed.

## Blocking

**B1. The lint only catches exact text; paraphrased case answers pass, and nothing enforces train-only inputs.**
- Partly fixable. Added a per-round semantic leak audit by a fresh agent with a fixed brief
  (evals/select-places/leak-audit.md) that judges the prompt diff against cases.yaml and lockbox.yaml. The
  headline result becomes the lockbox delta.
- Not fixable here: agents with file access can read the case files. Recorded as residual risk in metrics.md
  and _state.json; the decision to accept it is the user's.

**B2. compare.mjs depended on hand-edited, unprotected state.**
- compare.mjs writes `best` itself on KEEP; refuses on harness sha mismatch (via the runner's new
  --check-harness), mixed prompt versions (per-row prompt fingerprint; the runner also refuses to mix prompts in
  one variant directory and snapshots prompt.yaml), an unchanged prompt, or missing reps.
- Splits, reps and locked model moved to evals/select-places/loop-config.json, in the checksum. Noise floors are
  computed from baseline rows on every run instead of stored.
- The rule moved to compare-lib.mjs and is unit-tested.

## Non-blocking
1. errors.jsonl only grows. Fixed: only failed attempts with no later scored row count.
2. Winner's curse. Agreed; the lockbox delta is the headline.
3. No lockbox tool. Fixed: `npm run eval:compare -- --lockbox vN`; prompts are snapshotted per variant, so the
   baseline prompt is recoverable. The lockbox baseline runs before round 1.
4. Timing regex holes. Fixed: tonight, today, tomorrow, nightly, nightlife, nighttime, late-night, after dark,
   bedtime, sundowner; tests added.
5. No cost hold. Fixed: mean cost per row at most 1.5x best.
6. Train hold used test floors. Fixed: separate floors per split.
7. Report pooling. The headline comes from compare.mjs and the lockbox, not report.html.

## User decision (2026-11-15)
The user accepted B1's residual risk (agents can read the case files; leaks are caught at the output by the lint
and the per-round leak audit, and the lockbox delta is the headline) and asked for a verification review of the
other fixes rather than a full re-review.
