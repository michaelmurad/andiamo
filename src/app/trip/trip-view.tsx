"use client";

import { useRouter } from "next/navigation";
import { use, useState, useTransition } from "react";
import { BrowseRow, DayColumn, TripHeader } from "@/components/andiamo";
import type { PlanResult } from "@/lib/plan/plan-trip";
import { plusDays, shortDate } from "@/lib/time";
import { toSlots } from "./day-slots";
import { TripLoading } from "./trip-loading";
import { TripWait } from "./trip-wait";

/**
 * Renders the plan the trip page started on the server. `result` streams in; until it resolves, the surrounding
 * Suspense boundary shows the loading screen. A rate limit arrives as `{ error }` and gets the wait screen; its
 * retry re-runs the server render in a transition, and the loading screen shows while that's pending.
 */
export function TripView({ result: pending, hub }: { result: Promise<PlanResult>; hub: string | null }) {
  const router = useRouter();
  const result = use(pending);
  const [retrying, startRetry] = useTransition();
  // Counts retries so each wait screen starts its own countdown.
  const [attempt, setAttempt] = useState(0);
  const retry = () => {
    setAttempt((n) => n + 1);
    startRetry(() => router.refresh());
  };

  if (retrying) return <TripLoading hub={hub} />;
  if ("error" in result) {
    return <TripWait key={attempt} retryAfterSeconds={result.retryAfterSeconds} message={result.error} onRetry={retry} />;
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
            slots={toSlots(day.stops, places, plan.hub)}
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

const capitalize = (s: string) => s[0].toUpperCase() + s.slice(1);
