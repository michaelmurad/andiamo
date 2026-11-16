import { describe, expect, it } from "vitest";
import { hm, type Weekday } from "@/lib/time";
import { parseHours, type WeeklyHours } from "./parse-hours";

const ok = (input: string) => {
  const result = parseHours(input);
  if (!result.ok) throw new Error(`${input}: ${result.reason}`);
  return result;
};
/** The weekdays (0 = Sunday) that have any hours. */
const openDays = (week: WeeklyHours) => week.flatMap((intervals, day) => (intervals.length ? [day as Weekday] : []));

// Every distinct shape that appears in italy.json, with the record it came from.
describe("parseHours", () => {
  it("plain range means every day, and says the days were implied (place_001)", () => {
    const r = ok("9:00-19:00");
    expect(openDays(r.week)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(r.week[3]).toEqual([{ open: hm(9), close: hm(19) }]);
    expect(r.daysImplied).toBe(true);
  });

  it("Daily prefix (place_031) and 24:00 close", () => {
    const r = ok("Daily 10:00-24:00");
    expect(r.week[0]).toEqual([{ open: hm(10), close: hm(24) }]);
  });

  it("12-hour clock (place_040, place_087)", () => {
    expect(ok("8am-7pm").week[1]).toEqual([{ open: hm(8), close: hm(19) }]);
    expect(ok("9am-12:30pm").week[1]).toEqual([{ open: hm(9), close: hm(12, 30) }]);
  });

  it("past midnight stays after the open time (place_020)", () => {
    expect(ok("8:00-01:00").week[2]).toEqual([{ open: hm(8), close: hm(25) }]);
  });

  it("day range (place_007)", () => {
    expect(openDays(ok("Tues-Sun 9:00-19:00").week)).toEqual([0, 2, 3, 4, 5, 6]);
  });

  it("day range that wraps past Sunday (place_062)", () => {
    expect(openDays(ok("Wed-Mon 10:00-19:00").week)).toEqual([0, 1, 3, 4, 5, 6]);
  });

  it("day list carries forward to the next time (place_064)", () => {
    expect(openDays(ok("Tues, Thurs-Sun 10:00-18:00").week)).toEqual([0, 2, 4, 5, 6]);
  });

  it("comma before a time is a split shift for the same days (place_003)", () => {
    const r = ok("Mon-Sat 12:30-14:30, 19:30-22:30");
    expect(openDays(r.week)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(r.week[1]).toEqual([{ open: hm(12, 30), close: hm(14, 30) }, { open: hm(19, 30), close: hm(22, 30) }]);
  });

  it("comma before a day starts a new day group (place_030)", () => {
    const r = ok("Mon-Fri 7:00-14:00, Sat 7:00-17:00");
    expect(r.week[5]).toEqual([{ open: hm(7), close: hm(14) }]);
    expect(r.week[6]).toEqual([{ open: hm(7), close: hm(17) }]);
    expect(r.week[0]).toEqual([]);
  });

  it("different Sunday hours (place_036)", () => {
    const r = ok("Mon-Sat 9:30-17:30, Sun 14:00-17:30");
    expect(r.week[0]).toEqual([{ open: hm(14), close: hm(17, 30) }]);
  });

  it("split shift with no days at all (place_029)", () => {
    const r = ok("12:00-14:30, 19:00-22:30");
    expect(r.week[4]).toHaveLength(2);
    expect(r.daysImplied).toBe(true);
  });

  it("known phrases are approximate (place_037, place_006)", () => {
    expect(ok("Evenings").approximate).toBe(true);
    expect(ok("Morning only").week[1]).toEqual([{ open: hm(7), close: hm(13) }]);
  });

  it("fails loudly on what it can't read", () => {
    expect(parseHours("By appointment").ok).toBe(false);
    expect(parseHours("Funday 9:00-17:00").ok).toBe(false);
    expect(parseHours("25:00-26:00").ok).toBe(false);
    expect(parseHours("Mon, Tue").ok).toBe(false);
  });
});
