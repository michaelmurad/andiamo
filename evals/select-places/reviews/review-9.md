VERDICT: APPROVE

# Review 9: timing guard adds `first light|day-?break` (src/lib/ai/select.ts:146, select.test.ts:33-35)

The change adds one alternation inside the existing `\b(...)\b` group, plus three must-flag test rows.
`npx vitest run src/lib/ai`: 43/43 pass. All examples below were run through the real `mentionsTiming` with
`npx tsx`.

## The coordinator's claims, checked
- **No place name or description contains the new phrases.** Regex scan of src/data/italy.json for
  `first light|day.?break|crack of dawn|first thing`: no hits. So the place-name allowance can't pick these up.
- **No stored output contains them.** `grep -rliE "first light|day.?break"` over .claude/hillclimb/select-places
  (all results.jsonl and traces) finds nothing. Past `no_timing` scores can't change.
- **Direction is safe.** The change only adds matches, so it can only make `no_timing` stricter. The loop can't
  use it to report a gain that isn't real.

## How `\b` handles the hyphen
- `day-?break` works as intended. "daybreak" and "day-break" flag. The closing `\b` stops "Daybreaker" and
  "day-breaking" from flagging.
- The hyphen does cause one false positive. `\b` counts as a boundary between "t" and "-", so "first light"
  followed by a hyphenated compound flags:
  - `The first light-filled nave in Florence.` → **true** (false positive)
  - `Caravaggio's first light-and-shadow masterpiece.` → **true** (false positive)
  These are plausible art reasons. They cost a check, but only in the strict direction. Fix: `first light(?!-)`.
- Hyphenated or spaced variants of the timing sense are missed:
  - `first-light views` → false
  - `at first-light` → false
  - `Day break over the lagoon.` → false
  Fix: `first[- ]light(?!-)` and `day[- ]?break`. A spaced "day break" almost never means anything except dawn.

## Other false positives checked: none
- `A gallery that first brought light into Gothic churches.` → false
- `Brunelleschi's first lighthouse design.` → false
- `A firstlight cafe.` → false
- `Seen in a first light reading of the text.` → true. That's a false positive, but contrived. No reason in any
  stored run uses "first light" as a metaphor, and this dataset gives reasons little cause to.

## Variants
- **`crack of dawn`**: already flagged through `dawn`, and so is `Pre-dawn calm.` No change needed.
- **`twilight`**: `At twilight the canal glows.` → false. It's a time of day as plainly as "dusk". Neither the
  dataset nor any stored output uses it in another sense. Worth adding.
- **`at opening` / `when it opens` / `as the doors open`**: all false. These promise a time (opening), and the
  scheduler decides that. A narrow `\b(at|by|from) opening( time)?\b` would catch them without matching "the
  opening of ...". Optional.
- **`first thing` and `early`**: don't add these. "the first thing you see" is a common non-timing use. "early"
  appears in the dataset as "early Christian mosaics" (place_098), and "early Renaissance" is everywhere in art
  reasons. Either would over-flag heavily.
- **Still missed, not regex-shaped**: `as the sun comes up`, `before the city wakes`, `A perfect start to the day.`
  and `End the day here.` all → false. A word list can't catch these reliably. That's what the prompt rule is for.
  No action.

## Non-blocking finding: the revert dropped all "today" test coverage
`today` is in TIMING (select.ts:143), but no test anywhere flags it. `grep -i today` over src/lib/ai/*.test.ts and
evals/select-places/grade.test.ts finds nothing. The review-7 change had added rows like `Today you eat here.` and
`Go today, before it closes for the season.`, and reverting the change removed them too. Without them, a future
edit could drop `today` from the regex (or bring back a loophole like review-7's) and every test would still pass.
Add back at least `Today you eat here.` and `Still open today, so make it your first stop.` as must-flag rows.

## Summary of suggested follow-ups (none block)
1. `first[- ]light(?!-)` in place of `first light`, and `day[- ]?break` in place of `day-?break`. Add tests:
   flag `at first-light` and `Day break over the lagoon.`; allow `The first light-filled nave in Florence.`
2. Add `twilight`. Optionally add `(at|by|from) opening( time)?`.
3. Restore must-flag test rows for "today".

## Addendum: follow-ups applied (re-checked)

APPROVE. All three follow-ups are in. Optional item 2b, `at opening`, was skipped, which is fine.

- select.ts:146-147 now holds `...|golden hour|twilight|day[- ]?break)\b` and `\bfirst[- ]light\b(?!-)`.
- `npx vitest run src/lib/ai`: 54/54 pass. That covers the 7 new must-flag rows, including three "today" rows,
  and the 4 new must-allow rows.
- **"twilight" is safe to add.** `grep -rliE twilight` over src/data/italy.json and .claude/hillclimb/select-places
  finds no hits. No place name triggers the allowance and no stored score changes.

Probed with `npx tsx`. Flagged:
- `first light`, `first-light`, `First-Light`, `at first light.`, `(first light)`, `first light's glow`
- `daybreak`, `day break`, `day-break`
- `twilight`

Allowed:
- `first light-filled`, `first-light-filled views`, `firstlight`, `first lighting`
- `daybreaker`, `day breaks`

### Residual misses and false positives (non-blocking; all rare in model output)
- **Typographic variants miss.** `first‑light` (U+2011 non-breaking hyphen), `first–light` (en dash) and the
  double-spaced `first  light` and `day  break` all → false. If a hyphen is wanted, `[-‑ ]` would cover
  these. Optional.
- **Plural and adjective forms of twilight miss.** `twilights` and `twilit canals` → false. Use `twilights?` and
  add `twilit` if wanted.
- **Two new false positives.** `a day break from the city` and `Twilight Zone bar` → true. Both are contrived, and
  neither phrase appears in the dataset.
