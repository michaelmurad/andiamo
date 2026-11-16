import { describe, expect, it } from "vitest";
import { daysBetween, weekdayOf } from "@/lib/time";
import {
  MAX_PLANNER_DAYS, MAX_TRIP_DAYS, defaultSettings, defaultStartDate, fromSearchParams, toSearchParams, tripLength,
} from "./settings";
import type { TripSettings } from "./types";

// Sunday 15 November 2026.
const TODAY = "2026-11-15";

describe("tripLength", () => {
  it("counts both ends of the range", () => {
    expect(tripLength("2026-12-11", "2026-12-11")).toBe(1);
    expect(tripLength("2026-12-11", "2026-12-13")).toBe(3);
  });

  it("never goes below one day when the end is before the start", () => {
    expect(tripLength("2026-12-11", "2026-12-09")).toBe(1);
  });

  it("caps the length at the setup limit", () => {
    expect(tripLength("2026-12-11", "2026-12-20")).toBe(MAX_TRIP_DAYS);
  });

  it("allows longer trips when the limit is raised", () => {
    expect(tripLength("2026-12-11", "2026-12-15", 5)).toBe(5);
    expect(tripLength("2026-12-11", "2026-12-20", 5)).toBe(5);
  });

  it("counts across a month and a year end", () => {
    expect(tripLength("2026-12-30", "2027-01-01", 7)).toBe(3);
  });
});

describe("trip length limits", () => {
  it("keeps the setup limit within what the planner accepts", () => {
    expect(MAX_TRIP_DAYS).toBeGreaterThanOrEqual(1);
    expect(MAX_TRIP_DAYS).toBeLessThanOrEqual(MAX_PLANNER_DAYS);
  });

  it("offers the default trip length on the setup screen", () => {
    expect(defaultSettings(TODAY).days).toBeLessThanOrEqual(MAX_TRIP_DAYS);
  });
});

describe("defaultStartDate", () => {
  it("picks the first Friday at least three weeks out", () => {
    const start = defaultStartDate(TODAY);
    expect(start).toBe("2026-12-11");
    expect(weekdayOf(start)).toBe(5);
    expect(daysBetween(TODAY, start)).toBeGreaterThanOrEqual(21);
  });

  it("keeps a Friday that is exactly three weeks out", () => {
    expect(defaultStartDate("2026-11-13")).toBe("2026-12-04");
  });

  it("rolls over the year end", () => {
    expect(defaultStartDate("2026-12-20")).toBe("2027-01-15");
  });
});

describe("URL settings", () => {
  const settings: TripSettings = {
    startDate: "2027-01-08",
    days: 2,
    hub: "Florence",
    pace: "relaxed",
    interests: ["art", "history"],
    avoidCrowds: true,
    maxPrice: 2,
    dayTrip: "none",
  };

  it("round-trips the start date, length and everything else", () => {
    const params = toSearchParams(settings, "no museums on Monday");
    expect(fromSearchParams(params, TODAY)).toEqual({ settings, notes: "no museums on Monday", options: { useModel: true } });
  });

  it("round-trips ai=off, and leaves it out of the URL otherwise", () => {
    const off = toSearchParams(settings, "", { useModel: false });
    expect(off.get("ai")).toBe("off");
    expect(fromSearchParams(off, TODAY).options).toEqual({ useModel: false });
    expect(toSearchParams(settings).has("ai")).toBe(false);
  });

  it.each(["on", "0", "false", "OFF", ""])("uses the model for ai=%s: only an exact \"off\" turns it off", (value) => {
    expect(fromSearchParams(new URLSearchParams({ ai: value }), TODAY).options.useModel).toBe(true);
  });

  it("reads the setup screen's URL, which leaves out price and day trips", () => {
    const params = new URLSearchParams("start=2027-01-08&days=3&hub=Rome&pace=balanced&likes=food,art&crowds=ok");
    const { settings: read } = fromSearchParams(params, TODAY);
    expect(read).toMatchObject({ startDate: "2027-01-08", days: 3, hub: "Rome" });
    expect(read.maxPrice).toBe(defaultSettings(TODAY).maxPrice);
    expect(read.dayTrip).toBe("auto");
  });

  it("uses the default dates when the URL has none, keeping the other choices", () => {
    const params = new URLSearchParams("hub=Venice&pace=packed&likes=food&crowds=avoid");
    const { settings: read } = fromSearchParams(params, TODAY);
    expect(read).toMatchObject({ startDate: "2026-12-11", days: 3, hub: "Venice", pace: "packed", avoidCrowds: true });
  });

  it("accepts the planner's longest trip", () => {
    const params = new URLSearchParams({ start: "2027-01-08", days: String(MAX_PLANNER_DAYS) });
    expect(fromSearchParams(params, TODAY).settings.days).toBe(MAX_PLANNER_DAYS);
  });

  it.each([
    ["a length over the planner's limit", { start: "2027-01-08", days: String(MAX_PLANNER_DAYS + 1) }],
    ["a zero length", { start: "2027-01-08", days: "0" }],
    ["a malformed start date", { start: "08/01/2027", days: "3" }],
    ["an empty start date", { start: "", days: "3" }],
  ])("falls back to the defaults for %s", (_, values) => {
    const { settings: read } = fromSearchParams(new URLSearchParams(values), TODAY);
    expect(read).toEqual(defaultSettings(TODAY));
  });

  it("keeps notes to 500 characters", () => {
    const params = new URLSearchParams({ notes: "x".repeat(600) });
    expect(fromSearchParams(params, TODAY).notes).toHaveLength(500);
  });
});
