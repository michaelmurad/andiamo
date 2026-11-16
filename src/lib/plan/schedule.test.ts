import { describe, expect, it } from "vitest";
import { PLACE_BY_ID, PLACES } from "@/lib/data/places";
import { HUBS, type Hub } from "@/lib/data/types";
import { hm, plusDays } from "@/lib/time";
import { isOpenFor } from "./availability";
import { DINNER, LUNCH, PACE_RULES, schedule } from "./schedule";
import { rankMap, score, WEIGHTS } from "./score";
import { PACES, type Pace, type Plan, type TripSettings } from "./types";

const place = (id: string) => PLACE_BY_ID.get(id)!;

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

// A spread of trips: every hub and "pick for me", every pace, summer and winter, starting on different weekdays.
const START_DATES = ["2027-01-11", "2027-03-21", "2027-05-14", "2027-08-19", "2027-10-02"];
const MATRIX: TripSettings[] = [...HUBS, null].flatMap((hub) =>
  PACES.flatMap((pace) => START_DATES.map((startDate) => settings({ hub: hub as Hub | null, pace, startDate }))),
);
const PLANS: [string, Plan][] = MATRIX.map((s) => [`${s.hub ?? "auto"} ${s.pace} ${s.startDate}`, schedule({ settings: s, places: PLACES })]);

describe.each(PLANS)("invariants: %s", (_, plan) => {
  const placeStops = plan.days.flatMap((d) => d.stops.filter((s) => s.placeId).map((s) => ({ day: d, stop: s, place: place(s.placeId!) })));

  it("has one day per requested day, on consecutive dates", () => {
    expect(plan.days.map((d) => d.date)).toEqual([0, 1, 2].map((i) => plusDays(plan.settings.startDate, i)));
  });

  it("never schedules a place while it is closed", () => {
    for (const { day, stop, place: p } of placeStops) {
      expect(isOpenFor(p, day.date, stop.start, p.durationMinutes), `${p.name} ${day.date} ${stop.start}`).toBe(true);
    }
  });

  it("keeps stops in order, without overlaps, leaving time to travel", () => {
    for (const day of plan.days) {
      day.stops.forEach((stop, i) => {
        expect(stop.end).toBeGreaterThan(stop.start);
        if (i > 0) expect(stop.start).toBeGreaterThanOrEqual(day.stops[i - 1].end + (stop.travel?.minutes ?? 0));
      });
    }
  });

  it("plans each place once, and never two records of the same visit", () => {
    const ids = placeStops.map((s) => s.place.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const { place: p } of placeStops) expect(p.sameSpotAs.filter((o) => ids.includes(o))).toEqual([]);
  });

  it("only plans places marked for automatic planning", () => {
    expect(placeStops.filter((s) => !s.place.autoPlan)).toEqual([]);
  });

  it("stays in one hub and never hops between cities within a day", () => {
    for (const { place: p } of placeStops) expect(p.hub).toBe(plan.hub);
    for (const day of plan.days.filter((d) => !d.excursion)) {
      const far = day.stops.filter((s) => s.placeId && place(s.placeId).excursion);
      expect(far.map((s) => s.label)).toEqual([]);
    }
  });

  it("makes at most one day trip, and spends its daytime in that zone", () => {
    const trips = plan.days.filter((d) => d.excursion);
    expect(trips.length).toBeLessThanOrEqual(1);
    for (const day of trips) {
      for (const s of day.stops.filter((s) => s.placeId && (s.slot === "morning" || s.slot === "afternoon" || s.slot === "lunch"))) {
        expect(place(s.placeId!).excursion?.zone).toBe(day.area);
      }
    }
  });

  it("gives every day one lunch and one dinner, inside their windows", () => {
    for (const day of plan.days) {
      const lunches = day.stops.filter((s) => s.slot === "lunch");
      const dinners = day.stops.filter((s) => s.slot === "dinner");
      const lunchOnTheWay = day.stops.some((s) => s.warnings.some((w) => w.includes("lunch on the way")));
      expect(lunches.length + (lunchOnTheWay ? 1 : 0), day.date).toBe(1);
      expect(dinners.length, day.date).toBe(1);
      for (const s of lunches) expect(s.start).toBeGreaterThanOrEqual(LUNCH.from);
      for (const s of lunches.filter((s) => s.placeId)) expect(s.start).toBeLessThanOrEqual(LUNCH.to);
      for (const s of dinners.filter((s) => s.placeId)) {
        expect(s.start).toBeGreaterThanOrEqual(DINNER.from);
        expect(s.start).toBeLessThanOrEqual(DINNER.to);
      }
    }
  });

  it("respects the pace's daily visiting time", () => {
    const pace = PACE_RULES[plan.settings.pace];
    for (const day of plan.days) {
      const visits = day.stops.filter((s) => s.placeId && (s.slot === "morning" || s.slot === "afternoon"));
      const minutes = visits.reduce((sum, s) => sum + (s.end - s.start), 0);
      const longest = Math.max(0, ...visits.map((s) => s.end - s.start));
      expect(minutes).toBeLessThan(pace.activityMinutes + longest);
    }
  });

  it("explains every place it left out, and never lists one it planned", () => {
    const planned = new Set(placeStops.map((s) => s.place.id));
    for (const u of plan.unplaced) {
      expect(u.reason.length).toBeGreaterThan(0);
      expect(planned.has(u.placeId)).toBe(false);
    }
  });
});

describe("schedule", () => {
  it("is deterministic", () => {
    expect(schedule({ settings: settings(), places: PLACES })).toEqual(schedule({ settings: settings(), places: PLACES }));
  });

  it("supports trip lengths other than three", () => {
    expect(schedule({ settings: settings({ days: 1 }), places: PLACES }).days).toHaveLength(1);
    const long = schedule({ settings: settings({ days: 5, hub: "Florence" }), places: PLACES });
    expect(long.days).toHaveLength(5);
    expect(long.days.filter((d) => d.excursion).length).toBeLessThanOrEqual(1);
  });

  it("puts the model's top pick in the plan", () => {
    const plan = schedule({ settings: settings(), places: PLACES, shortlist: [{ id: "place_012", reason: "You asked for the Mouth of Truth" }] });
    const stop = plan.days.flatMap((d) => d.stops).find((s) => s.placeId === "place_012");
    expect(stop?.why).toBe("You asked for the Mouth of Truth");
  });

  it("reports a shortlisted place from another hub instead of planning it", () => {
    const plan = schedule({ settings: settings(), places: PLACES, shortlist: [{ id: "place_056", reason: "Last Supper" }] });
    expect(plan.unplaced).toContainEqual({ placeId: "place_056", reason: "In the Milan area, not Rome" });
  });

  it("keeps a locked stop on its day and time, and plans around it", () => {
    const plan = schedule({ settings: settings(), places: PLACES, locks: [{ placeId: "place_005", day: 1, start: hm(15) }] });
    const stop = plan.days[1].stops.find((s) => s.placeId === "place_005");
    expect(stop).toMatchObject({ locked: true, start: hm(15) });
    expect(plan.days.flatMap((d) => d.stops).filter((s) => s.placeId === "place_005")).toHaveLength(1);
  });

  it("uses a locked restaurant as that day's lunch", () => {
    const plan = schedule({ settings: settings(), places: PLACES, locks: [{ placeId: "place_022", day: 0, start: hm(13) }] });
    const lunches = plan.days[0].stops.filter((s) => s.slot === "lunch");
    expect(lunches).toHaveLength(1);
    expect(lunches[0]).toMatchObject({ placeId: "place_022", locked: true });
  });

  it("reports the Brera market as closed outside its weekend, with the next date", () => {
    // 2027-05-21..23 is the 4th weekend of May.
    const plan = schedule({ settings: settings({ hub: "Milan", startDate: "2027-05-21" }), places: PLACES, shortlist: [{ id: "place_059", reason: "" }] });
    expect(plan.unplaced.find((u) => u.placeId === "place_059")?.reason).toBe("Only the 3rd Saturday of the month. Next: Sat 19 Jun");
  });

  it("plans a day trip only when it beats the city, and never with dayTrip: none", () => {
    const outdoors = settings({ hub: "Florence", interests: ["outdoors"] });
    expect(schedule({ settings: outdoors, places: PLACES }).days.some((d) => d.excursion)).toBe(true);
    expect(schedule({ settings: { ...outdoors, dayTrip: "none" }, places: PLACES }).days.some((d) => d.excursion)).toBe(false);
  });

  it("closes Lake Como in winter, so a December Milan trip has no Como day", () => {
    const plan = schedule({ settings: settings({ hub: "Milan", startDate: "2027-12-06", interests: ["outdoors"] }), places: PLACES });
    expect(plan.days.some((d) => d.area === "Lake Como")).toBe(false);
  });

  it("picks a hub when asked to", () => {
    const plan = schedule({ settings: settings({ hub: null }), places: PLACES });
    expect(HUBS).toContain(plan.hub);
  });

  it.each(PACES)("%s pace starts the day at its own time", (pace: Pace) => {
    const plan = schedule({ settings: settings({ pace }), places: PLACES });
    const first = plan.days[0].stops[0];
    expect(first.start - (first.travel?.minutes ?? 0)).toBeGreaterThanOrEqual(PACE_RULES[pace].dayStart - 90);
  });
});

describe("the model's ranking", () => {
  const s = settings({ interests: ["history"] });
  const date = s.startDate;
  const ranked = PLACES.filter((p) => p.hub === "Rome" && p.autoPlan).slice(0, 3);
  const other = PLACES.find((p) => p.hub === "Rome" && p.autoPlan && !ranked.includes(p))!;

  it("lowers a place the model saw and didn't rank, but only when there is a ranking", () => {
    const withRanking = score(other, date, { settings: s, shortlistRank: rankMap(ranked.map((p) => ({ id: p.id, reason: "" }))) });
    const without = score(other, date, { settings: s });
    expect(withRanking).toBeCloseTo(without - WEIGHTS.unranked);
    expect(score(other, date, { settings: s, shortlistRank: new Map() })).toBeCloseTo(without);
  });

  it("gives the top pick the whole bonus and later picks less", () => {
    const rank = rankMap(ranked.map((p) => ({ id: p.id, reason: "" })));
    const bonus = (i: number) => score(ranked[i], date, { settings: s, shortlistRank: rank }) - score(ranked[i], date, { settings: s });
    expect(bonus(0)).toBeCloseTo(WEIGHTS.shortlist);
    expect(bonus(1)).toBeLessThan(bonus(0));
    expect(bonus(2)).toBeLessThan(bonus(1));
  });
});
