import { z } from "zod";
import { allow, clientKey } from "@/lib/rate-limit";
import { planTrip } from "@/lib/plan/plan-trip";
import { TripSettingsSchema } from "@/lib/plan/settings";

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

  return Response.json(await planTrip(settings, notes));
}
