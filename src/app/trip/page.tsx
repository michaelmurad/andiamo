import { format } from "date-fns";
import { headers } from "next/headers";
import { connection } from "next/server";
import { Suspense } from "react";
import { allow, clientKey } from "@/lib/rate-limit";
import { planTrip, type PlanResult } from "@/lib/plan/plan-trip";
import { fromSearchParams } from "@/lib/plan/settings";
import { TripLoading } from "./trip-loading";
import { TripView } from "./trip-view";

type SearchParams = PageProps<"/trip">["searchParams"];

export default function TripPage({ searchParams }: PageProps<"/trip">) {
  return (
    <main className="mx-auto flex w-full max-w-[1164px] flex-col gap-6 px-6 py-8">
      {/* The shell prerenders; the trip depends on the URL, so it renders per request and streams in. */}
      <Suspense fallback={<TripLoading />}>
        <Trip searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

/**
 * Starts planning on the server and streams the result: the loading screen shows at once, and the plan arrives
 * when the model and the scheduler are done. Planning is a paid model call, so it runs only for a real request:
 * `connection()` stops every prerender and prefetch pass here, including ones that already know the search params.
 */
async function Trip({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const query = toQuery(await searchParams);
  const { settings, notes } = fromSearchParams(query, format(new Date(), "yyyy-MM-dd"));
  const allowance = allow(clientKey(await headers()));
  const result: Promise<PlanResult> = allowance.ok
    ? planTrip(settings, notes).then(
        (data) => ({ data }),
        (error: unknown) => {
          console.error("planTrip failed", error);
          return { error: "The planner didn't answer" };
        },
      )
    : Promise.resolve({ error: "Too many trips planned at once", retryAfterSeconds: allowance.retryAfterSeconds });

  // Keyed by the URL: Try again adds a retry count to it, so the boundary remounts and shows the loading screen
  // instead of keeping the old screen up. The key must be the same in the HTML and the payload the browser
  // hydrates; a random one per render leaves a fresh page load stuck on the outer fallback.
  return (
    <Suspense key={query.toString()} fallback={<TripLoading hub={settings.hub} />}>
      <TripView result={result} />
    </Suspense>
  );
}

function toQuery(params: Awaited<SearchParams>): URLSearchParams {
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    const value = Array.isArray(v) ? v[0] : v;
    if (value !== undefined) query.set(k, value);
  }
  return query;
}
