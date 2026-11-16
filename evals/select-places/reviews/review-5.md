# Review 5 (verification of review 4): BLOCK

## Blocking
**B1. Float rounding at the noise floor let a one-rep flip KEEP** (228 of 684 configurations in the reviewer's
sweep). Fixed: compare-lib.mjs compares with a 1e-9 margin on every threshold. Re-running the sweep at real
split sizes (9/13, 13/9, 7/11 cases): 0 of 164 one-rep-flip rounds kept. Boundary test added.

**B2. The lockbox comparison didn't check which prompts or cases it compared.** Fixed: compare --lockbox refuses
unless the lockbox baseline ran on the main baseline's prompt, lockbox vN ran on vN's prompt, vN is the recorded
best, and the case ids equal lockbox.yaml's.

**B3. Decision inputs in unprotected state.** Fixed: prices moved to loop-config.json (hashed) and used by both the
runner and compare; a model with no price makes compare refuse rather than zero the cost; `state.best` is
cross-checked against the prompt fingerprint compare recorded for it.

## Non-blocking
1. Timing regex holes. Fixed: plurals of meals, lunchtime, dinnertime, midnight, overnight, weekdays,
   weeknights, "10 p.m."; tests added.
2. --check-harness created directories. Fixed: it now only reads.
3. A reverted prompt could be re-run under a new number. Fixed: compare refuses a prompt already scored in any
   earlier round.
4. Runner summary dropped truncated rows. Fixed: it averages all rows, like compare.
5. Tests not in the checksum. Fixed: the three test files are in harness_paths.
