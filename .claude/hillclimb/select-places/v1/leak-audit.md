LEAK AUDIT: PASS

The edit replaces "pick and rank places exactly as you otherwise would" with a general selection rule (drop a place whose name or main offering is something the notes rule out; keep one where it is one choice among many), which is an instance of "honour every constraint the traveller states" and names no traveller situation, city, place, place type or rubric threshold.

Considered and judged general, not a leak:
- "leave out a place whose name or main offering is something the notes rule out". Closest match is `vegetarian` (cases.yaml lines 112-113, the comment "053 and 092 are named after prosciutto; 046's description is butchers...") and its lockbox twin `lock-bologna-no-pork` (lockbox.yaml line 53). The rule does not mention diet, meat, pork, cured meat, Bologna or any market or shop type; it applies equally to `no-museums`, `mobility`, `rainy`, `kids` and any trip with a restriction in its notes. Someone who had read no case could write it from the product brief.
- "a place where that is one choice among many can stay". A generic guard against over-cutting; it encodes no case's answer or threshold.
- No rubric line's threshold or ranking condition (top five, at least N, include_any) is restated. The `version: 3` -> `version: 4` bump is bookkeeping.
