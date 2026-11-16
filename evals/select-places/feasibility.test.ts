import { describe, expect, it } from "vitest";
import { PLACES } from "@/lib/data/places";
import type { Hub, Place } from "@/lib/data/types";

// Rubric lines are free text, so the oracle test can't check them. This checks every counted rubric threshold in
// cases.yaml and lockbox.yaml against the data: a line the catalog can't satisfy scores 0 whatever the prompt does
// (auto-art's "most picks are art museums" did exactly that before this test existed).
const plannable = (hub: Hub) => PLACES.filter((p) => p.hub === hub && p.autoPlan);
const count = (hub: Hub, f: (p: Place) => boolean) => plannable(hub).filter(f).length;
const art = (p: Place) => p.type === "museum" || p.tags.includes("art");
const food = (p: Place) => p.tags.includes("food") || p.type === "restaurant" || p.type === "market";

describe("counted rubric thresholds are achievable", () => {
  it.each([
    ["auto-art: at least four art picks, in Florence", "Florence", art, 4],
    ["auto-art: at least four art picks, in Milan", "Milan", art, 4],
    ["florence-art: at least five art picks", "Florence", art, 5],
    ["rome-food-art: two art picks in the top five", "Rome", art, 2],
    ["milan-art-food: two art and two food in the top five (art)", "Milan", art, 2],
    ["milan-art-food: two art and two food in the top five (food)", "Milan", food, 2],
    ["bologna-food: at least eight food picks", "Bologna", food, 8],
    ["night-owls: several (3) evening places", "Milan", (p: Place) => p.tags.includes("evening"), 3],
    ["rainy: most of 10 picks indoors (6)", "Florence", (p: Place) => p.tags.includes("rainy-day") || p.type === "museum" || p.type === "market" || p.tags.includes("art"), 6],
    ["venice-hidden-gems: top three tagged hidden-gem, local-favorite or quiet", "Venice", (p: Place) => ["hidden-gem", "local-favorite", "quiet"].some((t) => p.tags.includes(t)), 3],
    ["venice-hidden-gems: at most two tourist-heavy in 10 (8 others)", "Venice", (p: Place) => !p.tags.includes("tourist-heavy"), 8],
    ["lock-rome-evening-views: at least three views or scenic", "Rome", (p: Place) => p.tags.includes("views") || p.tags.includes("scenic"), 3],
  ] as const)("%s", (_, hub, f, needed) => {
    expect(count(hub, f)).toBeGreaterThanOrEqual(needed);
  });
});
