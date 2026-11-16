import { z } from "zod";
import { HUBS } from "@/lib/data/types";
import { TripSettingsSchema } from "./settings";
import { PACES, type Plan } from "./types";

/**
 * A plan coming back from the browser for an edit. Untrusted: it is bounded here, and the scheduler re-derives
 * everything but the stops' places, times and locks, which only shape the traveller's own trip.
 */
const minutes = z.number().int().min(0).max(48 * 60);
const text = (max: number) => z.string().max(max);

const StopSchema = z.object({
  key: text(80),
  placeId: text(80).nullable(),
  label: text(200),
  slot: z.enum(["morning", "lunch", "afternoon", "dinner", "evening"]),
  start: minutes,
  end: minutes,
  travel: z.object({ minutes: z.number().min(0).max(600), mode: z.enum(["walk", "transit", "train"]) }).nullable(),
  locked: z.boolean(),
  why: text(400),
  warnings: z.array(text(200)).max(10),
});

const PlanShape = z.object({
  hub: z.enum(HUBS),
  settings: TripSettingsSchema,
  days: z
    .array(
      z.object({
        index: z.number().int().min(0),
        pace: z.enum(PACES),
        date: z.iso.date(),
        area: text(80),
        excursion: z.boolean(),
        stops: z.array(StopSchema).max(20),
      }),
    )
    .min(1)
    .max(7),
  unplaced: z.array(z.object({ placeId: text(80), reason: text(200) })).max(60),
  shortlist: z.array(z.object({ id: text(80), reason: text(400) })).max(40),
  excluded: z.array(text(80)).max(60),
}) satisfies z.ZodType<Plan>;

export const PlanSchema = PlanShape.refine(
  (p) => p.days.length === p.settings.days && p.days.every((d, i) => d.index === i),
  "Days don't match the settings",
);
