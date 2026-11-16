import { z } from "zod";
import { selectPlaces } from "@/lib/ai/select";
import { PLACE_BY_ID, PLACES } from "@/lib/data/places";
import { allow, clientKey } from "@/lib/rate-limit";
import { schedule } from "@/lib/plan/schedule";
import { TripSettingsSchema } from "@/lib/plan/settings";
import { placeViewsFor } from "@/lib/plan/view";

const Body = z.object({
  settings: TripSettingsSchema,
  notes: z.string().max(500).default(""),
});

export async function POST(request: Request) {
  const allowance = allow(clientKey(request));
  if (!allowance.ok) {
    const seconds = allowance.retryAfterSeconds;
    return Response.json(
      { error: "Too many trips planned at once", retryAfterSeconds: seconds },
      { status: 429, headers: { "Retry-After": String(seconds) } },
    );
  }

  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: z.prettifyError(body.error) }, { status: 400 });
  const { settings, notes } = body.data;

  // The model ranks; the scheduler decides. If the model fails for any reason, plan without it.
  const selection = await selectPlaces(settings, notes).catch((error: unknown) => {
    console.error("selectPlaces failed; planning without the model", error);
    return null;
  });
  if (selection?.unknownIds.length) console.warn("Model returned unknown ids", selection.unknownIds);

  const plan = schedule({
    settings: { ...settings, hub: selection?.hub ?? settings.hub },
    places: PLACES,
    shortlist: selection?.picks,
  });
  return Response.json({ plan, places: placeViewsFor(plan, PLACE_BY_ID), source: selection ? "ai" : "fallback", prompt: selection?.prompt ?? null });
}
