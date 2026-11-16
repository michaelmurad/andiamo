import { describe, expect, it } from "vitest";
import type { Stop } from "@/lib/plan/types";
import type { PlaceView } from "@/lib/plan/view";
import { legMode, toSlots } from "./day-slots";

const place = (id: string, mapsQuery: string): PlaceView => ({
  id,
  name: id,
  kind: "art",
  category: "Museum",
  rating: "4.7",
  price: "€€",
  duration: "2 h",
  mapsQuery,
});

let n = 0;
const stop = (over: Partial<Stop>): Stop => ({
  key: `s${n++}`,
  placeId: null,
  label: "Stop",
  slot: "morning",
  start: 9 * 60,
  end: 10 * 60,
  travel: null,
  locked: false,
  why: "",
  warnings: [],
  ...over,
});

const places = {
  borghese: place("borghese", "Galleria Borghese, Rome"),
  pantheon: place("pantheon", "Pantheon, Rome"),
};

const directions = (url: string | undefined) => Object.fromEntries(new URL(url!).searchParams);

describe("toSlots", () => {
  it("groups stops by slot in the order of the day and leaves out empty slots", () => {
    const slots = toSlots(
      [
        stop({ label: "Dinner", slot: "dinner", start: 20 * 60 }),
        stop({ label: "Museum", slot: "morning", start: 9 * 60 }),
        stop({ label: "Walk", slot: "morning", start: 11 * 60 }),
      ],
      {},
      "Rome",
    );
    expect(slots.map((s) => [s.label, s.stops.map((x) => x.title)])).toEqual([
      ["Morning", ["Museum", "Walk"]],
      ["Dinner", ["Dinner"]],
    ]);
  });

  it("shows the place's details, the clock time and every warning", () => {
    const [slot] = toSlots(
      [stop({ placeId: "borghese", label: "Galleria Borghese", start: 9 * 60 + 5, warnings: ["Book ahead", "Closed Mondays"] })],
      places,
      "Rome",
    );
    expect(slot.stops[0]).toMatchObject({
      time: "9:05",
      title: "Galleria Borghese",
      kind: "art",
      category: "Museum",
      rating: "4.7",
      price: "€€",
      duration: "2 h",
      warning: "Book ahead · Closed Mondays",
    });
  });

  it("marks a meal with no dataset place as the traveller's own pick, with no warning", () => {
    const [slot] = toSlots([stop({ label: "Lunch nearby", slot: "lunch" })], places, "Rome");
    expect(slot.stops[0]).toMatchObject({ kind: "food", category: "Your pick", warning: undefined, leg: undefined });
  });

  it("starts the first leg of the day from the viewer, then each leg from the previous place", () => {
    const [slot] = toSlots(
      [
        stop({ placeId: "borghese", travel: { minutes: 20, mode: "transit" } }),
        stop({ placeId: "pantheon", start: 11 * 60, travel: { minutes: 12, mode: "walk" } }),
      ],
      places,
      "Rome",
    );
    const [first, second] = slot.stops;
    expect(directions(first.leg?.directionsUrl)).toEqual({ api: "1", destination: "Galleria Borghese, Rome", travelmode: "transit" });
    expect(directions(second.leg?.directionsUrl)).toMatchObject({
      origin: "Galleria Borghese, Rome",
      destination: "Pantheon, Rome",
      travelmode: "walking",
    });
    expect(second.leg).toMatchObject({ minutes: 12, mode: "walk" });
  });

  it("routes past a placeless meal from the last real place", () => {
    const slots = toSlots(
      [
        stop({ placeId: "borghese", slot: "morning" }),
        stop({ label: "Lunch nearby", slot: "lunch", start: 13 * 60, travel: { minutes: 5, mode: "walk" } }),
        stop({ placeId: "pantheon", slot: "afternoon", start: 15 * 60, travel: { minutes: 15, mode: "walk" } }),
      ],
      places,
      "Rome",
    );
    const lunch = slots[1].stops[0];
    const afternoon = slots[2].stops[0];
    // Nowhere to send Maps for the meal itself, but the time is still shown.
    expect(lunch.leg).toEqual({ minutes: 5, mode: "walk", directionsUrl: undefined });
    expect(directions(afternoon.leg?.directionsUrl).origin).toBe("Galleria Borghese, Rome");
  });

  it("names the vaporetto for transit in Venice", () => {
    const [slot] = toSlots([stop({ placeId: "pantheon", travel: { minutes: 18, mode: "transit" } })], places, "Venice");
    expect(slot.stops[0].leg?.mode).toBe("boat");
    // Maps still gets a transit request: it has no boat mode.
    expect(directions(slot.stops[0].leg?.directionsUrl).travelmode).toBe("transit");
  });
});

describe("legMode", () => {
  it("only renames transit, and only in Venice", () => {
    expect(legMode("transit", "Venice")).toBe("boat");
    expect(legMode("walk", "Venice")).toBe("walk");
    expect(legMode("transit", "Rome")).toBe("transit");
    expect(legMode("train", "Florence")).toBe("train");
  });
});
