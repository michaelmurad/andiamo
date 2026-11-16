import type { Place, Hub } from "@/lib/data/types";
import { HUBS } from "@/lib/data/types";
import { medianPoint, travel, type Coords } from "@/lib/geo";
import { hm, monthInRange, monthOf, tripDates, type IsoDate, type Minutes } from "@/lib/time";
import { fallbackReason } from "./fallback-reason";
import { availableOn, earliestStart, isOpenFor, unavailableReason } from "./availability";
import { rankMap, score, timeOfDayFit, type ScoreContext } from "./score";
import type { Day, Lock, Pace, Plan, ShortlistPick, Slot, Stop, TripSettings, Unplaced } from "./types";

/**
 * How full a day gets. A new visit starts only while the day's visiting time is under `activityMinutes`,
 * so a 20-minute gelato doesn't use up a slot. Meals and one evening stop come on top.
 */
export const PACE_RULES: Record<Pace, { dayStart: Minutes; activityMinutes: number; maxLegMinutes: number }> = {
  relaxed: { dayStart: hm(9, 30), activityMinutes: 240, maxLegMinutes: 30 },
  balanced: { dayStart: hm(9), activityMinutes: 360, maxLegMinutes: 40 },
  packed: { dayStart: hm(8, 30), activityMinutes: 540, maxLegMinutes: 45 },
};

/** Roughly how many visits a day holds at this pace, for comparing places across a trip. */
const visitsPerDay = (pace: Pace) => Math.round(PACE_RULES[pace].activityMinutes / 90);

/** A meal must start inside its window. */
export const LUNCH = { from: hm(12), to: hm(14) };
export const DINNER = { from: hm(19), to: hm(21) };
export const DAY_END = hm(23, 30);
/** Time to get from the last activity to a meal. Activities stop this long before the window closes. */
const MEAL_BUFFER = 15;
/** Never wait longer than this for a place to open. */
const MAX_WAIT = 60;
/** A visit this long runs through lunch; the traveller eats on the way. */
const SPANS_LUNCH = 240;
const EVENING_ACTIVITIES = 1;
const GAP_MEAL_MINUTES = 60;
/** Day trips need a train each way; within a city, legs are capped by the pace. */
const EXCURSION_MAX_LEG = 180;
/** The first visit of the day may leave the hotel this much earlier than the pace's start, for a
 * class or tour with a fixed start (the 9:00 cooking class, the Parma tour). */
const EARLY_START = 90;

export interface ScheduleInput {
  settings: TripSettings;
  places: Place[];
  /** The model's ranked picks. Optional: without them the scheduler still plans from the scores. */
  shortlist?: ShortlistPick[];
  /** The traveller's locked stops: fixed points, shown as locked. */
  locks?: Lock[];
  /** Stops an edit keeps where they are. Fixed points like locks, but not shown as locked. */
  pins?: Lock[];
  /** Places never planned automatically. A lock or pin for one still places it. */
  excluded?: string[];
  /** The day trip to keep, or null for none. Left out, the scheduler chooses. */
  trip?: Excursion | null;
  /** A pace per day, by index. Days left out use the trip's pace. */
  dayPaces?: (Pace | undefined)[];
  /** Days returned exactly as given, so an edit to one day never moves another. Their places count as used. */
  keep?: Day[];
}

/**
 * Deterministic planner. The model can rank places and explain them; this decides what fits.
 *
 * 1. Pick the hub (the traveller's, or the one with the best places for them).
 * 2. Decide whether one day becomes a day trip: only if its best place beats the weakest place
 *    that would otherwise make the plan.
 * 3. Fill each day by walking the clock from the hotel: locked stops are fixed points, lunch and dinner
 *    are anchors, and between them the best open place nearby goes next.
 * 4. Report the high-value places that didn't fit, with the reason.
 */
export function schedule(input: ScheduleInput): Plan {
  const { settings, places } = input;
  const dates = tripDates(settings.startDate, settings.days);
  const ctx: ScoreContext = { settings, shortlistRank: rankMap(input.shortlist) };
  const hub = settings.hub ?? pickHub(places, dates, ctx);
  const hubPlaces = places.filter((p) => p.hub === hub);
  const byId = new Map(places.map((p) => [p.id, p]));
  const reasons = new Map((input.shortlist ?? []).map((p) => [p.id, p.reason]));

  const valid = (l: Lock) => l.day >= 0 && l.day < dates.length && byId.has(l.placeId);
  const userLocks = (input.locks ?? []).filter(valid);
  const lockedIds = new Set(userLocks.map((l) => l.placeId));
  const locks = [
    ...userLocks.map((l) => ({ ...l, user: true })),
    ...(input.pins ?? []).filter((l) => valid(l) && !lockedIds.has(l.placeId)).map((l) => ({ ...l, user: false })),
  ].filter((l, i, all) => all.findIndex((o) => o.placeId === l.placeId) === i);
  const kept = new Map((input.keep ?? []).filter((d) => d.index >= 0 && d.index < dates.length).map((d) => [d.index, d]));
  const used = new Set([...locks.map((l) => l.placeId), ...[...kept.values()].flatMap((d) => d.stops.flatMap((s) => s.placeId ?? []))]);
  const lockedDays = new Set(locks.map((l) => l.day));
  const excluded = new Set(input.excluded ?? []);

  const core = hubPlaces.filter((p) => p.autoPlan && !p.excursion);
  const trip =
    input.trip !== undefined ? input.trip
    : settings.dayTrip === "auto" ? chooseExcursion(hubPlaces, core, dates, ctx, settings.pace, lockedDays)
    : null;
  // The hotel stays put whatever is removed, so an edit never moves every travel leg.
  const hotel = medianPoint(core.map((p) => p.coords));
  const pool = core.filter((p) => !excluded.has(p.id));

  const days: Day[] = dates.map((date, index) => {
    const keep = kept.get(index);
    if (keep) return keep;
    const zone = trip?.day === index ? trip.zone : null;
    const zonePlaces = zone ? hubPlaces.filter((p) => p.autoPlan && p.excursion?.zone === zone && !excluded.has(p.id)) : [];
    const pace = input.dayPaces?.[index] ?? settings.pace;
    return planDay({
      index,
      date,
      area: zone ?? hub,
      excursion: zone !== null,
      hotel,
      daytime: zone ? zonePlaces : pool,
      lunch: zone ? zonePlaces : pool,
      dinner: zone ? [...zonePlaces, ...pool] : pool,
      evening: pool,
      maxLeg: zone ? EXCURSION_MAX_LEG : PACE_RULES[pace].maxLegMinutes,
      locks: locks.filter((l) => l.day === index).map((l) => ({ place: byId.get(l.placeId)!, start: l.start, user: l.user })),
      used,
      ctx,
      pace,
      reasons,
    });
  });

  return {
    hub,
    settings,
    days,
    unplaced: findUnplaced({ hub, hubPlaces, days, dates, ctx, settings, trip, shortlist: input.shortlist, byId, excluded }),
    shortlist: input.shortlist ?? [],
    excluded: [...excluded],
  };
}

/** "Pick for me": the hub whose best places, for this traveller, add up highest. */
export function pickHub(places: Place[], dates: IsoDate[], ctx: ScoreContext): Hub {
  const take = visitsPerDay("balanced") * dates.length;
  const total = (hub: Hub) =>
    places
      .filter((p) => p.hub === hub && p.autoPlan && !p.excursion)
      .map((p) => bestScore(p, dates, ctx))
      .sort((a, b) => b - a)
      .slice(0, take)
      .reduce((sum, s) => sum + s, 0);
  return [...HUBS].sort((a, b) => total(b) - total(a))[0];
}

export interface Excursion {
  zone: string;
  day: number;
}

/** One day trip at most, on the middle-most free day, and only when it beats the city. */
function chooseExcursion(hubPlaces: Place[], core: Place[], dates: IsoDate[], ctx: ScoreContext, pace: Pace, lockedDays: Set<number>): Excursion | null {
  if (dates.length < 2) return null;
  const capacity = visitsPerDay(pace) * dates.length;
  const coreScores = core.filter((p) => !isMealOnly(p)).map((p) => bestScore(p, dates, ctx)).sort((a, b) => b - a);
  // The weakest city place that would make the plan. A day trip has to beat it.
  const bar = coreScores[capacity - 1] ?? -Infinity;

  const middleFirst = dates.map((_, i) => i).filter((i) => !lockedDays.has(i))
    .sort((a, b) => Math.abs(a - (dates.length - 1) / 2) - Math.abs(b - (dates.length - 1) / 2));
  const zones = Map.groupBy(hubPlaces.filter((p) => p.autoPlan && p.excursion && !isMealOnly(p)), (p) => p.excursion!.zone);

  let best: (Excursion & { value: number }) | null = null;
  for (const [zone, ps] of zones) {
    for (const day of middleFirst) {
      const open = ps.filter((p) => availableOn(p, dates[day]).ok);
      if (!open.length) continue;
      const value = Math.max(...open.map((p) => score(p, dates[day], ctx)));
      if (value > bar && (!best || value > best.value)) best = { zone, day, value };
      break; // the first open day in middle-first order is this zone's day
    }
  }
  return best && { zone: best.zone, day: best.day };
}

interface DayInput {
  index: number;
  date: IsoDate;
  area: string;
  excursion: boolean;
  hotel: Coords;
  /** Candidates for morning and afternoon. */
  daytime: Place[];
  lunch: Place[];
  dinner: Place[];
  evening: Place[];
  maxLeg: number;
  /** `user` is a traveller's lock; otherwise an edit's pin, placed the same way but not shown as locked. */
  locks: { place: Place; start: Minutes; user: boolean }[];
  /** Shared across days so nothing is planned twice. */
  used: Set<string>;
  ctx: ScoreContext;
  pace: Pace;
  reasons: Map<string, string>;
}

function planDay(d: DayInput): Day {
  const pace = PACE_RULES[d.pace];
  const scores = new Map<string, number>();
  const base = (p: Place) => scores.get(p.id) ?? scores.set(p.id, score(p, d.date, d.ctx)).get(p.id)!;
  const taken = (p: Place) => d.used.has(p.id) || p.sameSpotAs.some((id) => d.used.has(id));

  const stops: Stop[] = [];
  const pending = [...d.locks].sort((a, b) => a.start - b.start);
  let t = pace.dayStart;
  let at = d.hotel;
  let lunch = false;
  let dinner = false;
  const inWindow = (start: Minutes, w: { from: Minutes; to: Minutes }) => start >= w.from && start <= w.to;
  // Fixed stops use up the day's budget from the start, so the walk doesn't squeeze extra visits in around them.
  const fixedVisits = pending.filter((l) => !(isMealPlace(l.place) && (inWindow(l.start, LUNCH) || inWindow(l.start, DINNER))));
  let activityMinutes = fixedVisits.filter((l) => l.start < DINNER.from).reduce((sum, l) => sum + l.place.durationMinutes, 0);
  let evenings = fixedVisits.filter((l) => l.start >= DINNER.from).length;

  const slotNow = (): Slot => (!lunch ? "morning" : !dinner ? "afternoon" : "evening");
  const lockInWindow = (w: { from: Minutes; to: Minutes }) => pending.some((l) => inWindow(l.start, w) && isMealPlace(l.place));
  /** The latest a visit may end and still reach the next locked stop on time. */
  const fitsBeforeLock = (p: Place, end: Minutes) =>
    !pending[0] || end + travel(p.coords, pending[0].place.coords).minutes <= pending[0].start;

  const push = (place: Place | null, label: string, slot: Slot, start: Minutes, end: Minutes, extra: Partial<Stop> = {}) => {
    const leg = place ? travel(at, place.coords) : null;
    stops.push({
      key: `${d.index}-${place?.id ?? slot}`,
      placeId: place?.id ?? null,
      label,
      slot,
      start,
      end,
      travel: leg && { minutes: leg.minutes, mode: leg.mode },
      locked: false,
      why: place ? (d.reasons.get(place.id) || fallbackReason(place.description, place.name)) : "Nothing in the dataset is open nearby, so this one is your pick.",
      warnings: place ? warningsFor(place, d.date) : [],
      ...extra,
    });
    if (place) {
      d.used.add(place.id);
      at = place.coords;
    }
    t = end;
  };

  /** The best candidate that is open, close enough, worth the wait and done before `limit`. */
  const bestFit = (pool: Place[], limitFor: (p: Place) => Minutes, maxLeg: number, extraValue: (p: Place) => number = () => 0) => {
    let best: { place: Place; start: Minutes; value: number } | null = null;
    for (const p of pool) {
      if (taken(p)) continue;
      const leg = travel(at, p.coords).minutes;
      if (leg > maxLeg) continue;
      const arrive = t + leg;
      let start = earliestStart(p, d.date, arrive, p.durationMinutes);
      // Too late for a fixed-start visit? The first one of the day may leave the hotel earlier.
      // Not when a fixed stop already starts the morning: that stop is the day's start.
      if (start === null && stops.length === 0 && !(pending[0] && pending[0].start < LUNCH.from)) start = earliestStart(p, d.date, pace.dayStart - EARLY_START + leg, p.durationMinutes);
      if (start === null || start - arrive > MAX_WAIT) continue;
      const end = start + p.durationMinutes;
      if (end > limitFor(p) || !fitsBeforeLock(p, end)) continue;
      const wait = Math.max(0, start - arrive);
      const value = base(p) + timeOfDayFit(p, start) + extraValue(p) - 0.004 * leg - 0.003 * wait;
      if (!best || value > best.value) best = { place: p, start, value };
    }
    return best;
  };

  const placeMeal = (which: "lunch" | "dinner") => {
    const w = which === "lunch" ? LUNCH : DINNER;
    const pool = (which === "lunch" ? d.lunch : d.dinner).filter(isMealPlace);
    const from = Math.max(t, w.from);
    let best: { place: Place; start: Minutes; value: number } | null = null;
    for (const p of pool) {
      if (taken(p)) continue;
      const leg = travel(at, p.coords).minutes;
      if (leg > d.maxLeg) continue;
      const start = earliestStart(p, d.date, Math.max(t + leg, w.from), p.durationMinutes);
      if (start === null || start > w.to || !fitsBeforeLock(p, start + p.durationMinutes)) continue;
      const restaurant = p.type === "restaurant" ? 0.05 : 0;
      const value = base(p) + restaurant - 0.004 * leg - 0.003 * (start - Math.max(t + leg, w.from));
      if (!best || value > best.value) best = { place: p, start, value };
    }
    if (best) push(best.place, best.place.name, which, best.start, best.start + best.place.durationMinutes);
    else {
      const end = Math.min(from + GAP_MEAL_MINUTES, pending[0]?.start ?? Infinity);
      push(null, `${which === "lunch" ? "Lunch" : "Dinner"} in ${d.area}`, which, from, end);
    }
    if (which === "lunch") lunch = true;
    else dinner = true;
  };

  const placeLock = () => {
    const { place, start: wanted, user } = pending.shift()!;
    const arrive = t + travel(at, place.coords).minutes;
    const start = Math.max(wanted, arrive);
    const meal = isMealPlace(place) && ((!lunch && inWindow(start, LUNCH)) || (lunch && !dinner && inWindow(start, DINNER)));
    const slot: Slot = meal ? (!lunch ? "lunch" : "dinner") : slotNow();
    const warnings = warningsFor(place, d.date);
    if (start > wanted) warnings.unshift("Moved later to fit the day");
    if (!isOpenFor(place, d.date, start, place.durationMinutes)) warnings.unshift("May be closed at this time");
    const end = start + place.durationMinutes;
    // As in the walk below: a long morning visit that runs through lunch replaces it.
    const spansLunch = slot === "morning" && place.durationMinutes >= SPANS_LUNCH && end > LUNCH.to - MEAL_BUFFER;
    if (spansLunch) warnings.push("Long visit: eat lunch on the way");
    push(place, place.name, slot, start, end, { locked: user, warnings });
    if (slot === "lunch" || spansLunch) lunch = true;
    if (slot === "dinner") dinner = true;
  };

  for (let guard = 0; guard < 40 && t < DAY_END; guard++) {
    if (!lunch && t >= LUNCH.from && !lockInWindow(LUNCH)) { placeMeal("lunch"); continue; }
    if (lunch && !dinner && t >= DINNER.from && !lockInWindow(DINNER)) { placeMeal("dinner"); continue; }

    const phase = slotNow();
    const fit =
      phase === "evening"
        ? evenings < EVENING_ACTIVITIES && bestFit(d.evening.filter((p) => !isMealOnly(p) && p.tags.includes("evening")), () => DAY_END, pace.maxLegMinutes)
        : activityMinutes < pace.activityMinutes &&
          bestFit(
            d.daytime.filter((p) => !isMealOnly(p)),
            (p) => (phase === "morning" && p.durationMinutes < SPANS_LUNCH ? LUNCH.to - MEAL_BUFFER : DINNER.to - MEAL_BUFFER),
            d.maxLeg,
          );

    if (fit) {
      const { place, start } = fit;
      const end = start + place.durationMinutes;
      // Only long visits may run past the lunch window (see limitFor above); they replace lunch.
      const spansLunch = phase === "morning" && end > LUNCH.to - MEAL_BUFFER;
      push(place, place.name, phase, start, end);
      if (spansLunch) {
        lunch = true;
        stops[stops.length - 1].warnings.push("Long visit: eat lunch on the way");
      }
      if (phase === "evening") evenings++;
      else activityMinutes += place.durationMinutes;
      continue;
    }

    // Nothing fits before the next fixed point, so move to it.
    const nextMeal = !lunch ? LUNCH.from : !dinner ? DINNER.from : null;
    if (pending[0] && (nextMeal === null || pending[0].start <= Math.max(t, nextMeal) || lockInWindow(!lunch ? LUNCH : DINNER))) {
      placeLock();
      continue;
    }
    if (nextMeal === null) break;
    t = Math.max(t, nextMeal);
  }
  while (pending.length) placeLock();

  return { index: d.index, pace: d.pace, date: d.date, area: d.area, excursion: d.excursion, stops };
}

interface UnplacedInput {
  hub: Hub;
  hubPlaces: Place[];
  days: Day[];
  dates: IsoDate[];
  ctx: ScoreContext;
  settings: TripSettings;
  trip: Excursion | null;
  shortlist?: ShortlistPick[];
  byId: Map<string, Place>;
  excluded: Set<string>;
}

/** The places a traveller would expect to see: everything shortlisted, plus the top-scored in the hub. */
function findUnplaced(u: UnplacedInput): Unplaced[] {
  const placed = new Set(u.days.flatMap((day) => day.stops.map((s) => s.placeId)));
  const top = u.hubPlaces
    .filter((p) => p.autoPlan && !isMealOnly(p))
    .sort((a, b) => bestScore(b, u.dates, u.ctx) - bestScore(a, u.dates, u.ctx))
    .slice(0, (visitsPerDay(u.settings.pace) + 1) * u.dates.length);
  const wanted = [...(u.shortlist ?? []).map((p) => p.id), ...top.map((p) => p.id)];

  const result: Unplaced[] = [];
  for (const id of new Set(wanted)) {
    const p = u.byId.get(id);
    if (!p || placed.has(id) || u.excluded.has(id)) continue;
    if (p.sameSpotAs.some((other) => placed.has(other))) continue;
    result.push({ placeId: id, reason: whyUnplaced(p, u) });
  }
  return result;
}

function whyUnplaced(p: Place, u: UnplacedInput): string {
  if (p.hub !== u.hub) return `In the ${p.hub} area, not ${u.hub}`;
  if (!p.autoPlan) return p.issues.find((i) => i.action === "excluded")?.message ?? "Not planned automatically";
  const closed = unavailableReason(p, u.dates);
  if (closed) return closed;
  if (p.excursion && p.excursion.zone !== u.trip?.zone) {
    return u.trip ? `A day trip; ${u.trip.zone} scored higher` : "A day trip; the city scored higher";
  }
  return "Didn't fit; other picks scored higher";
}

/** Restaurants are only ever meals. */
const isMealOnly = (p: Place) => p.type === "restaurant";
/** Restaurants, plus food places big enough to be a meal: a market, a food hall, a cicchetti crawl. */
const isMealPlace = (p: Place) =>
  p.type === "restaurant" || (p.tags.includes("food") && p.type !== "museum" && p.durationMinutes >= 60);

const bestScore = (p: Place, dates: IsoDate[], ctx: ScoreContext) => Math.max(...dates.map((d) => score(p, d, ctx)));

function warningsFor(p: Place, date: IsoDate): string[] {
  const warnings: string[] = [];
  const bookAhead = p.rules.find((r) => r.kind === "bookAhead");
  if (bookAhead) warnings.push(`Book ${humanDays(bookAhead.days)} ahead`);
  else if (p.booking === "required") warnings.push("Book ahead");
  else if (p.booking === "unknown") warnings.push("Booking info missing");
  if (p.hoursConfidence === "approximate") warnings.push("Hours not confirmed; check before going");
  const month = monthOf(date);
  for (const r of p.rules) {
    if (r.kind === "warning" && (r.fromMonth === undefined || monthInRange(month, r.fromMonth, r.toMonth ?? r.fromMonth))) {
      warnings.push(r.text);
    }
  }
  return warnings;
}

const humanDays = (days: number) =>
  days >= 56 ? `${Math.round(days / 30)} months` : days >= 14 ? `${Math.round(days / 7)} weeks` : days === 7 ? "a week" : `${days} days`;
