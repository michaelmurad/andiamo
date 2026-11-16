import type { Interval } from "@/lib/data/parse-hours";
import type { Place } from "@/lib/data/types";
import {
  MONTH_NAMES, WEEKDAY_NAMES, isOccurrence, monthInRange, monthOf, plusDays, shortDate, weekdayOf,
  type IsoDate, type Minutes,
} from "@/lib/time";

export type Availability = { ok: true } | { ok: false; reason: string };

const ORDINAL = { 1: "1st", 2: "2nd", 3: "3rd", 4: "4th", last: "last" } as const;

/** Opening intervals on a date: the weekly hours, replaced by seasonal hours when they apply. */
export function hoursOn(place: Place, date: IsoDate): Interval[] {
  const month = monthOf(date);
  const season = place.seasonalHours.find((s) => monthInRange(month, s.fromMonth, s.toMonth));
  return (season?.week ?? place.hours)[weekdayOf(date)];
}

/** Can this place be visited at all on this date? Hard rules only; soft rules affect the score. */
export function availableOn(place: Place, date: IsoDate): Availability {
  const month = monthOf(date);
  const weekday = weekdayOf(date);

  for (const rule of place.rules) {
    if (rule.kind === "months" && rule.strength === "hard" && !monthInRange(month, rule.fromMonth, rule.toMonth)) {
      return { ok: false, reason: `Open ${monthSpan(rule.fromMonth, rule.toMonth)} only` };
    }
  }

  const occurrenceRules = place.rules.filter((r) => r.kind === "onlyOnOccurrence" && r.weekday === weekday);
  for (const rule of occurrenceRules) {
    if (rule.kind === "onlyOnOccurrence" && !isOccurrence(date, rule.occurrence)) {
      return { ok: false, reason: `Only the ${ORDINAL[rule.occurrence]} ${WEEKDAY_NAMES[weekday]} of the month` };
    }
  }

  if (hoursOn(place, date).length === 0) return { ok: false, reason: `Closed ${WEEKDAY_NAMES[weekday]}s` };
  return { ok: true };
}

/** A restaurant's hours are when you can sit down, not when you must leave: 240 minutes at Osteria
 * Francescana starts inside a 12:30–14:00 lunch service. Seat at least this long before it ends. */
export const LAST_SEATING_MINUTES = 30;

/** The latest start inside an interval: a restaurant needs a seat, anything else needs to finish. */
const latestStartIn = (place: Place, { close }: Interval, duration: number) =>
  place.type === "restaurant" ? close - LAST_SEATING_MINUTES : close - duration;

/**
 * The earliest start at or after `arrive` that fits one opening interval.
 * Returns null when the place is closed that day or nothing fits.
 */
export function earliestStart(place: Place, date: IsoDate, arrive: Minutes, duration: number): Minutes | null {
  if (!availableOn(place, date).ok) return null;
  for (const interval of hoursOn(place, date)) {
    const start = Math.max(arrive, interval.open);
    if (start <= latestStartIn(place, interval, duration)) return start;
  }
  return null;
}

/** Does a visit starting at `start` fit the opening hours on this date? */
export function isOpenFor(place: Place, date: IsoDate, start: Minutes, duration: number): boolean {
  if (!availableOn(place, date).ok) return false;
  return hoursOn(place, date).some((i) => start >= i.open && start <= latestStartIn(place, i, duration));
}

/** The first date on or after `from` when the place is available, within a year. */
export function nextAvailableDate(place: Place, from: IsoDate, maxDays = 366): IsoDate | null {
  for (let i = 0; i < maxDays; i++) {
    const date = plusDays(from, i);
    if (availableOn(place, date).ok) return date;
  }
  return null;
}

/** "Only the 3rd Saturday of the month. Next: Sat 17 Apr" */
export function unavailableReason(place: Place, dates: IsoDate[]): string | null {
  const reasons: string[] = [];
  for (const date of dates) {
    const a = availableOn(place, date);
    if (a.ok) return null;
    reasons.push(a.reason);
  }
  // "Only the 3rd Saturday" says more than "Closed Fridays", so prefer a rule over a weekly closing day.
  const reason = reasons.find((r) => !r.startsWith("Closed ")) ?? reasons[0];
  const next = nextAvailableDate(place, dates[dates.length - 1]);
  return next ? `${reason}. Next: ${shortDate(next)}` : reason;
}

const monthSpan = (from: number, to: number) =>
  from === to ? MONTH_NAMES[from - 1] : `${MONTH_NAMES[from - 1]}–${MONTH_NAMES[to - 1]}`;
