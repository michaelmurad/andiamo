"use client";

import { format } from "date-fns";
import Form from "next/form";
import { Suspense, useState, type ReactNode } from "react";
import { Button, Chip, HubCard, Icon, PaceToggle, type IconName, type PlaceKind } from "@/components/andiamo";
import { HUBS as HUB_NAMES } from "@/lib/data/types";
import { hubPhoto } from "@/lib/hub-photos";
import { MAX_TRIP_DAYS, defaultSettings, tripLength } from "@/lib/plan/settings";
import type { Interest, Pace } from "@/lib/plan/types";
import { plusDays, shortDate } from "@/lib/time";

const HUBS: { name: string; blurb: string; kind: PlaceKind }[] = [
  { name: "Rome", blurb: "Ruins and late dinners", kind: "history" },
  { name: "Florence", blurb: "Renaissance art", kind: "art" },
  { name: "Milan", blurb: "Design and aperitivo", kind: "evening" },
  { name: "Venice", blurb: "Canals and islands", kind: "city" },
  { name: "Bologna", blurb: "Food first", kind: "food" },
];

const INTERESTS: { label: string; icon: IconName }[] = [
  { label: "Food", icon: "utensils" },
  { label: "Art", icon: "palette" },
  { label: "History", icon: "landmark" },
  { label: "Outdoors", icon: "trees" },
  { label: "Hidden gems", icon: "map" },
  { label: "Avoid crowds", icon: "footprints" },
];

const AUTO = "Pick for me";

const INTEREST_IDS: Record<string, Interest> = {
  Food: "food",
  Art: "art",
  History: "history",
  Outdoors: "outdoors",
  "Hidden gems": "hidden-gems",
};

export function SetupForm() {
  const [hub, setHub] = useState("Rome");
  const [interests, setInterests] = useState<string[]>(["Food", "Art"]);
  const [pace, setPace] = useState("Balanced");

  const toggle = (label: string) =>
    setInterests((current) => (current.includes(label) ? current.filter((l) => l !== label) : [...current, label]));

  // A GET form: the trip page reads everything from the URL (the dates default there when they're missing).
  // The cards, chips and toggle are buttons, so their choices travel in hidden fields.
  return (
    <Form action="/trip" className="flex flex-col gap-8">
      <input type="hidden" name="hub" value={(HUB_NAMES as readonly string[]).includes(hub) ? hub : "auto"} />
      <input type="hidden" name="pace" value={pace.toLowerCase() as Pace} />
      <input type="hidden" name="likes" value={interests.flatMap((i) => INTEREST_IDS[i] ?? []).join(",")} />
      <input type="hidden" name="crowds" value={interests.includes("Avoid crowds") ? "avoid" : "ok"} />

      <section>
        <h2 className="mb-3 text-overline uppercase text-ink-muted">When</h2>
        {/* Today's date is only known per visit, so the picker renders in the browser. */}
        <Suspense fallback={<DateField label="Start date" />}>
          <TripDatesPicker />
        </Suspense>
      </section>

      <section>
        <h2 className="mb-3 text-overline uppercase text-ink-muted">Base</h2>
        <div className="-m-2 flex gap-3 overflow-x-auto p-2">
          {HUBS.map((h) => (
            <HubCard key={h.name} {...h} photo={hubPhoto(h.name)?.portrait} className="shrink-0" selected={hub === h.name} onClick={() => setHub(h.name)} />
          ))}
          <HubCard name={AUTO} blurb="Based on what you like" auto className="shrink-0" selected={hub === AUTO} onClick={() => setHub(AUTO)} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-overline uppercase text-ink-muted">What you like</h2>
        <div className="flex flex-wrap items-center gap-2">
          {INTERESTS.map((i) => (
            <Chip key={i.label} icon={i.icon} selected={interests.includes(i.label)} onClick={() => toggle(i.label)}>
              {i.label}
            </Chip>
          ))}
        </div>
        <div className="mt-4">
          <PaceToggle value={pace} onChange={setPace} />
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <input
          name="notes"
          type="text"
          placeholder="Anything else? (optional)"
          aria-label="Anything else?"
          className="h-13 w-full max-w-[560px] rounded-md border border-line-strong bg-surface-raised px-4 text-body text-ink placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        />
        <Button type="submit" variant="primary" size="lg" icon="sparkles">
          Plan my trip
        </Button>
      </div>
    </Form>
  );
}

function DateField({ label, children }: { label: string; children?: ReactNode }) {
  return (
    <label className="inline-flex h-13 min-w-48 items-center gap-3 rounded-md border border-line-strong bg-surface-raised px-4 text-body font-semibold focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand">
      <Icon name="calendar-days" size={20} className="text-ink-muted" />
      <span className="sr-only">{label}</span>
      {children}
    </label>
  );
}

const dateInputClass = "bg-transparent text-ink outline-none";

/** Sends `start` and `days`; the end date is only how the traveller picks the length, so it has no name. */
function TripDatesPicker() {
  const [today] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const defaults = defaultSettings(today);
  const [start, setStart] = useState(defaults.startDate);
  const [days, setDays] = useState(Math.min(defaults.days, MAX_TRIP_DAYS));
  const end = plusDays(start, days - 1);

  // Moving the start keeps the trip length; the end can only fall within the allowed range.
  const changeEnd = (value: string) => value && setDays(tripLength(start, value));

  return (
    <div className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="days" value={days} />
      <DateField label="Start date">
        <input
          name="start"
          type="date"
          required
          min={today}
          value={start}
          onChange={(e) => e.target.value && setStart(e.target.value)}
          className={dateInputClass}
        />
      </DateField>
      <span className="text-body text-ink-muted">to</span>
      <DateField label="End date">
        <input
          type="date"
          required
          min={start}
          max={plusDays(start, MAX_TRIP_DAYS - 1)}
          value={end}
          onChange={(e) => changeEnd(e.target.value)}
          className={dateInputClass}
        />
      </DateField>
      <span className="text-caption text-ink-muted">
        {shortDate(start)} – {shortDate(end)} · {days} {days === 1 ? "day" : "days"} (up to {MAX_TRIP_DAYS})
      </span>
    </div>
  );
}
