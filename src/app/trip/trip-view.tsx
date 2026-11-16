"use client";

import { useRouter } from "next/navigation";
import { use } from "react";
import { BrowseRow, DayColumn, TripHeader, type DaySlot, type DayStop } from "@/components/andiamo";
import type { PlanResult } from "@/lib/plan/plan-trip";
import type { Slot, Stop } from "@/lib/plan/types";
import type { PlaceView } from "@/lib/plan/view";
import { TripWait } from "./trip-wait";
import { formatClock, plusDays, shortDate } from "@/lib/time";

const SLOT_LABEL: Record<Slot, DaySlot["label"]> = {
  morning: "Morning",
  lunch: "Lunch",
  afternoon: "Afternoon",
  dinner: "Dinner",
  evening: "Evening",
};
const SLOT_ORDER: Slot[] = ["morning", "lunch", "afternoon", "dinner", "evening"];

/**
 * Renders the plan the trip page started on the server. `result` streams in; until it resolves, the surrounding
 * Suspense boundary shows the loading screen. Failures arrive as `{ error }`, so they get the wait or error screen,
 * and Try again re-runs the server render.
 */
export function TripView({ result: pending }: { result: Promise<PlanResult> }) {
  const router = useRouter();
  const result = use(pending);
  if ("error" in result) {
    return <TripWait retryAfterSeconds={result.retryAfterSeconds} message={result.error} onRetry={() => router.refresh()} />;
  }

  const { plan, places } = result.data;
  const last = plusDays(plan.settings.startDate, plan.days.length - 1);
  return (
    <>
      <TripHeader
        eyebrow={`${plan.days.length} days`}
        title={plan.hub}
        meta={[`${shortDate(plan.settings.startDate)} – ${shortDate(last)}`, `${capitalize(plan.settings.pace)} pace`]}
      />
      <div className="grid snap-x grid-flow-col auto-cols-[minmax(300px,1fr)] items-start gap-4 overflow-x-auto pb-2">
        {plan.days.map((day) => (
          <DayColumn
            key={day.date}
            className="w-auto snap-start"
            eyebrow={`Day ${day.index + 1}${day.excursion ? " · Day trip" : ""}`}
            title={shortDate(day.date)}
            summary={day.area}
            slots={toSlots(day.stops, places)}
          />
        ))}
      </div>
      {plan.unplaced.length > 0 && (
        <section>
          <h2 className="mb-1 text-overline uppercase text-ink-muted">Couldn&apos;t fit</h2>
          {plan.unplaced.map((u) => {
            const p = places[u.placeId];
            return p && <BrowseRow key={u.placeId} name={p.name} type={p.category} kind={p.kind} rating={p.rating} reason={u.reason} />;
          })}
        </section>
      )}
    </>
  );
}

function toSlots(stops: Stop[], places: Record<string, PlaceView>): DaySlot[] {
  return SLOT_ORDER.flatMap((slot) => {
    const inSlot = stops.filter((s) => s.slot === slot);
    if (!inSlot.length) return [];
    return [{ label: SLOT_LABEL[slot], stops: inSlot.map((s) => toDayStop(s, s.placeId ? places[s.placeId] : undefined)) }];
  });
}

function toDayStop(stop: Stop, place: PlaceView | undefined): DayStop {
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
          mode: stop.travel.mode === "walk" ? "walk" : "transit",
          note: stop.travel.mode === "train" ? "train" : undefined,
        }
      : undefined,
  };
}

const capitalize = (s: string) => s[0].toUpperCase() + s.slice(1);
