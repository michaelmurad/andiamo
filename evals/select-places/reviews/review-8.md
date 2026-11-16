VERDICT: BLOCK

# Review 8: `vegetarian` and `mobility` cases (evals/select-places/cases.yaml:108-130)

The change takes place_046 (Via Drapperie) out of `vegetarian`'s exclude_ids and place_027 (Piazzale Michelangelo)
out of `mobility`'s exclude_ids. It replaces each exclusion with a conditional rubric line ("If X is picked, ...")
and adds the carve-out "Apart from Via Drapperie," to vegetarian line 2. Both cases are in the train split
(loop-config.json). `npx vitest run evals`: 73/73 pass. The select.ts revert is confirmed: `schedulesToday` is gone.

## Blocking findings

### 1. mobility: the dataset itself puts Piazzale Michelangelo on a hike, and the scheduler walks the cane user up it (cases.yaml:126-130)
The change rests on the claim that "its own description is only a viewpoint". But the dataset is the source of
truth, and it says more. place_040 San Miniato al Monte, which this case excludes for exactly this reason, says:
"Hike up past Piazzale Michelangelo to this 11th-century Romanesque church". By the dataset's own account, 027 is
partway up that hike.

Production makes it concrete. The scheduler has no elevation and no mobility rule (`src/lib/plan` never reads the
notes for access). It plans any leg up to 1.2 km straight-line as a walk (`src/lib/geo.ts:25,38`). Measured with
`travel()` to place_027:

| From | Result |
|---|---|
| Santa Croce | walk, 10 min |
| Osteria dell'Enoteca | walk, 13 min |
| Uffizi | walk, 15 min |
| Bargello | walk, 16 min |
| Palazzo Vecchio | walk, 16 min |
| Ponte Vecchio | walk, 17 min |
| Buca Mario | walk, 18 min |

These are typical companion picks for a `history, outdoors` Florence trip. So a shortlist that includes 027 gives
"My dad walks with a cane" an uphill walk of 10 to 18 minutes in the real plan.

The case can no longer catch that:
- The constraint is gone.
- New line 3 only checks the reason's wording.
- Line 2 ("reachable without much walking") is graded under "Don't rely on outside knowledge" (judge.yaml). 027's
  description says nothing about access, so the judge has nothing to fail it on.

027 is iconic and rated 4.6, so planners will pick it. A pick that used to fail `constraints` now scores full
marks. That is a score gain with no real improvement.

The rubric also rewards the wrong reasons. The calibration labels show what the planner already writes for 027 in
this exact case: "a taxi or bus drops you right at" (grounding-labels.yaml:34) and "a taxi or bus brings you right
to ... no hike" (:56). Those reasons pass new line 3 and argue the judge into passing line 2. Only `grounded`
penalises them. So the change opens a trade where an invented access claim buys rubric points. That is brief item 3
(gameable judge).

The `rainy` case still excludes 027. That's consistent on its own terms (rain, outdoors), so it isn't the problem.
The mobility exclusion was correct by the dataset's standard.

**Fix:** restore place_027 to mobility's exclude_ids. Remove line 3, and fix the comment to cite place_040's
description.

### 2. Conditional lines pass vacuously and dilute the rubric score (cases.yaml:118, :130; grade.ts:328-330)
The rubric score is `passed / c.rubric.length`. If the named place isn't picked, the "If X is picked" line is
true, so it is a free 1/3 in both cases. Before the change, vegetarian and mobility each had two lines and no free
point. Now:
- Failing a real line costs 1/3 instead of 1/2, so every real failure in these cases moves the headline less.
- The report shows "✓ If Via Drapperie is picked, ..." as if something was checked.

Nothing tells the judge how to grade an inapplicable conditional. There is no N/A option, and calibration covers
grounding only, not rubric verdicts. So whether a vacuous line comes back true, false, or inconsistently across
reps is unmeasured noise in a compare decision.

Fix (a harness change in grade.ts): give a line an applicability field, e.g. `{ text, if_picked: place_046 }`, and
leave it out of the denominator when the place isn't picked. Or express the condition as a code check.

### 3. vegetarian: the carve-out plus line 3 turn a meat-centred pick into a full pass, and line 3 asks for a claim the prompt forbids (cases.yaml:117-118)
place_046's description: "packed with butchers, fishmongers, pasta makers, and deli counters stacked floor to
ceiling with tortellini and mortadella ... eat as you walk." The carve-out exempts it from line 2, the only line
that looks at what a pick is rather than how its reason reads. Its fitness for a vegetarian then rests only on
line 3, which grades wording.

Concrete pass: rank 046 #1 with "You browse the street's pasta makers in Bologna's medieval market quarter."
- Line 1 passes: no meat dish is recommended.
- Line 2 passes: 046 is carved out.
- Line 3 passes: pasta is the only vegetarian food in the description, and the judge may not use outside knowledge
  to say Bologna's fresh pasta is mostly meat-filled tortellini.

So a vegetarian shortlist led by a butcher-and-mortadella street gets full rubric marks. Bologna has very few
vegetarian-plausible food places (046, 054 gelato, 087 cooking class; 050 is charcuterie), so 046 is likely to be
picked once allowed.

Line 3 ("points to what vegetarians can eat there") also conflicts with the prompt's own rule
(select-places.yaml:22): claim a fit with the notes only if the description says so, otherwise leave the fit
unsaid. 046's description says nothing about vegetarians. The calibration labels show where that pressure leads:
"produce and cheeses" (grounding-labels.yaml:29) and "produce stalls ... cheese counters" (:49) are both invented.
Rubric and grounding now pull in opposite directions on the same reason, and the loop can trade one against the
other.

**Fix:** either restore 046 to exclude_ids and drop the carve-out and line 3, or keep it allowed but un-exempt it.
The second option means removing "Apart from Via Drapperie," and replacing line 3 with something checkable, e.g.
"No reason for Via Drapperie claims vegetarian options beyond its pasta makers." I recommend restoring the
exclusion. It is also what the lockbox does (see 4).

## Non-blocking findings

### 4. Train and lockbox now disagree about the same place (lockbox.yaml:53)
`lock-bologna-no-pork` hard-excludes 046 for the same reason (mortadella), while `vegetarian` now allows it with
the right framing. A prompt that learns "frame meat markets by their pasta for dietary notes" gains on train and
loses on the lockbox. That drop would read as overfitting when it's really an inconsistent answer key. Restoring
the exclusion (fix 3) removes the conflict without touching the lockbox.

### 5. cases.md is stale
cases.md lines 16-17 show neither the new rubric lines nor the remaining mobility exclude_ids (034/035/040/089),
and they show a different vegetarian line 2. Anyone reviewing from cases.md sees the wrong cases. Regenerate it or
mark it non-authoritative.

## Leakage: none found
- The planner sees only `prompts/select-places.yaml`, filled with `{{catalog}}` and `{{request}}`. No rubric text
  reaches it.
- `lintPrompt` (grade.ts:73-90) rejects place names, ids and verbatim rubric lines in the prompt. So "Via
  Drapperie" and "Piazzale Michelangelo" can't be written into it.
- The analyzer does see these place-named lines in train-split judge explanations, which is by design. The new
  lines are place-specific and invite paraphrased rules like "for dietary notes, frame markets by their pasta
  stalls". Only the semantic leak audit stands between those and the prompt. Fixes 1 and 3 remove the
  place-specific lines and with them that risk.
