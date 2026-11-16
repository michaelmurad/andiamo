import { z } from "zod";
import { HUBS } from "@/lib/data/types";
import { daysBetween, plusDays, weekdayOf, type IsoDate } from "@/lib/time";
import { INTERESTS, PACES, type TripSettings } from "./types";

/** Longest trip the planner accepts. Each day widens the pool of places sent to the model. */
export const MAX_PLANNER_DAYS = 7;

/** Longest trip the setup screen offers. Raise it up to MAX_PLANNER_DAYS; nothing else needs to change. */
export const MAX_TRIP_DAYS = 3;

export const TripSettingsSchema = z.object({
  startDate: z.iso.date(),
  days: z.number().int().min(1).max(MAX_PLANNER_DAYS),
  hub: z.enum(HUBS).nullable(),
  pace: z.enum(PACES),
  interests: z.array(z.enum(INTERESTS)).max(INTERESTS.length),
  avoidCrowds: z.boolean(),
  maxPrice: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  dayTrip: z.enum(["auto", "none"]),
}) satisfies z.ZodType<TripSettings>;

/** Trip length for an inclusive start–end range, kept between 1 and `max` days. */
export function tripLength(start: IsoDate, end: IsoDate, max = MAX_TRIP_DAYS): number {
  return Math.min(Math.max(daysBetween(start, end) + 1, 1), max);
}

/** Next Friday at least three weeks out: far enough to book most places, and a weekend trip. */
export function defaultStartDate(today: IsoDate): IsoDate {
  let date = plusDays(today, 21);
  while (weekdayOf(date) !== 5) date = plusDays(date, 1);
  return date;
}

export const defaultSettings = (today: IsoDate): TripSettings => ({
  startDate: defaultStartDate(today),
  days: 3,
  hub: "Rome",
  pace: "balanced",
  interests: ["food", "art"],
  avoidCrowds: false,
  maxPrice: 3,
  dayTrip: "auto",
});

/**
 * How a trip is planned, as opposed to what the trip is. `useModel: false` (`ai=off` in the URL) skips the model and
 * plans with the scheduler alone: no paid call, and the same plan every time for the same URL.
 */
export interface PlanOptions {
  useModel: boolean;
}

/** Settings live in the URL so a plan can be reloaded or shared. */
export function toSearchParams(s: TripSettings, notes = "", options: PlanOptions = { useModel: true }): URLSearchParams {
  const params = new URLSearchParams({
    start: s.startDate,
    days: String(s.days),
    hub: s.hub ?? "auto",
    pace: s.pace,
    likes: s.interests.join(","),
    crowds: s.avoidCrowds ? "avoid" : "ok",
    price: String(s.maxPrice),
    trip: s.dayTrip,
  });
  if (notes) params.set("notes", notes);
  if (!options.useModel) params.set("ai", "off");
  return params;
}

/** Reads settings back from the URL. Anything missing or invalid falls back to the default. */
export function fromSearchParams(params: URLSearchParams, today: IsoDate): { settings: TripSettings; notes: string; options: PlanOptions } {
  const d = defaultSettings(today);
  const get = (k: string) => params.get(k) ?? undefined;
  const candidate = {
    startDate: get("start") ?? d.startDate,
    days: Number(get("days") ?? d.days),
    hub: get("hub") === "auto" ? null : (get("hub") ?? d.hub),
    pace: get("pace") ?? d.pace,
    interests: get("likes") === undefined ? d.interests : get("likes")!.split(",").filter(Boolean),
    avoidCrowds: get("crowds") === "avoid",
    maxPrice: Number(get("price") ?? d.maxPrice),
    dayTrip: get("trip") ?? d.dayTrip,
  };
  const parsed = TripSettingsSchema.safeParse(candidate);
  return {
    settings: parsed.success ? parsed.data : d,
    notes: (get("notes") ?? "").slice(0, 500),
    // Only an explicit "off" turns the model off; anything else plans as usual.
    options: { useModel: get("ai") !== "off" },
  };
}
