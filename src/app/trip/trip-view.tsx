"use client";

import { format } from "date-fns";
import { useSearchParams } from "next/navigation";
import { Suspense, use, useMemo, useState } from "react";
import { BrowseRow, DayColumn, TripHeader, type DaySlot, type DayStop } from "@/components/andiamo";
import { fromSearchParams } from "@/lib/plan/settings";
import type { TripSettings } from "@/lib/plan/types";
import type { Plan, Slot, Stop } from "@/lib/plan/types";
import type { PlaceView } from "@/lib/plan/view";
import { TripLoading } from "./trip-loading";
import { TripWait } from "./trip-wait";
import { formatClock, plusDays, shortDate } from "@/lib/time";

interface PlanResponse {
  plan: Plan;
  places: Record<string, PlaceView>;
  source: "ai" | "fallback";
}

const SLOT_LABEL: Record<Slot, DaySlot["label"]> = {
  morning: "Morning",
  lunch: "Lunch",
  afternoon: "Afternoon",
  dinner: "Dinner",
  evening: "Evening",
};
const SLOT_ORDER: Slot[] = ["morning", "lunch", "afternoon", "dinner", "evening"];

type PlanResult = { data?: PlanResponse; error?: string; retryAfterSeconds?: number };

/**
 * One request per trip, cached so every render reads the same promise: `use` needs a stable promise, React renders
 * twice in development, and each request is a paid model call. Failures resolve to `{ error }` rather than
 * rejecting, so the page shows its own wait or error screen instead of an error boundary; Try again drops the
 * failed entry so the next render asks again.
 */
const plans = new Map<string, Promise<PlanResult>>();

function requestPlan(key: string, settings: TripSettings, notes: string): Promise<PlanResult> {
  let request = plans.get(key);
  if (!request) {
    request = fetch("/api/plan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ settings, notes }) })
      .then(async (res): Promise<PlanResult> => {
        if (res.ok) return { data: (await res.json()) as PlanResponse };
        const body = (await res.json().catch(() => ({}))) as { error?: string; retryAfterSeconds?: number };
        return { error: body.error ?? "The planner didn't answer", retryAfterSeconds: res.status === 429 ? (body.retryAfterSeconds ?? 60) : undefined };
      })
      .catch((): PlanResult => ({ error: "Couldn't reach the planner" }));
    plans.set(key, request);
  }
  return request;
}

export function TripView() {
  const params = useSearchParams();
  const { settings, notes } = useMemo(() => fromSearchParams(params, format(new Date(), "yyyy-MM-dd")), [params]);
  const key = params.toString();
  // Bumped by Try again (or the end of a rate-limit wait) to render again after the failed request is dropped.
  const [attempt, setAttempt] = useState(0);
  const retry = () => {
    plans.delete(key);
    setAttempt((n) => n + 1);
  };

  return (
    <Suspense fallback={<TripLoading hub={settings.hub} />}>
      <TripPlan plan={requestPlan(key, settings, notes)} retryKey={`${key}#${attempt}`} onRetry={retry} />
    </Suspense>
  );
}

function TripPlan({ plan: request, retryKey, onRetry }: { plan: Promise<PlanResult>; retryKey: string; onRetry: () => void }) {
  const result = use(request);
  if (result.error || !result.data) {
    return <TripWait key={retryKey} retryAfterSeconds={result.retryAfterSeconds} message={result.error} onRetry={onRetry} />;
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
      <div className="grid snap-x grid-cols-[repeat(3,minmax(300px,1fr))] items-start gap-4 overflow-x-auto pb-2">
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
