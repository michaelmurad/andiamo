import type { DaySlot, DayStop, LegMode } from "@/components/andiamo";
import type { Hub } from "@/lib/data/types";
import type { TravelMode } from "@/lib/geo";
import type { Slot, Stop } from "@/lib/plan/types";
import { directionsUrl, type PlaceView } from "@/lib/plan/view";
import { formatClock } from "@/lib/time";

const SLOT_LABEL: Record<Slot, DaySlot["label"]> = {
  morning: "Morning",
  lunch: "Lunch",
  afternoon: "Afternoon",
  dinner: "Dinner",
  evening: "Evening",
};
const SLOT_ORDER: Slot[] = ["morning", "lunch", "afternoon", "dinner", "evening"];

/** A day's stops as the columns draw them: grouped by slot, in slot order, each with the leg that leads to it. */
export function toSlots(stops: Stop[], places: Record<string, PlaceView>, hub: Hub): DaySlot[] {
  // Each leg runs from the last stop that had a place (the scheduler doesn't move for a placeless meal);
  // the first leg of the day starts at the hotel, which has no address, so Maps starts from the viewer.
  let from: PlaceView | null = null;
  const views = new Map<Stop, DayStop>();
  for (const stop of stops) {
    const place = stop.placeId ? places[stop.placeId] : undefined;
    views.set(stop, toDayStop(stop, place, from, hub));
    if (place) from = place;
  }
  return SLOT_ORDER.flatMap((slot) => {
    const inSlot = stops.filter((s) => s.slot === slot);
    if (!inSlot.length) return [];
    return [{ label: SLOT_LABEL[slot], stops: inSlot.map((s) => views.get(s)!) }];
  });
}

/** The vehicle to name. Venice's local transit is the vaporetto; elsewhere it's a mix of bus, tram and metro. */
export function legMode(mode: TravelMode, hub: Hub): LegMode {
  if (mode === "transit" && hub === "Venice") return "boat";
  return mode;
}

function toDayStop(stop: Stop, place: PlaceView | undefined, from: PlaceView | null, hub: Hub): DayStop {
  return {
    time: formatClock(stop.start),
    title: stop.label,
    why: stop.why,
    kind: place?.kind ?? "food",
    category: place?.category ?? "Your pick",
    duration: place?.duration,
    rating: place?.rating,
    price: place?.price,
    warning: stop.warnings.length ? stop.warnings.join(" · ") : undefined,
    leg: stop.travel
      ? {
          minutes: stop.travel.minutes,
          mode: legMode(stop.travel.mode, hub),
          directionsUrl: place
            ? directionsUrl(from?.mapsQuery ?? null, place.mapsQuery, stop.travel.mode === "walk" ? "walking" : "transit")
            : undefined,
        }
      : undefined,
  };
}
