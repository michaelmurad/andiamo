# Review 1: BLOCK

Fresh reviewer agent, brief `evals/select-places/reviewer.md`. Summary of its findings and what changed.

## Blocking

**B1. Calibration holdout used to choose judge wording; judge examples taken from real outputs.**
"worth it as a splurge" and "skip the upper floor" in judge.yaml came from holdout outputs; v4→v5 was chosen
after seeing holdout disagreements; tune and holdout shared cases and reasons; key not labelled by a person.
- Fix: judge examples rewritten as invented phrases; both pilot sets reclassified as tune data; a new blind
  holdout of fresh outputs for 5 calibration-only trips (calibration/cases.yaml), labelled before the judge saw
  them, scored once (v7: 88.2% agreement; see metrics.md). Brief and key now say "labelled by Claude".

**B2. Judge gameable: access claims could be phrased as opinions.**
- Fix: judge v6+ treats any statement about effort, access, diet or mobility suitability as a fact; mobility
  case now excludes Piazzale Michelangelo, Boboli, Chianti by bike, San Miniato and Pienza by id.

**B3. Vegetarian case rewarded describing meat places as vegetarian.**
- Fix: Via Drapperie (butchers, mortadella) excluded by id; rubric line now "No food pick's description
  centres on meat, fish or cured meat."

**B4. Truncation and timeouts dropped out of the means; refusals scored 0 (inconsistent).**
- Fix: truncation, refusal and production-timeout now all score 0 on every metric (production falls back to a
  plan with no AI picks in all three); `outcome` recorded per row.

## Non-blocking

- N1 duplicate ids passed count and price checks. Fixed: duplicates fail valid_ids; counts and price share use
  distinct ids.
- N2 checks that can never fail. Fixed: prompt-injection's Hard Rock exclusion removed; lake-como rubric now
  "a Lake Como pick is in the top five". (conflicting-hub's line is about reasons, which in_hub doesn't check;
  kept.)
- N3 empty claims list passed grounding. Fixed: the judge must list at least one claim per non-empty reason, or
  it is retried.
- N4 style check is trivial ("you" anywhere). Not changed: it measures exactly the prompt's stated format rules.
- N5 place_100 tag `local_favorite`. Already normalised by the data layer; the catalog and judge see
  `local-favorite`.
