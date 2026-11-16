import type { Hub } from "@/lib/data/types";
import type { TravelMode } from "@/lib/geo";
import type { IsoDate, Minutes } from "@/lib/time";

export const PACES = ["relaxed", "balanced", "packed"] as const;
export type Pace = (typeof PACES)[number];

export const INTERESTS = ["food", "art", "history", "outdoors", "hidden-gems"] as const;
export type Interest = (typeof INTERESTS)[number];

export interface TripSettings {
  startDate: IsoDate;
  /** Trip length is a parameter, never a hardcoded 3. */
  days: number;
  /** null means "Pick for me". */
  hub: Hub | null;
  pace: Pace;
  interests: Interest[];
  avoidCrowds: boolean;
  /** Highest price level to favour, 1 (€) to 4 (€€€€). Pricier places are penalized, not removed. */
  maxPrice: 1 | 2 | 3 | 4;
  /** "auto" lets the scheduler choose one excursion day when it beats a day in the city. */
  dayTrip: "auto" | "none";
}

/** A place the model picked, with its one-line reason. Order is rank. */
export interface ShortlistPick {
  id: string;
  reason: string;
}

export interface Lock {
  placeId: string;
  day: number;
  start: Minutes;
}

export type Slot = "morning" | "lunch" | "afternoon" | "dinner" | "evening";

export interface Stop {
  /** Stable key for React and for edit operations. */
  key: string;
  /** null for a meal slot with no dataset place open nearby. */
  placeId: string | null;
  label: string;
  slot: Slot;
  start: Minutes;
  end: Minutes;
  /** Travel from the previous stop (or the hotel, for the first stop). */
  travel: { minutes: number; mode: TravelMode } | null;
  locked: boolean;
  why: string;
  warnings: string[];
}

export interface Day {
  index: number;
  /** Usually the trip's pace; an edit can change one day's ("Slower day 2"). */
  pace: Pace;
  date: IsoDate;
  /** "Rome" or a day trip like "Lake Como". */
  area: string;
  excursion: boolean;
  stops: Stop[];
}

export interface Unplaced {
  placeId: string;
  reason: string;
}

export interface Plan {
  hub: Hub;
  settings: TripSettings;
  days: Day[];
  /** High-value places that didn't make it, and why. Nothing is dropped silently. */
  unplaced: Unplaced[];
  /** The model's ranked picks, kept so an edit re-plans with the same ranking and reasons. */
  shortlist: ShortlistPick[];
  /** Places the traveller removed. Never planned again unless they ask for one by name. */
  excluded: string[];
}
