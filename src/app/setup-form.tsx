"use client";

import Form from "next/form";
import { useState } from "react";
import { Button, Chip, HubCard, Icon, PaceToggle, type IconName, type PlaceKind } from "@/components/andiamo";
import { HUBS as HUB_NAMES } from "@/lib/data/types";
import type { Interest, Pace } from "@/lib/plan/types";

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

  // A GET form: the trip page reads everything from the URL (the start date defaults there when it's missing).
  // The cards, chips and toggle are buttons, so their choices travel in hidden fields.
  return (
    <Form action="/trip" className="flex flex-col gap-8">
      <input type="hidden" name="hub" value={(HUB_NAMES as readonly string[]).includes(hub) ? hub : "auto"} />
      <input type="hidden" name="pace" value={pace.toLowerCase() as Pace} />
      <input type="hidden" name="likes" value={interests.flatMap((i) => INTEREST_IDS[i] ?? []).join(",")} />
      <input type="hidden" name="crowds" value={interests.includes("Avoid crowds") ? "avoid" : "ok"} />

      <section>
        <h2 className="mb-3 text-overline uppercase text-ink-muted">When</h2>
        {/* Placeholder until the date picker exists. The trip page defaults to a Friday three weeks out. */}
        <span className="inline-flex h-13 items-center gap-3 rounded-md border border-line-strong bg-surface-raised px-4 text-body font-semibold">
          <Icon name="calendar-days" size={20} className="text-ink-muted" />
          Fri – Sun, three weeks from now
        </span>
      </section>

      <section>
        <h2 className="mb-3 text-overline uppercase text-ink-muted">Base</h2>
        <div className="-m-2 flex gap-3 overflow-x-auto p-2">
          {HUBS.map((h) => (
            <HubCard key={h.name} {...h} className="shrink-0" selected={hub === h.name} onClick={() => setHub(h.name)} />
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
