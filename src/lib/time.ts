import { addDays, format, getDay, parseISO } from "date-fns";

/** 0 = Sunday … 6 = Saturday, the same numbering as Date#getDay. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Minutes after midnight. A close time past midnight is stored above 1440 (01:00 → 1500). */
export type Minutes = number;

/** A calendar date as "YYYY-MM-DD". Never carries a time, so time zones can't shift it. */
export type IsoDate = string;

export const ALL_DAYS: Weekday[] = [0, 1, 2, 3, 4, 5, 6];
export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

export const hm = (hours: number, minutes = 0): Minutes => hours * 60 + minutes;

/** 570 → "9:30", 1500 → "1:00". */
export function formatClock(minutes: Minutes): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}

export const weekdayOf = (date: IsoDate) => getDay(parseISO(date)) as Weekday;
/** 1 = January … 12 = December. */
export const monthOf = (date: IsoDate) => parseISO(date).getMonth() + 1;
export const dayOfMonth = (date: IsoDate) => parseISO(date).getDate();
export const plusDays = (date: IsoDate, days: number): IsoDate => format(addDays(parseISO(date), days), "yyyy-MM-dd");
/** "Tue 14 Apr" */
export const shortDate = (date: IsoDate) => format(parseISO(date), "EEE d MMM");

export const tripDates = (start: IsoDate, days: number): IsoDate[] =>
  Array.from({ length: days }, (_, i) => plusDays(start, i));

/** Inclusive month range that may wrap the year end (Nov–Feb). */
export function monthInRange(month: number, from: number, to: number): boolean {
  return from <= to ? month >= from && month <= to : month >= from || month <= to;
}

/** Is `date` the nth (1–4) or the last occurrence of its weekday in its month? */
export function isOccurrence(date: IsoDate, occurrence: number | "last"): boolean {
  const day = dayOfMonth(date);
  if (occurrence === "last") return monthOf(plusDays(date, 7)) !== monthOf(date);
  return Math.ceil(day / 7) === occurrence;
}
