import { z } from "zod";
import { haversineKm, medianPoint, type Coords } from "@/lib/geo";
import { hm } from "@/lib/time";
import { OVERRIDES, SAME_VISIT, SATELLITES } from "./overrides";
import { everyDay, parseHours, type WeeklyHours } from "./parse-hours";
import {
  HUBS, PLACE_TYPES,
  type DataIssue, type Hub, type HoursConfidence, type OverrideRule, type Place, type PlaceRule, type PlaceType, type SeasonalHours,
} from "./types";

/** The shape of one record in italy.json, as delivered. Structure is strict; meaning is checked below. */
export const RawPlaceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(PLACE_TYPES),
  city: z.string().min(1),
  region: z.string().min(1),
  neighborhood: z.string().nullable(),
  description: z.string(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  hours: z.string().nullable(),
  duration_minutes: z.number().int().positive().nullable(),
  price_range: z.string().regex(/^€{1,4}$/),
  rating: z.number().min(0).max(5),
  tags: z.array(z.string()),
  seasonal_notes: z.string().nullable(),
  booking_required: z.boolean().nullable(),
});
export type RawPlace = z.infer<typeof RawPlaceSchema>;

export interface Rejected {
  index: number;
  id?: string;
  reason: string;
}

export interface NormalizeResult {
  places: Place[];
  rejected: Rejected[];
}

/** A point this far from the rest of its city is a data error, not a day trip. */
const COORD_ERROR_KM = 50;
/** Further than this from its city, a place needs its own day (Chianti is 21 km from Florence). */
const EXCURSION_KM = 15;
/** Cities with fewer places than this have no meaningful centre to compare against. */
const MIN_PLACES_FOR_CENTER = 3;
const LOW_RATING = 3;

const DEFAULT_DURATION: Partial<Record<PlaceType, number>> = { viewpoint: 30, historic_site: 30 };
const PUBLIC_SPACES: PlaceType[] = ["viewpoint", "neighborhood", "historic_site", "park"];

/**
 * Turns raw records into Places. Nothing is dropped silently: every change is recorded as an issue on the
 * place, and a record that can't be used at all is returned in `rejected` with the reason.
 */
export function normalizePlaces(raw: unknown, overrides: Record<string, OverrideRule[]> = OVERRIDES): NormalizeResult {
  const rejected: Rejected[] = [];
  const records: RawPlace[] = [];

  const list = Array.isArray(raw) ? raw : [];
  if (!Array.isArray(raw)) rejected.push({ index: -1, reason: "Expected an array of places" });
  list.forEach((item, index) => {
    const result = RawPlaceSchema.safeParse(item);
    if (result.success) records.push(result.data);
    else rejected.push({ index, id: (item as { id?: string })?.id, reason: z.prettifyError(result.error) });
  });

  const seen = new Set<string>();
  const unique = records.filter((r, index) => {
    if (!seen.has(r.id)) return seen.add(r.id);
    rejected.push({ index, id: r.id, reason: "Duplicate id" });
    return false;
  });

  const ctx = buildContext(unique);
  const places: Place[] = [];
  unique.forEach((record, index) => {
    const result = normalizePlace(record, ctx, overrides[record.id] ?? []);
    if ("reason" in result) rejected.push({ index, id: record.id, reason: result.reason });
    else places.push(result);
  });
  return { places, rejected };
}

interface Context {
  records: RawPlace[];
  cityCenter: Map<string, Coords>;
  bySpot: Map<string, string[]>;
  sameVisit: Map<string, { others: string[]; source: string }>;
}

function buildContext(records: RawPlace[]): Context {
  const byCity = Map.groupBy(records, (r) => r.city);
  const cityCenter = new Map<string, Coords>();
  for (const [city, rs] of byCity) {
    if (rs.length >= MIN_PLACES_FOR_CENTER) cityCenter.set(city, medianPoint(rs.map(coordsOf)));
  }
  const bySpot = new Map<string, string[]>();
  for (const r of records) bySpot.set(spotKey(r), [...(bySpot.get(spotKey(r)) ?? []), r.id]);
  const sameVisit = new Map<string, { others: string[]; source: string }>();
  for (const { ids, source } of SAME_VISIT) for (const id of ids) sameVisit.set(id, { others: ids.filter((o) => o !== id), source });
  return { records, cityCenter, bySpot, sameVisit };
}

const coordsOf = (r: RawPlace): Coords => ({ lat: r.latitude, lon: r.longitude });
const spotKey = (r: RawPlace) => `${r.latitude},${r.longitude}`;

function normalizePlace(r: RawPlace, ctx: Context, overrides: OverrideRule[]): Place | { reason: string } {
  const issues: DataIssue[] = [];
  const issue = (code: string, action: DataIssue["action"], field: string, message: string) =>
    issues.push({ code, action, field, message });

  // Hub: which of the five bases this place is reached from.
  const satellite = SATELLITES[r.city];
  const hub: Hub | undefined = (HUBS as readonly string[]).includes(r.city) ? (r.city as Hub) : satellite?.hub;
  if (!hub) return { reason: `City "${r.city}" is not a hub or a known satellite town` };

  // Coordinates: catch points that sit far from the rest of their city.
  let coords = coordsOf(r);
  let excursion: Place["excursion"] = satellite ? { zone: satellite.zone } : null;
  const center = ctx.cityCenter.get(r.city);
  const km = center ? haversineKm(coords, center) : 0;
  if (km > COORD_ERROR_KM) {
    const neighbors = ctx.records.filter((o) => o.id !== r.id && o.city === r.city && r.neighborhood && o.neighborhood === r.neighborhood);
    coords = neighbors.length ? medianPoint(neighbors.map(coordsOf)) : center!;
    const where = neighbors.length ? `the other ${r.neighborhood} places` : `the middle of ${r.city}`;
    issue("COORDS_OUTLIER", "fixed", "longitude", `${Math.round(km)} km from the rest of ${r.city}; moved to ${where}`);
  } else if (km > EXCURSION_KM) {
    excursion = { zone: r.name };
    issue("FAR_FROM_CITY", "flagged", "latitude", `${Math.round(km)} km from central ${r.city}; planned as a day trip`);
  }

  // Hours: an override from free text wins, then the listed hours, then a default for the type.
  const hoursRule = overrides.find((o) => o.kind === "hours");
  let hours: WeeklyHours;
  let hoursConfidence: HoursConfidence;
  if (hoursRule) {
    hours = mustParse(hoursRule.hours, r.id);
    hoursConfidence = hoursRule.approximate ? "approximate" : "listed";
    issue("HOURS_FROM_TEXT", "fixed", "hours", `Hours set to ${hoursRule.hours}. ${hoursRule.source}`);
  } else if (r.hours === null) {
    ({ hours, hoursConfidence } = defaultHours(r));
    issue("HOURS_MISSING", "flagged", "hours", hoursConfidence === "assumed-open"
      ? "No hours; a public space, assumed open 6:00–24:00"
      : `No hours; assumed ${r.tags.includes("evening") ? "18:00–23:30" : "9:00–18:00"}`);
  } else {
    const parsed = parseHours(r.hours);
    if (parsed.ok) {
      hours = parsed.week;
      hoursConfidence = parsed.approximate ? "approximate" : "listed";
      if (parsed.approximate) issue("HOURS_VAGUE", "flagged", "hours", `"${r.hours}" read as approximate hours`);
      else if (parsed.daysImplied) issue("DAYS_IMPLIED", "flagged", "hours", `"${r.hours}" names no days; assumed every day`);
    } else {
      ({ hours, hoursConfidence } = defaultHours(r));
      issue("HOURS_UNREADABLE", "flagged", "hours", `${parsed.reason}; using a default`);
    }
  }

  const seasonalHours: SeasonalHours[] = overrides.flatMap((o) =>
    o.kind === "seasonalHours" ? [{ fromMonth: o.fromMonth, toMonth: o.toMonth, week: mustParse(o.hours, r.id) }] : [],
  );
  for (const o of overrides) if (o.kind === "seasonalHours") issue("SEASONAL_HOURS", "fixed", "seasonal_notes", o.source);

  const rules = overrides.filter((o): o is PlaceRule => o.kind !== "hours" && o.kind !== "seasonalHours");
  for (const rule of rules) issue("RULE_FROM_TEXT", "fixed", "seasonal_notes", `${ruleSummary(rule)}. ${rule.source}`);
  if (r.seasonal_notes && overrides.length === 0) {
    issue("NOTE_AS_TEXT", "flagged", "seasonal_notes", `Kept as advice, no scheduling rule: "${r.seasonal_notes}"`);
  }

  // Duration
  let durationMinutes = r.duration_minutes;
  if (durationMinutes === null) {
    durationMinutes = DEFAULT_DURATION[r.type] ?? 60;
    issue("DURATION_MISSING", "fixed", "duration_minutes", `No visit length; assumed ${durationMinutes} min`);
  }

  // Tags: one spelling per tag.
  const tags = [...new Set(r.tags.map(canonicalTag))];
  const respelled = r.tags.filter((t) => t !== canonicalTag(t));
  if (respelled.length) issue("TAG_SPELLING", "fixed", "tags", `Respelled ${respelled.map((t) => `"${t}"`).join(", ")}`);

  // Price
  let priceLevel = r.price_range.length as Place["priceLevel"];
  if (tags.includes("free") && priceLevel > 0) {
    issue("PRICE_FREE", "fixed", "price_range", `Tagged free but priced ${r.price_range}; shown as free`);
    priceLevel = 0;
  } else if (tags.includes("budget") && priceLevel >= 2) {
    issue("PRICE_TAG_CONFLICT", "flagged", "price_range", `Tagged budget but priced ${r.price_range}; price kept`);
  }

  const booking = r.booking_required === null ? "unknown" : r.booking_required ? "required" : "not-required";
  if (booking === "unknown") issue("BOOKING_UNKNOWN", "flagged", "booking_required", "Booking requirement missing");

  const autoPlan = r.rating >= LOW_RATING;
  if (!autoPlan) issue("LOW_RATING", "excluded", "rating", `Rated ${r.rating}; browsable but never planned automatically`);

  const sameCoords = (ctx.bySpot.get(spotKey(r)) ?? []).filter((id) => id !== r.id);
  if (sameCoords.length) issue("SAME_SPOT", "flagged", "latitude", `Same coordinates as ${sameCoords.join(", ")}; never planned together`);
  const sameVisit = ctx.sameVisit.get(r.id);
  if (sameVisit) issue("SAME_VISIT", "flagged", "description", `${sameVisit.source}; never planned together`);
  const sameSpotAs = [...new Set([...sameCoords, ...(sameVisit?.others ?? [])])];

  return {
    id: r.id,
    name: r.name,
    type: r.type,
    city: r.city,
    region: r.region,
    hub,
    neighborhood: r.neighborhood,
    areaKey: `${r.city}/${r.neighborhood ?? "-"}`,
    description: r.description,
    coords,
    hours,
    hoursConfidence,
    seasonalHours,
    rules,
    durationMinutes,
    priceLevel,
    rating: r.rating,
    tags,
    booking,
    excursion,
    sameSpotAs,
    autoPlan,
    issues,
  };
}

export const canonicalTag = (tag: string) => tag.trim().toLowerCase().replace(/[\s_]+/g, "-");

function defaultHours(r: RawPlace): { hours: WeeklyHours; hoursConfidence: HoursConfidence } {
  if (PUBLIC_SPACES.includes(r.type)) return { hours: everyDay({ open: hm(6), close: hm(24) }), hoursConfidence: "assumed-open" };
  if (r.tags.includes("evening")) return { hours: everyDay({ open: hm(18), close: hm(23, 30) }), hoursConfidence: "approximate" };
  return { hours: everyDay({ open: hm(9), close: hm(18) }), hoursConfidence: "approximate" };
}

/** Override hours are ours, not the data's: a typo there is a bug, so fail loudly. */
function mustParse(hours: string, id: string): WeeklyHours {
  const parsed = parseHours(hours);
  if (!parsed.ok) throw new Error(`Override hours for ${id} don't parse: ${parsed.reason}`);
  return parsed.week;
}

function ruleSummary(rule: PlaceRule): string {
  switch (rule.kind) {
    case "months":
      return `${rule.strength === "hard" ? "Only" : "Best"} in months ${rule.fromMonth}–${rule.toMonth}`;
    case "onlyOnOccurrence":
      return `On weekday ${rule.weekday}, only the ${rule.occurrence} of the month`;
    case "preferWeekdays":
      return `Better on weekday ${rule.weekdays.join(", ")}`;
    case "warning":
      return `Warning: ${rule.text}`;
    case "bookAhead":
      return `Book ${rule.days} days ahead`;
  }
}
