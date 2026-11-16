VERDICT: BLOCK

# Review 7: `mentionsTiming` "today" exception (src/lib/ai/select.ts:159-177, select.test.ts)

Scope reviewed: `schedulesToday` and the new test rows. Before the change, every "today" was flagged. After it,
"today" passes if "still" or "even" appears anywhere earlier in the same clause (split on , ; : . ! ? ( ) en/em
dash). `npx vitest run src/lib/ai/select.test.ts`: 41/41 pass. Every example below was run through the real
`mentionsTiming` with `npx tsx`.

## Blocking findings

### 1. The exception lets scheduling promises through, and the planner can be taught to write them (select.ts:171-177)
The test is "still/even anywhere earlier in the clause", not "today used to mean nowadays". Any scheduling
sentence that contains one of those two common words before "today" passes. `mentionsTiming` returns `false`
(not flagged) for all of these:

| Reason | Returns |
|---|---|
| `Still open today, so make it your first stop.` | false |
| `Still time to go today before it shuts.` | false |
| `You can still squeeze it in today.` | false |
| `You'll still have energy for this today.` | false |
| `Still the best pick for today.` | false |
| `Still running today: book the boat.` | false |
| `Still stunning and go today.` | false (no comma, so it's one clause) |
| `A must still today` | false |
| `Even today you can catch the last tour if you hurry.` | false |
| `Even today is fine for a visit.` | false |
| `Make it your stop even today.` | false |
| `Even a short visit today pays off.` | false |
| `Even better today, while the market runs.` | false |

Each of these promises the day the scheduler puts the stop on, which is exactly what the prompt forbids (prompt
line 23) and what the scheduler can contradict. How the loop gets there: when "today" is flagged, the `no_timing`
explanation shows the optimiser the offending reason (grade.ts:180-181). The cheapest edit that clears the check
is a prompt line like "if you say today, write 'still ... today'". That raises `no_timing` without making the
reasons any less schedule-dependent. The same function blanks reasons in production (select.ts:124), so these
reasons also reach users instead of being blanked. The eval would report a gain that is really a regression.

### 2. The loosening is wider than the false positive it fixes
The only evidence is one reason: `"..., still stunning today."` Here "still" comes right before a one-word
predicate and "today" ends the clause. The change also lets through:
- "even" anywhere earlier in the clause. No run produced "even ... today", and "even" is often a scheduling
  intensifier ("even today you can...", "make it your stop even today").
- "today" in the middle of a clause, followed by more words ("still open today, so...", "still time to go today
  before...").
- Any distance between "still" and "today", and any words in between, including "you", "go" and "stop".

## Non-blocking findings

### 3. A new allowed test case contains a time of day (select.test.ts:54)
`"Even today the old fish market draws chefs at first light."` is in the must-allow list. "At first light" means
dawn, a time of day the prompt forbids. It passes only because the TIMING regex doesn't include "first light".
The test now treats that gap as correct behaviour. Replace it with a case that has no time in it, and consider
adding `first light|daybreak` to TIMING.

### 4. Remaining false positives are cheap, honest failures
`Today it houses a museum of maps.`, `As grand today as in the 1500s.` and `Unchanged since 1500 and stunning
today.` are still flagged. That's acceptable. A flagged reason costs one check on one rep in the eval, and in
production the reason is just blanked and the scheduler shows the place's own description. A missed promise is
shown to the user. Given that asymmetry, the guard should lean towards flagging.

## Recommended fix
Preferred: revert to flagging every "today" and remove the four "still/even today" allow rows. "Still stunning",
"still in use" and "to this day" say the same thing, and "to this day" already passes. The loop can fix the false
positive itself by changing the prompt, which is an honest improvement.

If an exception has to stay, make it as narrow as the evidence. Drop "even". Allow "today" only when (a) it ends
its clause, (b) the clause matches `\bstill\s+(?:[\w'-]+\s+){1,3}today` and (c) the clause contains no
second-person or scheduling cue (you/your/go/visit/stop/open/book/for/before/and...). Add every row of the table
above as a must-flag test. Even that version still lets `Still running today: book the boat.` through in my
experiment, because the imperative sits in the next clause. That's why reverting is the better fix.
