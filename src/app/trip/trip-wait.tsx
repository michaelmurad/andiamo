"use client";

import Link from "next/link";
import { useEffect, useEffectEvent, useState } from "react";
import { Button } from "@/components/andiamo";
import "./trip-wait.css";

const R = 88;
const C = 2 * Math.PI * R;

export interface TripWaitProps {
  /** Seconds until the planner takes requests again. Without it, this is an error with a manual retry. */
  retryAfterSeconds?: number;
  message?: string;
  onRetry: () => void;
}

/**
 * Shown in the middle of the trip page when the planner is rate-limited or unreachable. An espresso cup steams
 * inside a ring; when rate-limited the ring drains as the wait counts down, then the trip is requested again.
 */
export function TripWait({ retryAfterSeconds, message, onRetry }: TripWaitProps) {
  const busy = retryAfterSeconds !== undefined;
  const total = Math.max(1, retryAfterSeconds ?? 1);
  const [left, setLeft] = useState(total);
  // An Effect Event reads the latest onRetry without making the countdown restart when the parent re-renders.
  const retryNow = useEffectEvent(onRetry);

  useEffect(() => {
    if (!busy) return;
    const id = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [busy]);

  // Runs once when the countdown reaches zero: `left` only ever reaches 0 once per mount.
  useEffect(() => {
    if (busy && left === 0) retryNow();
  }, [busy, left]);

  const drained = busy ? C * (1 - left / total) : 0;

  return (
    <section className="flex min-h-[70vh] flex-col items-center justify-center gap-6 px-4 text-center">
      <svg viewBox="0 0 200 200" className="size-56" aria-hidden="true">
        <circle className="tw-ring-track" cx="100" cy="100" r={R} />
        {busy && <circle className="tw-ring" cx="100" cy="100" r={R} strokeDasharray={C} strokeDashoffset={drained} />}
        <g className="tw-orbit">
          <g transform="translate(100 12) rotate(30)">
            <ellipse className="tw-bean" rx="7" ry="10" />
            <path className="tw-bean-line" d="M0 -8 C-3 -3 3 3 0 8" />
          </g>
        </g>
        <path className="tw-steam" d="M84 80 c-7 -9 7 -15 0 -24 c-7 -9 7 -15 0 -24" />
        <path className="tw-steam tw-steam-2" d="M100 76 c-7 -9 7 -15 0 -24 c-7 -9 7 -15 0 -24" />
        <path className="tw-steam tw-steam-3" d="M116 80 c-7 -9 7 -15 0 -24 c-7 -9 7 -15 0 -24" />
        <g className="tw-cup-group">
          <ellipse className="tw-saucer" cx="100" cy="146" rx="58" ry="10" />
          <circle className="tw-handle" cx="140" cy="112" r="11" />
          <path className="tw-cup" d="M62 98 H138 V112 A38 34 0 0 1 62 112 Z" />
          <rect className="tw-band" x="62" y="104" width="76" height="4" />
          <ellipse className="tw-coffee" cx="100" cy="98" rx="38" ry="7" />
          <ellipse className="tw-crema" cx="100" cy="98" rx="20" ry="3.5" />
        </g>
      </svg>

      <div className="tw-text flex max-w-md flex-col items-center gap-2">
        <div className="an-overline">{busy ? "Busy right now" : "Something went wrong"}</div>
        <h1 className="font-display text-day-title">{busy ? "A short pause" : "Couldn't plan your trip"}</h1>
        <p className="text-body text-ink-muted" role="status" aria-live="polite">
          {busy ? (
            left > 0 ? (
              <>Lots of trips are being planned at once. Yours starts again in <span className="tw-count whitespace-nowrap font-semibold text-ink">{left} s.</span></>
            ) : (
              "Trying again now."
            )
          ) : (
            message ?? "The planner didn't answer. Try again in a moment."
          )}
        </p>
      </div>

      <div className="tw-text flex flex-wrap items-center justify-center gap-3">
        {!busy && (
          <Button variant="primary" onClick={onRetry}>
            Try again
          </Button>
        )}
        <Link href="/" className="an-btn an-btn-secondary an-btn-md">
          Change trip
        </Link>
      </div>
    </section>
  );
}
