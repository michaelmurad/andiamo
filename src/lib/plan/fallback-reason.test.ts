import { describe, expect, it } from "vitest";
import { mentionsTiming } from "@/lib/ai/select";
import { PLACES } from "@/lib/data/places";
import { fallbackReason, ROUND_OUT } from "./fallback-reason";

describe("fallbackReason", () => {
  it.each([
    // Advice first, then a clause with a time: the head of that clause is the reason.
    [
      "Combine with the Colosseum on the same ticket — the Forum is where the city actually happened, and walking through it in the quiet early morning feels genuinely ancient.",
      "Roman Forum",
      "The Forum is where the city actually happened.",
    ],
    // A dash-separated fragment becomes a full sentence.
    [
      "The Rome flagship of the Italian food superstore — useful for stocking up on olive oil. Not a substitute for the real markets.",
      "Eataly",
      "The Rome flagship of the Italian food superstore.",
    ],
    // A travel time is skipped for the next clause.
    [
      "15 minutes from Modena by bus — the Enzo Ferrari Museum is actually beautiful, not just a car museum.",
      "Ferrari Museum",
      "The Enzo Ferrari Museum is actually beautiful, not just a car museum.",
    ],
    // Timing words from the place's own name are allowed, as for the model's reasons.
    [
      "The fountain lit at night is a completely different experience from the daytime chaos — walk here after a late dinner.",
      "Trevi Fountain by Night",
      "The fountain lit at night is a completely different experience from the daytime chaos.",
    ],
  ])("picks a reason from %j", (description, name, expected) => {
    expect(fallbackReason(description, name)).toBe(expected);
  });

  it("never uses the tail of a list", () => {
    const why = fallbackReason("A 3-hour morning cooking class in a home kitchen — learn to make tagliatelle, tortellini, and tiramisu from a local nonna.", "Cooking Class");
    expect(why).toBe(ROUND_OUT);
  });

  it("says something plain when nothing in the description is a reason", () => {
    expect(fallbackReason("Go before 11am. Book ahead.", "Market")).toBe(ROUND_OUT);
  });

  it("gives every place in the dataset a full sentence that promises no time", () => {
    for (const p of PLACES) {
      const why = fallbackReason(p.description, p.name);
      expect(why, p.id).toMatch(/^[A-Z0-9'"].*[.!?…]$/);
      expect(mentionsTiming(why, p.name), `${p.id}: ${why}`).toBe(false);
    }
  });
});
