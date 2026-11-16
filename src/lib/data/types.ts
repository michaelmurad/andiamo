import type { Coords } from "@/lib/geo";
import type { Weekday } from "@/lib/time";
import type { WeeklyHours } from "./parse-hours";

export const HUBS = ["Rome", "Florence", "Milan", "Venice", "Bologna"] as const;
export type Hub = (typeof HUBS)[number];

export const PLACE_TYPES = [
  "historic_site", "neighborhood", "restaurant", "market", "museum",
  "cafe", "viewpoint", "experience", "park", "shop",
] as const;
export type PlaceType = (typeof PLACE_TYPES)[number];

/**
 * A scheduling rule read out of free text (seasonal_notes, description or name).
 * Every rule quotes its `source` so a reader can check the reading against the data.
 */
export type PlaceRule =
  /** Open only in these months. "soft" lowers the score instead of blocking. */
  | { kind: "months"; fromMonth: number; toMonth: number; strength: "hard" | "soft"; source: string }
  /** On this weekday, open only on its nth (or last) occurrence in the month. */
  | { kind: "onlyOnOccurrence"; weekday: Weekday; occurrence: 1 | 2 | 3 | 4 | "last"; source: string }
  /** Better on these weekdays; a score bonus, never a block. */
  | { kind: "preferWeekdays"; weekdays: Weekday[]; source: string }
  /** Something to check before going, optionally only in some months. */
  | { kind: "warning"; text: string; fromMonth?: number; toMonth?: number; source: string }
  | { kind: "bookAhead"; days: number; source: string };

/** Rules that only exist in the overrides table: they change hours before the Place is built. */
export type HoursRule =
  | { kind: "hours"; hours: string; approximate: boolean; source: string }
  | { kind: "seasonalHours"; fromMonth: number; toMonth: number; hours: string; source: string };

export type OverrideRule = PlaceRule | HoursRule;

/**
 * - listed: parsed from the data as given
 * - approximate: from a phrase ("Evenings"), a name ("at Dawn") or a default for the type
 * - assumed-open: a public space with no hours (piazza, bridge, viewpoint); treated as always open
 */
export type HoursConfidence = "listed" | "approximate" | "assumed-open";

export interface SeasonalHours {
  fromMonth: number;
  toMonth: number;
  week: WeeklyHours;
}

export type IssueAction = "fixed" | "flagged" | "excluded";

export interface DataIssue {
  code: string;
  action: IssueAction;
  field: string;
  message: string;
}

export interface Place {
  id: string;
  name: string;
  type: PlaceType;
  city: string;
  region: string;
  hub: Hub;
  neighborhood: string | null;
  /** City + neighborhood. "San Marco" exists in both Florence and Venice. */
  areaKey: string;
  description: string;
  coords: Coords;
  hours: WeeklyHours;
  hoursConfidence: HoursConfidence;
  seasonalHours: SeasonalHours[];
  rules: PlaceRule[];
  durationMinutes: number;
  /** 0 = free, 1–4 = € to €€€€. */
  priceLevel: 0 | 1 | 2 | 3 | 4;
  rating: number;
  tags: string[];
  booking: "required" | "not-required" | "unknown";
  /** Needs a day (or half day) away from the hub: a satellite town or a spot far outside the city. */
  excursion: { zone: string } | null;
  /** Other places at the same coordinates (Trevi by day and by night). Never schedule two of them. */
  sameSpotAs: string[];
  /** False keeps the place browsable but out of automatic plans. */
  autoPlan: boolean;
  issues: DataIssue[];
}
