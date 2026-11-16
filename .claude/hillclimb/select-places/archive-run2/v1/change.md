Treat what the notes rule out as a hard filter, judged by each place's description; no workarounds.

Analyzer (run 2, train split only): every train `checks` failure and every train rubric miss (vegetarian x2,
mobility x2; 4 of 18 reps) keeps a place whose description conflicts with a stated restriction and justifies it
with a workaround the description doesn't state ("ask for meat-free pasta fillings"; "reach ... by bus or taxi,
with no hike required"; "a small, level ... town ... easy to enjoy by car").

Change: one rule - restrictions in the notes are hard filters judged by the description as written; no
workaround reasons; claim suitability only if the description says so; refill to at least 10.
Expected: train checks 0.778 -> up to 1.0, rubric and grounded up; held-out cases with exclusions should gain.
Risks: soft preferences over-applied as exclusions; lists short of 10 under strict restrictions.
