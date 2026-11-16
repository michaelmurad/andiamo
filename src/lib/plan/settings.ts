import { z } from "zod";
import { HUBS } from "@/lib/data/types";
import { plusDays, weekdayOf, type IsoDate } from "@/lib/time";
import { INTERESTS, PACES, type TripSettings } from "./types";

export const TripSettingsSchema = z.object({
  startDate: z.iso.date(),
  days: z.number().int().min(1).max(7),
  hub: z.enum(HUBS).nullable(),
  pace: z.enum(PACES),
  interests: z.array(z.enum(INTERESTS)).max(INTERESTS.length),
  avoidCrowds: z.boolean(),
  maxPrice: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  dayTrip: z.enum(["auto", "none"]),
}) satisfies z.ZodType<TripSettings>;

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

/** Settings live in the URL so a plan can be reloaded or shared. */
export function toSearchParams(s: TripSettings, notes = ""): URLSearchParams {
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
  return params;
}

/** Reads settings back from the URL. Anything missing or invalid falls back to the default. */
export function fromSearchParams(params: URLSearchParams, today: IsoDate): { settings: TripSettings; notes: string } {
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
  return { settings: parsed.success ? parsed.data : d, notes: (get("notes") ?? "").slice(0, 500) };
}
