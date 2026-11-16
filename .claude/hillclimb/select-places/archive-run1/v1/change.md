Filter out places that conflict with the traveller's stated needs instead of padding or arguing them in.

Analyzer (train split only): the only train `checks` failures (vegetarian, both reps) and two of the four
rubric-losing cases (vegetarian, honeymoon; 4 of 26 reps) share one behaviour: places whose descriptions centre
on something the traveller can't or won't do are kept, often at the bottom of the list, with reasons that argue
them in ("ask for vegetarian fillings when booking"; tourist-heavy sights added at #11-#14 for a quiet trip).

Change: two rules in the system prompt (read settings and notes as constraints and drop conflicting places,
still returning at least 10; never argue a conflicting place in). Orchestrator edit to the proposal: "never fill to
15" replaced by "still returning at least 10", to avoid failing the 10-pick check.
Expected: checks and rubric up on constrained cases; grounded up slightly; style and specific unchanged.
Risks: over-pruning on loose cues; fewer than 10 picks on tight cases.
