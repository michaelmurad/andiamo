import { ALL_DAYS, hm, type Minutes, type Weekday } from "@/lib/time";

export interface Interval {
  open: Minutes;
  /** May exceed 1440 when a place closes after midnight. */
  close: Minutes;
}

/** Opening intervals for each weekday, indexed 0 (Sunday) to 6 (Saturday). */
export type WeeklyHours = Interval[][];

export type HoursParse =
  | { ok: true; week: WeeklyHours; daysImplied: boolean; approximate: boolean }
  | { ok: false; reason: string };

const DAY_NAMES: Record<string, Weekday> = {
  sun: 0, mon: 1, tue: 2, tues: 2, wed: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6,
};

/** Free-text values seen in the data. Approximate by nature, so they're flagged as such. */
const PHRASES: Record<string, Interval> = {
  evenings: { open: hm(18), close: hm(23, 30) },
  "morning only": { open: hm(7), close: hm(13) },
};

export const emptyWeek = (): WeeklyHours => ALL_DAYS.map(() => []);
export const everyDay = (interval: Interval): WeeklyHours => ALL_DAYS.map(() => [{ ...interval }]);

/**
 * Parses the `hours` strings found in italy.json:
 *   "9:00-19:00"                          every day (days implied)
 *   "Daily 10:00-24:00"                   explicit every day
 *   "8am-7pm", "9am-12:30pm"              12-hour clock
 *   "Tues-Sun 9:00-19:00", "Wed-Mon …"    day ranges, including ones that wrap past Sunday
 *   "Tues, Thurs-Sun 10:00-18:00"         a day list: days without times carry forward
 *   "Mon-Sat 12:30-14:30, 19:30-22:30"    a comma before a time continues the same days (split shift)
 *   "Mon-Fri 7:00-14:00, Sat 7:00-17:00"  a comma before a day starts a new day group
 *   "8:00-01:00"                          closes after midnight
 *   "Evenings", "Morning only"            known phrases, marked approximate
 */
export function parseHours(input: string): HoursParse {
  let text = input.trim().toLowerCase();
  const phrase = PHRASES[text];
  if (phrase) return { ok: true, week: everyDay(phrase), daysImplied: true, approximate: true };

  text = text.replace(/^daily\s+/, "");
  const week = emptyWeek();
  let daysImplied = false;
  let pending: Weekday[] = [];
  let current: Weekday[] | null = null;

  for (const segment of text.split(/\s*,\s*/)) {
    const match = segment.match(/^([a-z][a-z\s-]*?)?\s*(\d.*)?$/);
    const dayPart = match?.[1]?.trim();
    const timePart = match?.[2]?.trim();
    if (!dayPart && !timePart) return { ok: false, reason: `Can't read "${segment}"` };

    if (dayPart) {
      const days = parseDays(dayPart);
      if (!days) return { ok: false, reason: `Unknown day "${dayPart}"` };
      if (!timePart) {
        pending.push(...days);
        continue;
      }
      current = [...pending, ...days];
      pending = [];
    }

    if (!current) {
      current = ALL_DAYS;
      daysImplied = true;
    }
    const interval = parseInterval(timePart!);
    if (!interval) return { ok: false, reason: `Can't read time "${timePart}"` };
    for (const day of current) week[day].push(interval);
  }

  if (pending.length) return { ok: false, reason: "Days listed without times" };
  for (const day of week) day.sort((a, b) => a.open - b.open);
  return { ok: true, week, daysImplied, approximate: false };
}

/** "tues" → [2]; "wed-mon" → [3,4,5,6,0,1]. */
function parseDays(text: string): Weekday[] | null {
  const ids = text.split(/\s*-\s*/).map((name) => DAY_NAMES[name]);
  if (ids.some((id) => id === undefined) || ids.length > 2) return null;
  if (ids.length === 1) return [ids[0]];
  const days: Weekday[] = [];
  for (let d = ids[0]; ; d = ((d + 1) % 7) as Weekday) {
    days.push(d);
    if (d === ids[1]) return days;
  }
}

/** "8:00-01:00" → { open: 480, close: 1500 }. */
function parseInterval(text: string): Interval | null {
  const parts = text.split(/\s*-\s*/);
  if (parts.length !== 2) return null;
  const open = parseClock(parts[0]);
  let close = parseClock(parts[1]);
  if (open === null || close === null) return null;
  if (close <= open) close += 1440;
  return { open, close };
}

/** "9", "9:30", "24:00", "8am", "12:30pm" → minutes after midnight. */
function parseClock(text: string): Minutes | null {
  const m = text.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!m) return null;
  let hours = Number(m[1]);
  const minutes = Number(m[2] ?? 0);
  if (m[3]) {
    if (hours < 1 || hours > 12) return null;
    if (hours === 12) hours = 0;
    if (m[3] === "pm") hours += 12;
  }
  if (minutes > 59 || hours > 24 || (hours === 24 && minutes > 0)) return null;
  return hm(hours, minutes);
}
