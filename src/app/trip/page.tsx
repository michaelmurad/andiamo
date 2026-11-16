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
  const { settings, notes } = fromSearchParams(toQuery(await searchParams), format(new Date(), "yyyy-MM-dd"));
  const allowance = allow(clientKey(await headers()));
  // Being rate-limited is expected, so it's a value the page renders. A planner crash is a bug: the promise
  // rejects, `use` throws in the browser, and error.tsx catches it.
  const result: Promise<PlanResult> = allowance.ok
    ? planTrip(settings, notes).then((data) => ({ data }))
    : Promise.resolve({ error: "Too many trips planned at once", retryAfterSeconds: allowance.retryAfterSeconds });

  return (
    <Suspense fallback={<TripLoading hub={settings.hub} />}>
      <TripView result={result} hub={settings.hub} />
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
