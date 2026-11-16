"use client";

import { useEffect, useState, type CSSProperties } from "react";
import "./trip-loading.css";

/** What the planner is doing, in order. Shown one at a time; the last stays until the plan arrives. */
const steps = (hub?: string | null) => [
  `Reading the places in ${hub ?? "all five cities"}`,
  "Matching them to what you like",
  "Checking opening hours and closures",
  "Fitting lunch and dinner around them",
  "Walking the routes between stops",
];
const STEP_MS = 2200;

/** The dotted route across the hills, with a pin at each of four stops along it. */
// Starts right of the caption (bottom left) and stays mostly central, which survives cropping on narrow screens.
const ROUTE = "M300 214 C380 196 420 222 480 208 S600 190 660 210 S800 204 860 194";
const PINS: [number, number][] = [[300, 214], [480, 208], [660, 210], [860, 194]];

const delay = (seconds: number): CSSProperties => ({ animationDelay: `${seconds}s` });

/**
 * Loading state for the trip page, per the design system: the banner, then three day rails of card-shaped blocks.
 * The banner draws a small Italian landscape (sun, dome, campanile, arcade, cypresses) while a route draws itself
 * across it; the caption says what the planner is doing.
 */
export function TripLoading({ hub }: { hub?: string | null }) {
  const lines = steps(hub);
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep((n) => Math.min(n + 1, lines.length - 1)), STEP_MS);
    return () => clearInterval(id);
  }, [lines.length]);

  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      <header className="an-trip">
        <span className="an-photo an-trip-photo" aria-hidden="true">
          <Landscape />
        </span>
        <span className="an-trip-scrim" />
        <div className="an-trip-text an-on-photo">
          <div className="an-overline an-on-photo">Planning</div>
          <h1 className="an-trip-title">Your trip</h1>
          <div className="an-trip-meta" role="status" aria-live="polite">
            <span key={step} className="tl-caption">{lines[step]}</span>
          </div>
          <div className="tl-steps" aria-hidden="true">
            {lines.map((_, i) => (
              <span key={i} className={`tl-step ${i <= step ? "tl-step-on" : ""}`} />
            ))}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-[repeat(3,minmax(300px,1fr))] gap-4 overflow-hidden" aria-hidden="true">
        {[0, 1, 2].map((day) => (
          <div key={day} className="flex flex-col gap-0 rounded-xl bg-surface-sunken p-3">
            <div className={`tl-card mb-4 flex flex-col gap-2 px-2`} style={delay(0.2 + day * 0.25)}>
              <span className={`tl-shimmer h-3 w-16 rounded-pill`} />
              <span className={`tl-shimmer h-7 w-40 rounded-md`} />
            </div>
            {[0, 1, 2, 3].map((card) => {
              const t = 0.6 + day * 0.25 + card * 0.45;
              return (
                <div key={card}>
                  {card > 0 && <div className="tl-leg" style={delay(t - 0.15)} />}
                  <div className={`tl-card flex gap-3 rounded-lg bg-surface-raised p-3 shadow-card`} style={delay(t)}>
                    <span className={`tl-shimmer size-[84px] shrink-0 rounded-md`} />
                    <span className="flex min-w-0 flex-1 flex-col gap-2 pt-1">
                      <span className={`tl-shimmer h-3 w-12 rounded-pill`} />
                      <span className={`tl-shimmer h-4 rounded-sm`} style={{ width: `${70 - ((card + day) % 3) * 12}%` }} />
                      <span className={`tl-shimmer h-3 w-11/12 rounded-sm`} />
                      <span className={`tl-shimmer h-3 w-1/3 rounded-sm`} />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/** A 960×240 scene, sliced to fill the banner around its centre (the skyline). Shapes use the design system's
 * art colours. */
function Landscape() {
  return (
    <svg viewBox="0 0 960 240" preserveAspectRatio="xMidYMid slice" className="tl-scene">
      <defs>
        <mask id="trip-loading-route" maskUnits="userSpaceOnUse">
          <path d={ROUTE} pathLength={1} className="tl-route-mask" />
        </mask>
      </defs>

      <rect className="an-a-sky" width="960" height="240" />
      <circle className={`an-a-sun tl-sun`} cx="770" cy="70" r="34" />

      <path className={`an-a-earth tl-far-hills`} d="M-30 172 C100 128 220 150 330 140 C450 126 530 162 650 146 C770 130 870 152 990 134 V240 H-30Z" />

      {/* Skyline: a dome, a campanile, an arcade, cypresses. Each rises in turn. */}
      <g className="tl-rise" style={delay(0.5)}>
        <rect className="an-a-earth" x="262" y="140" width="80" height="36" />
        <rect className="an-a-earth" x="282" y="118" width="40" height="24" />
        <path className="an-a-earth" d="M278 120 A24 27 0 0 1 326 120 Z" />
        <rect className="an-a-earth" x="299" y="84" width="6" height="12" />
        <rect className="an-a-light" x="296" y="148" width="12" height="18" rx="6" />
      </g>
      <g className="tl-rise" style={delay(0.75)}>
        <rect className="an-a-ink" x="410" y="82" width="22" height="94" />
        <path className="an-a-ink" d="M405 84 L421 66 L437 84 Z" />
        <rect className="an-a-sun" x="417" y="92" width="8" height="10" rx="4" />
        <rect className="an-a-light" x="417" y="122" width="8" height="10" rx="4" />
      </g>
      <g className="tl-rise" style={delay(1)}>
        <rect className="an-a-earth" x="510" y="138" width="130" height="38" />
        {[0, 1, 2, 3, 4].map((i) => (
          <path key={i} className="an-a-sky" d={`M${520 + i * 24} 176 V160 a8 8 0 0 1 16 0 V176 Z`} />
        ))}
        <rect className="an-a-ink" x="506" y="134" width="138" height="5" />
      </g>
      {[[200, 0.35], [216, 0.45], [700, 1.15], [714, 1.25], [866, 1.35]].map(([x, d]) => (
        <ellipse key={x} className={`an-a-brand tl-rise`} cx={x} cy="150" rx="7" ry="27" style={delay(d)} />
      ))}

      <path className="an-a-brand" d="M-10 202 C140 168 260 210 400 190 C540 172 660 214 800 192 C880 180 930 190 970 184 V240 H-10Z" />

      {/* The route draws itself, a pin drops at each stop, and a small traveller follows it. */}
      <path d={ROUTE} className="tl-route" mask="url(#trip-loading-route)" />
      {PINS.map(([x, y], i) => (
        <g key={i} className={`tl-pin tl-pin-${i}`}>
          <path className="tl-pin-head" d={`M${x} ${y - 4} c-8 -9 -10 -14 -10 -18 a10 10 0 0 1 20 0 c0 4 -2 9 -10 18 Z`} />
          <circle className="tl-pin-dot" cx={x} cy={y - 22} r="3.5" />
        </g>
      ))}
      <circle className="tl-traveller" r="6">
        <animateMotion dur="6s" repeatCount="indefinite" keyPoints="0;1;1" keyTimes="0;0.75;1" calcMode="linear" path={ROUTE} />
      </circle>
    </svg>
  );
}
