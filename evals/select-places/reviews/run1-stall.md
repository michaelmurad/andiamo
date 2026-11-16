# Run 1 stall and eval fix (2026-11-15)

Run 1 (13 train / 9 test): baseline, v1 REVERT, v2 REVERT (both decided by compare.mjs). Archived in
.claude/hillclimb/select-places/archive-run1/.

## Why it stalled
1. auto-art's rubric ("Most picks are art museums or galleries") was impossible: no hub has more than 5 plannable
   museums, and a shortlist has at least 10 picks. It scored 0 under every prompt.
2. florence-art's rubric ("at least seven" art places) was impossible: Florence has 6.
3. With 9 test cases, `checks` could never clear its noise floor (headroom 0.167 < floor 0.218), so only rubric
   could win a round, with headroom 0.148.

## Changes (user chose "fix eval, restart")
- auto-art: hub_in Florence or Milan; "At least four picks are museums or places tagged art."
- florence-art: "At least five ..."
- feasibility.test.ts: every counted rubric threshold in cases.yaml and lockbox.yaml is checked against the data.
- Split redrawn at random, stratified by tags[0] (seed split-seed-2, 40% train): 9 train / 13 test.
- Cases that run-1 analyzers read and that are now in test: no run-1 analysis or change.md is given to run-2
  analyzers; they see only run-2 train data.
- The lockbox and judge are unchanged, so the lockbox baseline (same prompt) still stands.
