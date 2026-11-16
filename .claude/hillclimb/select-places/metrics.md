# select-places metrics

Each case asks the model (prompts/select-places.yaml) for a hub and a ranked shortlist with reasons.

| Metric | Kind | What it measures |
|---|---|---|
| `checks` | binary | All code checks pass (the six below). Headline. |
| `rubric` | 0–1 | Share of the case's rubric statements a Sonnet 5.5 judge marks true. |
| `grounded` | 0–1 | Share of picks whose reason makes no factual claim unsupported by the dataset (judge, per claim). Diet and access claims count as facts. |
| `style` | 0–1 | Share of reasons that are non-empty, at most 14 words and second person (code). |
| `specific` | 0–1 | Share of reasons that mention something distinctive from the place's description beyond its name (code). Counterweight to `grounded`, which alone would reward saying nothing. |
| `valid_ids` | binary | Every id exists, is plannable, and appears once. |
| `in_hub` | binary | Every pick belongs to the chosen hub. |
| `hub_ok` | binary | The traveller's hub is kept; for "Pick for me", the hub is in the allowed set. |
| `count_ok` | binary | 10–15 distinct picks. |
| `no_timing` | binary | No reason promises a day, time or meal (words from the place's own name allowed). |
| `constraints` | binary | The case's code-checked constraints hold (cases without constraints score 1). |

A timeout, refusal or truncated response scores 0 on every metric: in production each one means the traveller
silently gets a plan with no AI picks. Invalid or cut-off JSON counts the same way. Judge failures (bad or
incomplete output, retried once) go to `errors.jsonl`; the run summary prints the error count, and variants
are only compared when it is zero.

## Grounding judge calibration

Answer key: evals/select-places/calibration/grounding-labels.yaml, labelled by Claude, not by a person.

| Judge | Set | Picks | Agreement | Precision (flags right) | Recall (unsupported caught) | Status of the set |
|---|---|---|---|---|---|---|
| v3 | tune-a | 67 | 89.6% | 63% | 91% | seen while writing the judge |
| v7 | tune-c | 68 | 88.2% | 77% | 91% | was the blind holdout for v7; seen since |
| v8 | tune-a | 67 | 95.5% | 85% | 92% | seen |
| v8 | tune-b | 68 | 94.1% | 85% | 85% | seen |
| v8 | tune-c | 68 | 86.8% | 76% | 86% | seen |
| v8 | **holdout (blind, batch 2)** | 64 | **81.3%** | **75%** | **81%** | generated after v8 was frozen, labelled before the judge ran, scored once |

Two reviews found contamination in earlier calibration (judge examples drawn from holdout outputs; key labels
edited after seeing judge flags). Both were undone: themed examples removed, post-hoc labels reverted, and a
second blind batch scored once. Neither the key nor the judge was changed after that run.

**Decision: `grounded` does not steer the loop.** Agreement on the blind batch is 81%, and the disagreements
sit on a genuinely fuzzy line (is "gluten-free" plainly inferred for a vinegar tasting?) where the labeller and
the judge are the same model family. Labels written by Claude can't settle that; a person's labels could.
`grounded` is a guardrail only (see the keep rule below).

## Keep rule

The rule is `decide()` in evals/select-places/compare-lib.mjs, tested in compare-lib.test.ts. compare.mjs refuses
to decide unless the harness matches the approved sha, each round's rows all come from one prompt (fingerprinted
per row; the runner refuses to mix prompts in one directory), the candidate's prompt differs from the best
round's, every case has the configured reps, and no failed attempt is unscored. It writes `best` itself on KEEP.
Noise floors are computed from the baseline rows on every run, separately for train and test. Splits, reps and
the locked model live in evals/select-places/loop-config.json, which is in the checksum.

`npm run eval:compare -- vN` decides KEEP or REVERT from the files; see evals/select-places/compare.mjs.
`checks` on test may not go down at all and `rubric` not beyond noise; `checks`, `rubric` or (since run 2, by the
user's decision) `grounded` must improve beyond its noise floor, and train checks, rubric and grounded may not drop
beyond noise. A grounded-only win carries the judge's 81% blind-calibration caveat.
`style`, `specific` and `grounded` are holds, not targets: `style` is a format check whose headroom is
almost all "add the word you", and `specific` is a loose word match (it can't tell a copied description word
from real content), so neither may buy a round. Noise floors come from the baseline's two reps on the test
split and are written to `_state.json` (`noise`).

## Lockbox

evals/select-places/lockbox.yaml holds 6 cases the loop never scores. They run on the baseline prompt and on the
final prompt only, so the final report can show whether test-split gains carry over. Every run lints the prompt
against all case files (no place ids or names, no case notes or rubric text, model locked, placeholders kept).

## Leak control and residual risk

The loop can only edit prompts/select-places.yaml, but an agent with file access can read the case files. So
leaks are caught at the output: the runner lints every prompt for place ids, names and verbatim case text, and a
fresh leak auditor (evals/select-places/leak-audit.md) judges every round's diff for paraphrased case answers.
Neither is proof. The headline result is the lockbox delta, not the test delta: the final prompt was selected on
the test split, so its test gain is biased upward (a simulated unchanged prompt is falsely kept about 2.4% of
rounds, 9.5% over 8 rounds).
