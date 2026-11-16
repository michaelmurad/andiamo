import { selectPlaces } from "@/lib/ai/select";
import { PLACE_BY_ID, PLACES } from "@/lib/data/places";
import { schedule } from "./schedule";
import type { PlanOptions } from "./settings";
import type { Plan, TripSettings } from "./types";
import { placeViewsFor, type PlaceView } from "./view";

export interface PlanResponse {
  plan: Plan;
  places: Record<string, PlaceView>;
  source: "ai" | "fallback";
  prompt: string | null;
}

/** What the trip page renders: a plan, or why there isn't one (rate-limited, or the planner failed). */
export type PlanResult = { data: PlanResponse } | { error: string; retryAfterSeconds?: number };

/**
 * Plans a trip. The model ranks; the scheduler decides. If the model fails for any reason, or `useModel` is off,
 * the trip is planned without it. Used by the trip page (streamed to the browser) and by /api/plan.
 */
export async function planTrip(settings: TripSettings, notes: string, { useModel }: PlanOptions = { useModel: true }): Promise<PlanResponse> {
  const selection = !useModel
    ? null
    : await selectPlaces(settings, notes).catch((error: unknown) => {
        console.error("selectPlaces failed; planning without the model", error);
        return null;
      });
  if (selection?.unknownIds.length) console.warn("Model returned unknown ids", selection.unknownIds);

  const plan = schedule({
    settings: { ...settings, hub: selection?.hub ?? settings.hub },
    places: PLACES,
    shortlist: selection?.picks,
  });
  return { plan, places: placeViewsFor(plan, PLACE_BY_ID), source: selection ? "ai" : "fallback", prompt: selection?.prompt ?? null };
}
