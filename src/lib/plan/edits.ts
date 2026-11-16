import { PLACE_BY_ID, PLACES } from "@/lib/data/places";
import type { Place } from "@/lib/data/types";
import { hm, type Minutes } from "@/lib/time";
import { availableOn, earliestStart } from "./availability";
import { DINNER, LUNCH, PACE_RULES, schedule, type Excursion } from "./schedule";
import type { Day, Lock, Pace, Plan, Stop } from "./types";

/**
 * The only things the "Ask" box can do to a plan. The model returns a list of these; code applies each,
 * re-runs the scheduler with untouched stops held in place, and rejects anything that fails validation.
 *
 * `day` is 1-based, the way the traveller says it ("day 2"). Stop keys come from the plan.
 */
export type EditOp =
  | { op: "remove"; stopKey: string }
  | { op: "add"; placeId: string; day: number }
  | { op: "swap"; stopKey: string; placeId: string }
  | { op: "lock"; stopKey: string }
  | { op: "setPace"; day: number; pace: Pace }
  /** The model needs one answer before it can act: a question with button options. */
  | { op: "ask"; question: string; options: string[] };

export type EditResult =
  | { kind: "edited"; plan: Plan; changed: string[]; summary: string }
  | { kind: "ask"; question: string; options: string[] }
  /** Every op is checked before anything is shown; one failure rejects the whole list. */
  | { kind: "invalid"; errors: string[] };

/**
 * Applies the ops in order, all or nothing. Each op holds every stop it doesn't touch where it is; only if that
 * can't work does it let the rest of the affected day move, and then the whole day. Never another day.
 */
export function applyEdits(plan: Plan, ops: EditOp[], byId: ReadonlyMap<string, Place> = PLACE_BY_ID): EditResult {
  const ask = ops.find((o) => o.op === "ask");
  if (ask) return { kind: "ask", question: ask.question, options: ask.options };
  if (!ops.length) return { kind: "invalid", errors: ["No change was asked for"] };

  let current = plan;
  const phrases: string[] = [];
  for (const op of ops) {
    const step = applyOne(current, op, byId);
    if ("error" in step) return { kind: "invalid", errors: [step.error] };
    current = step.plan;
    phrases.push(step.phrase);
  }
  return { kind: "edited", plan: current, changed: changedKeys(plan, current), summary: sentence(phrases) };
}

type Step = { plan: Plan; phrase: string } | { error: string };

function applyOne(plan: Plan, op: EditOp, byId: ReadonlyMap<string, Place>): Step {
  switch (op.op) {
    case "remove": {
      const found = findStop(plan, op.stopKey);
      if (!found) return { error: `No stop ${op.stopKey} in the plan` };
      const { day, stop } = found;
      if (!stop.placeId) return { error: `${stop.label} is an open meal slot, not a place to remove` };
      const next = settle(
        { ...plan, excluded: [...new Set([...plan.excluded, stop.placeId])] },
        { day: day.index, from: stop.start, without: stop.placeId },
        (p) => !placed(p, stop.placeId!),
      );
      return next ? { plan: next, phrase: `removed ${stop.label} from day ${day.index + 1}` } : { error: `${stop.label} couldn't be removed cleanly` };
    }

    case "swap": {
      const found = findStop(plan, op.stopKey);
      if (!found) return { error: `No stop ${op.stopKey} in the plan` };
      const { day, stop } = found;
      const place = byId.get(op.placeId);
      const problem = checkPlace(plan, day, place, op.placeId, stop.placeId);
      if (problem) return { error: problem };
      const p = place!;
      if (isMealOnly(p) && stop.slot !== "lunch" && stop.slot !== "dinner") {
        return { error: `${p.name} is a restaurant, so it can only replace lunch or dinner` };
      }
      const window = stop.slot === "lunch" ? LUNCH : stop.slot === "dinner" ? DINNER : null;
      const starts = candidateStarts(p, day, [stop.start], window);
      if (!starts.length) return { error: `${p.name} isn't open around ${clock(stop.start)}` };
      const base = { ...plan, excluded: plan.excluded.filter((id) => id !== p.id && id !== stop.placeId).concat(stop.placeId ?? []) };
      const next = best(starts.map((start) =>
        settle(base, { day: day.index, from: stop.start, without: stop.placeId, add: { placeId: p.id, day: day.index, start } },
          (n) => landed(n, day.index, p) && !placed(n, stop.placeId)),
      ), plan, day.index);
      return next ? { plan: next, phrase: `swapped ${stop.label} for ${p.name} on day ${day.index + 1}` } : { error: `${p.name} doesn't fit in place of ${stop.label}` };
    }

    case "add": {
      const day = plan.days[op.day - 1];
      if (!day) return { error: `There is no day ${op.day}` };
      const place = byId.get(op.placeId);
      const problem = checkPlace(plan, day, place, op.placeId, null);
      if (problem) return { error: problem };
      const p = place!;
      const rules = PACE_RULES[day.pace];
      const from = [rules.dayStart, ...day.stops.map((s) => s.start), hm(15), hm(17)];
      const windows = isMealOnly(p) ? [LUNCH, DINNER] : [null];
      const starts = windows.flatMap((w) => candidateStarts(p, day, w ? [w.from, w.from + 30, w.from + 60] : from, w));
      if (!starts.length) return { error: `${p.name} isn't open on day ${op.day}` };
      const base = { ...plan, excluded: plan.excluded.filter((id) => id !== p.id) };
      const next = best(starts.map((start) =>
        settle(base, { day: day.index, from: start, add: { placeId: p.id, day: day.index, start } }, (n) => landed(n, day.index, p)),
      ), plan, day.index);
      return next ? { plan: next, phrase: `added ${p.name} to day ${op.day}` } : { error: `${p.name} doesn't fit on day ${op.day}` };
    }

    case "lock": {
      const found = findStop(plan, op.stopKey);
      if (!found) return { error: `No stop ${op.stopKey} in the plan` };
      if (!found.stop.placeId) return { error: `${found.stop.label} is an open meal slot, not a place to lock` };
      const days = plan.days.map((d) => ({ ...d, stops: d.stops.map((s) => (s.key === op.stopKey ? { ...s, locked: true } : s)) }));
      return { plan: { ...plan, days }, phrase: `locked ${found.stop.label} in place` };
    }

    case "setPace": {
      const day = plan.days[op.day - 1];
      if (!day) return { error: `There is no day ${op.day}` };
      if (day.pace === op.pace) return { error: `Day ${op.day} is already ${op.pace}` };
      const paced = { ...plan, days: plan.days.map((d) => (d.index === day.index ? { ...d, pace: op.pace } : d)) };
      const next = reschedule(paced, day.index, []);
      return { plan: next, phrase: `made day ${op.day} ${op.pace}` };
    }
  }
  return { error: "Unknown change" };
}

interface Target {
  day: number;
  /** Where the edit happens on that day. Stops after it may move if holding everything doesn't work. */
  from: Minutes;
  /** The place leaving the plan, if any. */
  without?: string | null;
  /** The place arriving, locked at its start. A stop the traveller asked for by name stays put. */
  add?: Lock;
}

/**
 * Re-plans the target day with as much of it held in place as possible: first every other stop, then the stops
 * before the edit, then nothing but the traveller's locks. Other days come back exactly as they were. Returns the
 * first plan that meets `ok` and keeps every held stop where it was; null when none does.
 */
function settle(plan: Plan, t: Target, ok: (next: Plan) => boolean): Plan | null {
  const keep: ((s: Stop) => boolean)[] = [() => true, (s) => s.start < t.from, () => false];
  for (const rule of keep) {
    const pins = pinsOn(plan, t.day, rule).filter((l) => l.placeId !== t.without);
    const next = reschedule(plan, t.day, pins, t.add ? [t.add] : [], t.without);
    if (ok(next) && held(next, pins)) return next;
  }
  return null;
}

/** The day's unlocked stops a rule keeps, as pins. Locked stops are passed as locks and always kept. */
const pinsOn = (plan: Plan, day: number, keep: (s: Stop) => boolean): Lock[] =>
  plan.days[day].stops.filter((s) => s.placeId && !s.locked && keep(s)).map((s) => ({ placeId: s.placeId!, day, start: s.start }));

/** Plans `day` again around its pins and locks; every other day is kept as it is. */
function reschedule(plan: Plan, day: number, pins: Lock[], extraLocks: Lock[] = [], dropLock?: string | null): Plan {
  const locks = plan.days[day].stops
    .filter((s) => s.locked && s.placeId && s.placeId !== dropLock)
    .map((s) => ({ placeId: s.placeId!, day, start: s.start }))
    .concat(extraLocks);
  return schedule({
    settings: { ...plan.settings, hub: plan.hub },
    places: PLACES,
    shortlist: plan.shortlist,
    locks,
    pins,
    excluded: plan.excluded,
    trip: tripOf(plan),
    dayPaces: plan.days.map((d) => d.pace),
    keep: plan.days.filter((d) => d.index !== day),
  });
}

const tripOf = (plan: Plan): Excursion | null => {
  const d = plan.days.find((day) => day.excursion);
  return d ? { zone: d.area, day: d.index } : null;
};

/** Every pin landed on its day at its time. A pin that had to move means the edit disturbed the plan. */
const held = (plan: Plan, pins: Lock[]) =>
  pins.every((l) => plan.days[l.day]?.stops.some((s) => s.placeId === l.placeId && s.start === l.start));

const placed = (plan: Plan, placeId: string | null) => !!placeId && plan.days.some((d) => d.stops.some((s) => s.placeId === placeId));

/** The place is on that day, open when it's planned, and a restaurant became a meal. */
function landed(plan: Plan, day: number, p: Place): boolean {
  const stop = plan.days[day]?.stops.find((s) => s.placeId === p.id);
  if (!stop) return false;
  if (stop.warnings.includes("May be closed at this time")) return false;
  return !isMealOnly(p) || stop.slot === "lunch" || stop.slot === "dinner";
}

/** Of the plans that worked, the one that keeps most of the day it changed. Earliest start breaks ties. */
function best(options: (Plan | null)[], before: Plan, day: number): Plan | null {
  const had = new Set(before.days[day].stops.map((s) => s.placeId).filter(Boolean));
  let winner: { plan: Plan; kept: number } | null = null;
  for (const plan of options) {
    if (!plan) continue;
    const kept = plan.days[day].stops.filter((s) => s.placeId && had.has(s.placeId) && before.days[day].stops.some((o) => o.placeId === s.placeId && o.start === s.start)).length;
    if (!winner || kept > winner.kept) winner = { plan, kept };
  }
  return winner?.plan ?? null;
}

/** Starts where the place is open for its whole visit, from each time given, inside `window` if there is one. */
function candidateStarts(p: Place, day: Day, from: Minutes[], window: { from: Minutes; to: Minutes } | null): Minutes[] {
  const starts = new Set<Minutes>();
  for (const t of from) {
    const s = earliestStart(p, day.date, window ? Math.max(t, window.from) : t, p.durationMinutes);
    if (s === null) continue;
    if (window && (s < window.from || s > window.to)) continue;
    starts.add(s);
  }
  return [...starts].sort((a, b) => a - b);
}

/** Why a place can't go on this day, in a few words; null when it can. */
function checkPlace(plan: Plan, day: Day, place: Place | undefined, id: string, replacing: string | null): string | null {
  if (!place) return `No place ${id} in the list`;
  if (place.hub !== plan.hub) return `${place.name} is in the ${place.hub} area, not ${plan.hub}`;
  if (!place.autoPlan) return `${place.name}: ${place.issues.find((i) => i.action === "excluded")?.message ?? "not plannable"}`;
  if (place.id !== replacing && placed(plan, place.id)) {
    const on = plan.days.find((d) => d.stops.some((s) => s.placeId === place.id))!;
    return `${place.name} is already on day ${on.index + 1}`;
  }
  if (place.excursion && !(day.excursion && day.area === place.excursion.zone)) return `${place.name} is a day trip to ${place.excursion.zone}`;
  const open = availableOn(place, day.date);
  if (!open.ok) return `${place.name}: ${open.reason}`;
  return null;
}

function findStop(plan: Plan, key: string): { day: Day; stop: Stop } | null {
  for (const day of plan.days) {
    const stop = day.stops.find((s) => s.key === key);
    if (stop) return { day, stop };
  }
  return null;
}

/** Stops that are new, or moved, since `before`. These get the "Changed" mark. */
export function changedKeys(before: Plan, after: Plan): string[] {
  const old = new Map(before.days.flatMap((d) => d.stops.map((s) => [s.key, s])));
  return after.days.flatMap((d) =>
    d.stops.filter((s) => {
      const o = old.get(s.key);
      return !o || o.placeId !== s.placeId || o.start !== s.start || o.end !== s.end;
    }).map((s) => s.key),
  );
}

/** "Swapped X for Y on day 2 and added Z to day 1." One sentence, for the undo bar. */
function sentence(phrases: string[]): string {
  const joined = phrases.length > 1 ? `${phrases.slice(0, -1).join(", ")} and ${phrases.at(-1)}` : phrases[0];
  return `${joined[0].toUpperCase()}${joined.slice(1)}.`;
}

const isMealOnly = (p: Place) => p.type === "restaurant";
const clock = (m: Minutes) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
