"use client";

import { useEffect } from "react";
import { TripWait } from "./trip-wait";

/**
 * Catches a crash while planning (a bug, not a rate limit: the planner already falls back to planning without the
 * model when the model fails). `retry` re-fetches and re-renders the trip page.
 */
export default function TripError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-[1164px] flex-col gap-6 px-6 py-8">
      <TripWait message="The planner hit a problem. Try again in a moment." onRetry={retry} />
    </main>
  );
}
