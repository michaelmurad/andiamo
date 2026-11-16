import { Suspense } from "react";
import { TripLoading } from "./trip-loading";
import { TripView } from "./trip-view";

export default function TripPage() {
  return (
    <main className="mx-auto flex w-full max-w-[1164px] flex-col gap-6 px-6 py-8">
      {/* The plan depends on the URL, so it renders in the browser; the skeleton is what prerenders. */}
      <Suspense fallback={<TripLoading />}>
        <TripView />
      </Suspense>
    </main>
  );
}
