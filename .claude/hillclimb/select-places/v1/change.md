# Round change: select-places v3 -> v4 (focus: restrictions in the notes)

## Diagnosis

The hypothesis holds. When the notes rule something out, the model keeps the conflicting places in its list and ranks them where it would anyway. It then writes each reason around only the parts of the description that don't conflict. That is the grounding bullet working as written: "leave the fit unsaid" plus "This rule is about wording only: pick and rank places exactly as you otherwise would" tell the model to fix the wording and leave the selection alone. The model can leave a place out when the whole place conflicts: both vegetarian reps drop the place built around a meat sauce. What it misses is places whose name or main feature conflicts but which have a usable side detail.

Trace citations:

1. `traces/vegetarian_rep0.json`, pick #4 `place_046`. The description says the street is "packed with butchers, fishmongers, pasta makers, and deli counters … mortadella". The reason keeps only "pasta makers and deli counters". The same pick appears at #5 in `vegetarian_rep1.json`.
2. `traces/vegetarian_rep0.json`, picks #6 `place_053` and #11 `place_092`. Both have a cured meat in the place's name. The reasons talk only about the cheese (and, for `place_092`, porcini and wine). In `vegetarian_rep1.json` the same two places sit higher, at #6 and #8.
3. `traces/mobility_rep0.json`, picks #5 `place_089` and #11 `place_027`, with the note ruling out long walks and climbs. A hill town and a hilltop viewpoint are kept, and the reasons mention only the views. Pick #7 `place_103` leaves out the tower climb the description leads with. `mobility_rep1.json` keeps `place_089` at #5.
4. Control: the rows with no restriction (rome-food-art, bologna-food, night-owls) all pass `checks` and `rubric` with grounded = 1. The selection sentence only does harm when the notes rule something out.

All four failing rows have grounded = 1. The grounding rule is working; selection is what fails.

## Change

In the grounding bullet, replace the last sentence:

> This rule is about wording only: pick and rank places exactly as you otherwise would.

with:

> This rule is about wording, not selection: leave out a place whose name or main offering is something the notes rule out, rather than keeping it and describing only the rest; a place where that is one choice among many can stay.

Also bump `version: 3` to `version: 4`. This is one sentence edited and nothing else changes. The rest of the bullet still requires every fact in a reason to come from the place's description or tags.

## Why it should help

- It removes the instruction that tells the model never to let the notes change the selection. That instruction is what keeps conflicting places in.
- It names the failure directly ("keeping it and describing only the rest"), which is exactly what the cited reasons do.
- "name or main offering" covers any kind of restriction: a diet, mobility, or anything else the notes exclude.
- "one choice among many can stay" guards against cutting too much. A broad market, a menu of small dishes, or a palace with an optional climb isn't cut just because one part conflicts.

## What it could hurt

- `count_ok` / `checks`. Small hubs can run out of places. In the vegetarian case the Bologna hub has 15 places. About 4 have a conflicting name or main offering, and 1 is above the price cap, which leaves roughly 10 that fit. If the model also cuts the borderline wine bar (charcuterie plus small dishes), it falls to 9 and fails the 10-pick minimum. The "one choice among many" clause is there to stop that, but it should be watched.
- `rubric` on cases with no restriction. A model that over-reads the sentence might cut places based on preferences rather than restrictions ("we love wine" is not a restriction). The trigger is limited to what the notes "rule out", so this should be rare.
- `grounded` should stay where it is because the wording rules are unchanged. There is a small risk that the model starts writing why it kept a place ("one option among many…"), which would be an unsupported fit claim. "leave the fit unsaid" still applies.
- Mobility cases where the slope or climb isn't in the description (e.g. a viewpoint) depend on what the model knows. This change allows that knowledge in selection, but it can't make the model recognise the problem.
