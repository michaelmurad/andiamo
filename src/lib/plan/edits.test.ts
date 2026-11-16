import { describe, expect, it } from "vitest";
import { PLACE_BY_ID, PLACES } from "@/lib/data/places";
import { HUBS } from "@/lib/data/types";
import { availableOn, isOpenFor } from "./availability";
import { applyEdits, changedKeys, type EditResult } from "./edits";
import { schedule } from "./schedule";
import type { Plan, TripSettings } from "./types";

const settings = (over: Partial<TripSettings> = {}): TripSettings => ({
  startDate: "2027-05-14",
  days: 3,
  hub: "Rome",
  pace: "balanced",
  interests: ["food", "art"],
  avoidCrowds: false,
  maxPrice: 3,
  dayTrip: "auto",
  ...over,
});

const PLAN = schedule({ settings: settings(), places: PLACES });
const placeStops = (plan: Plan, day: number) => plan.days[day].stops.filter((s) => s.placeId);
const ids = (plan: Plan) => plan.days.flatMap((d) => d.stops.map((s) => s.placeId)).filter(Boolean);
const shape = (plan: Plan, day: number) => plan.days[day].stops.map((s) => `${s.placeId}@${s.start}`);

/** A Rome place that isn't in the plan and is open on `day`. */
const spare = (plan: Plan, day: number, restaurant = false) =>
  PLACES.find((p) => p.hub === "Rome" && p.autoPlan && !p.excursion && (p.type === "restaurant") === restaurant
    && !ids(plan).includes(p.id) && !p.sameSpotAs.some((o) => ids(plan).includes(o)) && availableOn(p, plan.days[day].date).ok)!;

function edited(result: EditResult) {
  if (result.kind !== "edited") throw new Error(`Expected an edit, got ${JSON.stringify(result)}`);
  return result;
}

describe("applyEdits", () => {
  it("re-plans to the same plan when every stop is held", () => {
    // Locking a stop changes nothing but the flag, so this checks the plan survives a round trip untouched.
    const stop = placeStops(PLAN, 0)[0];
    const r = edited(applyEdits(PLAN, [{ op: "lock", stopKey: stop.key }]));
    expect(r.changed).toEqual([]);
    expect(r.plan.days[0].stops.find((s) => s.key === stop.key)?.locked).toBe(true);
  });

  it("removes a stop, keeps the other days as they were, and doesn't list it as unplaced", () => {
    const stop = placeStops(PLAN, 1)[1];
    const r = edited(applyEdits(PLAN, [{ op: "remove", stopKey: stop.key }]));
    expect(ids(r.plan)).not.toContain(stop.placeId);
    expect(r.plan.unplaced.map((u) => u.placeId)).not.toContain(stop.placeId);
    expect(r.plan.excluded).toContain(stop.placeId);
    expect(shape(r.plan, 0)).toEqual(shape(PLAN, 0));
    expect(shape(r.plan, 2)).toEqual(shape(PLAN, 2));
    expect(r.changed.every((k) => r.plan.days[1].stops.some((s) => s.key === k))).toBe(true);
    expect(r.summary).toBe(`Removed ${stop.label} from day 2.`);
  });

  it("never brings a removed place back on a later edit", () => {
    const stop = placeStops(PLAN, 0)[0];
    const removed = edited(applyEdits(PLAN, [{ op: "remove", stopKey: stop.key }])).plan;
    const slower = edited(applyEdits(removed, [{ op: "setPace", day: 1, pace: "packed" }])).plan;
    expect(ids(slower)).not.toContain(stop.placeId);
  });

  it("swaps a stop for a named place on the same day, leaving other days alone", () => {
    const stop = placeStops(PLAN, 0).find((s) => s.slot === "morning" || s.slot === "afternoon")!;
    const p = spare(PLAN, 0);
    const r = edited(applyEdits(PLAN, [{ op: "swap", stopKey: stop.key, placeId: p.id }]));
    expect(r.plan.days[0].stops.some((s) => s.placeId === p.id && s.locked)).toBe(true);
    expect(ids(r.plan)).not.toContain(stop.placeId);
    expect(shape(r.plan, 1)).toEqual(shape(PLAN, 1));
    expect(r.changed).toContain(`0-${p.id}`);
  });

  it("adds a place to the day asked for", () => {
    const p = spare(PLAN, 2);
    const r = edited(applyEdits(PLAN, [{ op: "add", placeId: p.id, day: 3 }]));
    expect(r.plan.days[2].stops.some((s) => s.placeId === p.id)).toBe(true);
    expect(shape(r.plan, 0)).toEqual(shape(PLAN, 0));
  });

  it("adds a restaurant only as a meal", () => {
    const p = spare(PLAN, 1, true);
    const r = edited(applyEdits(PLAN, [{ op: "add", placeId: p.id, day: 2 }]));
    const stop = r.plan.days[1].stops.find((s) => s.placeId === p.id)!;
    expect(["lunch", "dinner"]).toContain(stop.slot);
  });

  it("rejects places outside the trip's city, unknown ids, and days that don't exist", () => {
    const florence = PLACES.find((p) => p.hub === "Florence" && p.autoPlan)!;
    expect(applyEdits(PLAN, [{ op: "add", placeId: florence.id, day: 1 }])).toEqual({
      kind: "invalid",
      errors: [`${florence.name} is in the Florence area, not Rome`],
    });
    expect(applyEdits(PLAN, [{ op: "add", placeId: "nope", day: 1 }]).kind).toBe("invalid");
    expect(applyEdits(PLAN, [{ op: "setPace", day: 9, pace: "relaxed" }]).kind).toBe("invalid");
  });

  it("is all or nothing", () => {
    const stop = placeStops(PLAN, 0)[0];
    const r = applyEdits(PLAN, [{ op: "remove", stopKey: stop.key }, { op: "remove", stopKey: "missing" }]);
    expect(r).toEqual({ kind: "invalid", errors: ["No stop missing in the plan"] });
  });

  it("changes one day's pace and re-plans only that day", () => {
    const r = edited(applyEdits(PLAN, [{ op: "setPace", day: 2, pace: "relaxed" }]));
    expect(r.plan.days[1].pace).toBe("relaxed");
    expect(r.plan.days[0].pace).toBe("balanced");
    expect(shape(r.plan, 0)).toEqual(shape(PLAN, 0));
    expect(shape(r.plan, 2)).toEqual(shape(PLAN, 2));
    expect(placeStops(r.plan, 1).length).toBeLessThanOrEqual(placeStops(PLAN, 1).length);
  });

  it("keeps the day trip on its day", () => {
    const trip = PLAN.days.find((d) => d.excursion);
    if (!trip) return;
    const stop = placeStops(PLAN, trip.index === 0 ? 1 : 0)[0];
    const r = edited(applyEdits(PLAN, [{ op: "remove", stopKey: stop.key }]));
    expect(r.plan.days[trip.index].area).toBe(trip.area);
  });

  it("passes a question straight through", () => {
    expect(applyEdits(PLAN, [{ op: "ask", question: "Which day?", options: ["Day 1", "Day 2"] }])).toEqual({
      kind: "ask",
      question: "Which day?",
      options: ["Day 1", "Day 2"],
    });
  });
});

describe.each(HUBS.flatMap((hub) => (["relaxed", "packed"] as const).map((pace) => [hub, pace] as const)))("removing any stop: %s %s", (hub, pace) => {
  const plan = schedule({ settings: settings({ hub, pace }), places: PLACES });
  it("always works, keeps other days, and never plans a closed place", () => {
    for (const day of plan.days) {
      for (const stop of day.stops.filter((s) => s.placeId)) {
        const r = edited(applyEdits(plan, [{ op: "remove", stopKey: stop.key }]));
        for (const other of plan.days.filter((d) => d.index !== day.index)) expect(shape(r.plan, other.index)).toEqual(shape(plan, other.index));
        for (const s of r.plan.days[day.index].stops.filter((x) => x.placeId)) {
          const p = PLACE_BY_ID.get(s.placeId!)!;
          expect(isOpenFor(p, day.date, s.start, p.durationMinutes), `${p.name} after removing ${stop.label}`).toBe(true);
        }
      }
    }
  });
});

describe("changedKeys", () => {
  it("is empty for the same plan", () => expect(changedKeys(PLAN, PLAN)).toEqual([]));
});

describe("places the request rules out", () => {
  const avoid = PLAN.days.flatMap((d) => d.stops.filter((s) => s.placeId)).slice(0, 2).map((s) => ({ placeId: s.placeId!, reason: "You asked for no churches" }));
  const plan = schedule({ settings: settings(), places: PLACES, avoid });

  it("are never planned, and are reported with their reason", () => {
    for (const a of avoid) expect(ids(plan)).not.toContain(a.placeId);
    expect(plan.avoided).toEqual(avoid);
    expect(plan.unplaced.map((u) => u.placeId)).not.toContain(avoid[0].placeId);
  });

  it("stay out through an edit", () => {
    const r = edited(applyEdits(plan, [{ op: "setPace", day: 1, pace: "packed" }]));
    for (const a of avoid) expect(ids(r.plan)).not.toContain(a.placeId);
    expect(r.plan.avoided).toEqual(avoid);
  });

  it("are planned when the traveller asks for one by name, and stop being reported", () => {
    const wanted = PLACE_BY_ID.get(avoid[0].placeId)!;
    const day = plan.days.findIndex((d) => availableOn(wanted, d.date).ok);
    const r = edited(applyEdits(plan, [{ op: "add", placeId: wanted.id, day: day + 1 }]));
    expect(ids(r.plan)).toContain(wanted.id);
    expect(r.plan.avoided.map((a) => a.placeId)).toEqual([avoid[1].placeId]);
  });
});
