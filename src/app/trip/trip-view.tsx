"use client";

import { useRouter } from "next/navigation";
import { use, useState, useTransition } from "react";
import { AgentQuestion, AskBar, BrowseRow, DayColumn, TripHeader, UndoBar, type DaySlot, type DayStop } from "@/components/andiamo";
import type { Answer, EditResponse } from "@/lib/ai/edit";
import type { PlanResponse, PlanResult } from "@/lib/plan/plan-trip";
import type { Plan, Slot, Stop } from "@/lib/plan/types";
import type { PlaceView } from "@/lib/plan/view";
import { TripWait } from "./trip-wait";
import { formatClock, plusDays, shortDate } from "@/lib/time";

const SLOT_LABEL: Record<Slot, DaySlot["label"]> = {
  morning: "Morning",
  lunch: "Lunch",
  afternoon: "Afternoon",
  dinner: "Dinner",
  evening: "Evening",
};
const SLOT_ORDER: Slot[] = ["morning", "lunch", "afternoon", "dinner", "evening"];

/**
 * Renders the plan the trip page started on the server. `result` streams in; until it resolves, the surrounding
 * Suspense boundary shows the loading screen. Failures arrive as `{ error }`, so they get the wait or error screen,
 * and Try again re-runs the server render.
 */
export function TripView({ result: pending }: { result: Promise<PlanResult> }) {
  const router = useRouter();
  const result = use(pending);
  if ("error" in result) {
    return <TripWait retryAfterSeconds={result.retryAfterSeconds} message={result.error} onRetry={() => router.refresh()} />;
  }
  return <TripEditor initial={result.data} />;
}

interface Shown {
  plan: Plan;
  places: Record<string, PlaceView>;
}

/** The last edit, until the next one. */
interface Undo {
  summary: string;
  previous: Shown;
}

/** What the agent is asking or reporting, if anything. Shown in place of the undo bar, one thing at a time. */
type Notice =
  | { kind: "ask"; question: string; options: string[]; message: string }
  | { kind: "refused"; reason: string }
  | { kind: "failed"; reason: string; message: string; answer?: Answer };

/**
 * The plan screen's state: the plan, which stops the AI just changed, and what the agent last said. One edit can
 * be undone; the undo stays until the next edit.
 */
function TripEditor({ initial }: { initial: PlanResponse }) {
  const [shown, setShown] = useState<Shown>({ plan: initial.plan, places: initial.places });
  const [changed, setChanged] = useState<ReadonlySet<string>>(new Set());
  const [lastEdit, setLastEdit] = useState<Undo | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [text, setText] = useState("");
  const [sending, startSending] = useTransition();

  const { plan, places } = shown;

  const send = (message: string, answer?: Answer) => {
    const before = shown;
    startSending(async () => {
      const reply = await requestEdit(before.plan, message, answer);
      if ("error" in reply) {
        setNotice({ kind: "failed", reason: reply.error, message, answer });
        return;
      }
      if (reply.kind === "edited") {
        setShown({ plan: reply.plan, places: reply.places });
        setChanged(new Set(reply.changed));
        setLastEdit({ summary: reply.summary, previous: before });
        setNotice(null);
        setText("");
      } else if (reply.kind === "unchanged") {
        setNotice(null);
        setText("");
      } else if (reply.kind === "ask") {
        setNotice({ kind: "ask", question: reply.question, options: reply.options, message });
      } else {
        setNotice({ kind: "refused", reason: reply.reason });
      }
    });
  };

  const undo = () => {
    if (!lastEdit) return;
    setShown(lastEdit.previous);
    setChanged(new Set());
    setLastEdit(null);
    setNotice(null);
  };

  const last = plusDays(plan.settings.startDate, plan.days.length - 1);
  const suggestions = [plan.days.length > 1 ? "Slower day 2" : "Slower day", "More food", "Cheaper", "Rainy-day version"];
  return (
    <>
      <TripHeader
        eyebrow={`${plan.days.length} days`}
        title={plan.hub}
        meta={[`${shortDate(plan.settings.startDate)} – ${shortDate(last)}`, `${capitalize(plan.settings.pace)} pace`]}
      />
      <div className="grid snap-x grid-flow-col auto-cols-[minmax(300px,1fr)] items-start gap-4 overflow-x-auto pb-2">
        {plan.days.map((day) => (
          <DayColumn
            key={day.date}
            className="w-auto snap-start"
            eyebrow={`Day ${day.index + 1}${day.excursion ? " · Day trip" : ""}${day.pace !== plan.settings.pace ? ` · ${capitalize(day.pace)}` : ""}`}
            title={shortDate(day.date)}
            summary={day.area}
            slots={toSlots(day.stops, places, changed)}
          />
        ))}
      </div>
      {plan.unplaced.length > 0 && (
        <section>
          <h2 className="mb-1 text-overline uppercase text-ink-muted">Couldn&apos;t fit</h2>
          {plan.unplaced.map((u) => {
            const p = places[u.placeId];
            return p && <BrowseRow key={u.placeId} name={p.name} type={p.category} kind={p.kind} rating={p.rating} reason={u.reason} />;
          })}
        </section>
      )}
      <div className="sticky bottom-6 z-10 flex flex-col items-center gap-3" aria-live="polite">
        {!notice && lastEdit && <UndoBar message={lastEdit.summary} onUndo={undo} />}
        {notice?.kind === "ask" && (
          <AgentQuestion
            question={notice.question}
            options={notice.options}
            onAnswer={(option) => send(notice.message, { question: notice.question, option })}
          />
        )}
        {notice?.kind === "refused" && (
          <AgentQuestion question={notice.reason} options={["Ask something else"]} onAnswer={() => setNotice(null)} />
        )}
        {notice?.kind === "failed" && (
          <AgentQuestion question={notice.reason} options={["Try again"]} onAnswer={() => send(notice.message, notice.answer)} />
        )}
        <AskBar
          suggestions={notice?.kind === "ask" || sending ? [] : suggestions}
          placeholder={sending ? "Changing the plan" : "Ask for a change"}
          value={text}
          onChange={setText}
          onSubmit={(message) => send(message)}
          onSuggestion={(message) => send(message)}
          disabled={sending}
        />
      </div>
    </>
  );
}

async function requestEdit(plan: Plan, message: string, answer?: Answer): Promise<EditResponse | { error: string }> {
  try {
    const res = await fetch("/api/edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan, message, answer }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) return { error: res.status === 429 ? "Too many changes at once. Try again in a minute" : (body?.error ?? "The planner didn't answer") };
    return body as EditResponse;
  } catch {
    return { error: "The planner didn't answer" };
  }
}

function toSlots(stops: Stop[], places: Record<string, PlaceView>, changed: ReadonlySet<string>): DaySlot[] {
  return SLOT_ORDER.flatMap((slot) => {
    const inSlot = stops.filter((s) => s.slot === slot);
    if (!inSlot.length) return [];
    return [{ label: SLOT_LABEL[slot], stops: inSlot.map((s) => ({ ...toDayStop(s, s.placeId ? places[s.placeId] : undefined), changed: changed.has(s.key) })) }];
  });
}

function toDayStop(stop: Stop, place: PlaceView | undefined): DayStop {
  return {
    time: formatClock(stop.start),
    title: stop.label,
    why: stop.why,
    kind: place?.kind ?? "food",
    category: place?.category ?? "Your pick",
    duration: place?.duration,
    rating: place?.rating,
    price: place?.price,
    warning: stop.warnings.length ? stop.warnings.join(" · ") : undefined,
    leg: stop.travel
      ? {
          minutes: stop.travel.minutes,
          mode: stop.travel.mode === "walk" ? "walk" : "transit",
          note: stop.travel.mode === "train" ? "train" : undefined,
        }
      : undefined,
  };
}

const capitalize = (s: string) => s[0].toUpperCase() + s.slice(1);
