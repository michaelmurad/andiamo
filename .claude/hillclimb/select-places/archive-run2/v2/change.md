Ground every fact in a reason in the place's description or tags; wording only, picks and order unchanged.

Analyzer (run 2, train only; target grounded under the user's run-2 rule): 14 of 18 train reps have unsupported
claims, from two habits: (A) asserting a place fits the notes when its description doesn't say so - "Flat, compact
basilica", "ask for vegetarian fillings", "a short ... visit" (11 reps); (B) outside knowledge - "built over an
ancient stadium", "Rome's oldest road" (8 reps). Round 1 raised grounded but changed which places were picked,
which cost rubric; this change is wording only.

Change: one rule - facts only from the description or tags; build each reason on a stated detail; claim fit to the
notes only when the description says so, otherwise name what it offers; pick and rank as before.
Orchestrator edit: the proposal excluded tags as a source; tags are part of the dataset and count as support for
the judge, so they are allowed.
Expected: grounded up (train ~0.81 -> 0.90+); rubric, checks and specific hold. Risks: the model re-picks anyway;
reasons get longer or vaguer.
