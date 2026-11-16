# select-places improvement loop: final summary

**Adopted (user decision, 2026-11-15):** run 2's v2 prompt is now prompts/select-places.yaml, overriding the
rule's REVERT. compare.mjs's records are unchanged. Lockbox on the adopted prompt (6 cases x 2 reps, compared by
hand because compare.mjs only checks state.best): checks 0.833 -> 0.833, rubric 1.000 -> 0.917, grounded 0.872 ->
0.994. The rubric drop is one run: lock-bologna-no-pork rep 1 recommended tagliatelle al ragù and also picked the
excluded Cheese and Prosciutto Tour. One run in twelve is too few to call a regression, but it is a real miss.

**Run 3 baseline (2026-11-15, adopted prompt, grader approved at abf868a7c280; run 2 moved to archive-run2/).**
Test: checks 0.923, rubric 0.872, grounded 1.000 (run 2 baseline on the old prompt: 0.923, 0.872, 0.843). Train:
checks 0.722, rubric 0.889, grounded 1.000 (old: 0.778, 0.944, 0.808). Cost $3.23. A regression the case-level
checks hide: for vegetarians, the adopted prompt picks both Parma prosciutto places (053, 092) in 4 of 4 runs
across runs 2 and 3; the old prompt picked neither (it failed only on Via Drapperie). The lockbox no-pork miss is
the same pattern. Likely cause: "pick and rank places exactly as you otherwise would" together with "leave the fit
unsaid" keeps meat places in and only softens how they are described.

**Run 3 round v1 (selection fix): REVERT.** Change: the grounding rule's last sentence became "This rule is about
wording, not selection: leave out a place whose name or main offering is something the notes rule out ...; a place
where that is one choice among many can stay." Leak audit PASS. Test checks +0.077 (floor 0.204), rubric 0.000,
grounded -0.005; no metric beat its floor. Per case: vegetarian dropped both prosciutto places in 2 of 2 runs (left
only Via Drapperie, like the old prompt), but the case still fails, so neither checks nor rubric move. Mobility did
not improve: it still kept Piazzale Michelangelo and Pienza, and added Boboli. The prompt is back to version 3.
Cost $3.15. Checks' floor on this baseline (0.204) is wide, so check gains under about four cases can't register.

| run | round | change | test checks | test rubric | test grounded | decision |
|---|---|---|---|---|---|---|
| 1 (13/9 split) | baseline | prompt v2 | 0.833 | 0.852 | 0.843 | - |
| 1 | v1 | drop places conflicting with the notes | +0.056 | -0.056 | +0.106 | REVERT (no target gain) |
| 1 | v2 | interests set the mix | +0.056 | 0.000 | +0.054 | REVERT (no target gain) |
| 2 (9/13 split, fixed cases) | baseline | prompt v2 | 0.923 | 0.872 | 0.843 | - |
| 2 | v1 | restrictions as hard filters | 0.000 | -0.013 | +0.072 | REVERT (train rubric -0.074) |
| 2 | v2 | facts only from description or tags (wording) | -0.038 | -0.019 | **+0.157** | REVERT (test checks -0.038, see below) |

Noise floors (run 2, test): checks 0.038, rubric 0.038, grounded 0.068. Spend: about $20.30 in eval runs plus about
$1-2 of judge-only calibration, against a $25 budget. Lockbox baseline: checks 0.833, rubric 1.000, grounded 0.900
(12 runs); no round won, so there is no final-prompt lockbox comparison.

**Recommended change.** None was kept by the rule, and the shipped prompt is the baseline (version 2). The strongest
candidate is run 2's v2 (`.claude/hillclimb/select-places/v2/prompt.yaml`): one wording rule that every fact in a
reason must come from the place's description or tags. It raised grounded beyond noise on both splits (test
+0.157, train +0.184) with checks flat on train and rubric within noise on test. It was reverted for one test
check: the reason "A 16th-century marble arch over the Grand Canal, still stunning today." tripped the timing guard
on "today", which here means "nowadays". That word was added to the guard after review 5; it is a grader false
positive, not a planner regression. Adopting v2 is the user's call: it overrides the rule's decision.

**Versus baseline.** On held-out cases the baseline already passes 92% of hard checks and 87% of rubric lines; the
remaining failures are few and partly judgment calls in the cases themselves. The consistent, measurable gain
available is in reason accuracy: every change that tied reasons to the descriptions raised grounded beyond noise
(4 of 4 tries). A hand check of v2 found the gain is real, not reasons saying less: same length (12.7 vs 12.4
words) and voice (55% vs 54% address the traveller), invented accessibility claims removed ("flat, compact
basilica", "no hike required", "a tiny, level town" for a hill town), more specific facts. Cost: some fit-to-traveller
phrasing is lost (kids: "ramparts kids love exploring" became "a rooftop terrace over the Tiber"), and picks moved
slightly despite the wording-only instruction.

**Why trust this.** Decisions came from compare.mjs on files alone (tested, mutation-checked), on a held-out split
the analyzers never read, after six adversarial reviews of the harness, two blind judge calibrations, and a
feasibility test that caught two impossible cases. Limits: grounded's judge agreed with a Claude-written key 81% of
the time on a blind set; nine to thirteen test cases make the floors coarse; agents could read the case files
(accepted risk, mitigated by a lint and a per-round leak audit; all leak audits passed).

**What else was tried, and next.** Run 1 stalled on two impossible rubric lines and a 9-case test split; both were
fixed and the run restarted. Next steps worth taking: (1) and (2) were tried and blocked
by review (reviews 7 and 8): narrowing "today" let real promises through ("Still open today, so make it your first
stop."), and both exclusions are supported by the data (San Miniato's description puts a hike past Piazzale
Michelangelo; Via Drapperie is mostly butchers and mortadella), so the guard and the cases stand as they were; (3) have a person label ~60 reasons
so grounded can be trusted as a full target; (4) add harder cases, since the baseline is near the ceiling on these.

## Run 3: the model ranks the whole hub (adopted by the user)

**What changed.** A trip of 16 to 22 stops uses most of a hub's 15 to 29 places, so a 10-15 pick shortlist barely
shaped the plan: the scheduler filled the rest from scores that never saw the notes, and "no museums" still got a
museum. The prompt now ranks every suitable place and returns an `avoid` list from the notes, which the scheduler
never plans (prompt v4, then v5 to keep price out of `avoid`, then v6 to narrow picks and apply the timing rule to
every reason).

**The grader changed with it.** Exclusions are checked on the trip the scheduler plans from the answer (avoid list
applied); must-include places, price share and the judge's rubric read the top 15 picks, the old shortlist's
size; timing, style and specific cover every pick. The judge prompt is unchanged. The run-3 baseline and v2 were
regraded from their traces into `regrade-top15/`.

**Result.** v6 (variant v3) against the regraded baseline: checks +0.115 test, +0.111 train; constraints on the
planned trip 0.77 to 0.88 test; rubric -0.058 test, within noise; style +0.22. The rule said REVERT because no
win metric cleared the test noise floor (0.151); the user adopted v6 anyway. Still failing: Via Drapperie on the
vegetarian trip, Piazzale Michelangelo and the Pienza day trip for the cane walker, a splurge on the student
budget (price never fills `avoid`), and St Mark's and the Doge's Palace ranked 13-14 for quiet Venice trips.
