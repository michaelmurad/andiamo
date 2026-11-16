# Run 2: grounded becomes a winning metric (user decision, 2026-11-15)

## Why
Run 2's baseline passes nearly every checks and rubric line (train: checks 0.778 only from two judgment-call
exclusions, rubric 0.944; test: checks 0.923, rubric 0.872), so rounds can't win on them. Three changes across both
runs that tie reasons to the place descriptions each raised `grounded` on held-out cases beyond its floor
(+0.106, +0.054, +0.072; floors about 0.06). The user chose: let grounded win a round, run one round targeted at
it, then stop.

## Change
compare-lib.mjs `decide()`: a round wins if checks, rubric or grounded improves on test beyond its floor. Unchanged
holds: test checks may not drop at all; test rubric not beyond noise; style, specific, shortlist failures, latency,
cost. Added hold: train grounded may not drop beyond noise. Tests: a grounded-only gain is kept; a grounded gain
with a train rubric drop is reverted.

## Caveats
- grounded's judge agreed with a Claude-written key 81% of the time on a blind set; a grounded-only win is
  reported with that caveat.
- Run 2 round 1 (v1) stays REVERT: it would also fail under the new rule (train rubric -0.074, beyond its floor).
- Two train exclusions rely on judgment beyond the descriptions (mobility: Piazzale Michelangelo, whose
  description doesn't mention a climb; vegetarian: Via Drapperie, described with pasta makers as well as
  butchers). Left as is; noted for the final report.

## Review (scoped, fresh agent): APPROVE, with fixes applied before the user's approval
- N1: the "grounded gain with a train rubric drop" test never made grounded win; fixed (it now wins on grounded and
  fails only on train rubric). Added a test for the train-grounded hold; mutation-checked (fails with the hold removed).
- N2: the lockbox verdict now also requires grounded not to fall when the best round won on grounded; the 81% caveat
  is printed with any grounded KEEP and stored in decision.json.
- N3 (not changed; reported): grounded can rise because reasons say less about fit, and `specific` doesn't stop
  that. A grounded KEEP is reported as "fewer unsupported claims", with the winning round's reasons shown.
- N5: max_round = 2 in loop-config.json (hashed); compare.mjs refuses to decide later rounds.
- N6: docs updated.
