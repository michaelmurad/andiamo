import type { Place } from "@/lib/data/types";
import { monthInRange, monthOf, weekdayOf, type IsoDate, type Minutes } from "@/lib/time";
import type { Interest, ShortlistPick, TripSettings } from "./types";

/** Every scoring knob in one place. Scores land roughly between 0 and 1.2. */
export const WEIGHTS = {
  rating: 0.35,
  interest: 0.4,
  /** Bonus for a place the model shortlisted, scaled by rank. */
  shortlist: 0.35,
  crowds: 0.2,
  overBudget: 0.25,
  offSeason: 0.2,
  preferredDay: 0.1,
  timeOfDay: 0.1,
} as const;

export const INTEREST_TAGS: Record<Interest, string[]> = {
  food: ["food", "wine", "market"],
  art: ["art"],
  history: ["historic", "cultural"],
  outdoors: ["outdoors", "scenic", "views", "active"],
  "hidden-gems": ["hidden-gem", "local-favorite", "quiet"],
};

export interface ScoreContext {
  settings: Pick<TripSettings, "interests" | "avoidCrowds" | "maxPrice">;
  /** Rank by id, from the model's shortlist. */
  shortlistRank?: Map<string, number>;
}

export const rankMap = (picks: ShortlistPick[] | undefined) => new Map((picks ?? []).map((p, i) => [p.id, i]));

/** How good this place is for this traveller on this date, before time and distance. */
export function score(place: Place, date: IsoDate, ctx: ScoreContext): number {
  const { settings, shortlistRank } = ctx;
  let s = WEIGHTS.rating * clamp((place.rating - 3.5) / 1.5);

  s += WEIGHTS.interest * interestMatch(place, settings.interests);

  const rank = shortlistRank?.get(place.id);
  if (rank !== undefined && shortlistRank) s += WEIGHTS.shortlist * (1 - rank / Math.max(shortlistRank.size, 1));

  if (settings.avoidCrowds && place.tags.includes("tourist-heavy")) s -= WEIGHTS.crowds;
  if (place.priceLevel > settings.maxPrice) s -= WEIGHTS.overBudget * (place.priceLevel - settings.maxPrice);

  const month = monthOf(date);
  for (const rule of place.rules) {
    if (rule.kind === "months" && rule.strength === "soft" && !monthInRange(month, rule.fromMonth, rule.toMonth)) s -= WEIGHTS.offSeason;
    if (rule.kind === "preferWeekdays" && rule.weekdays.includes(weekdayOf(date))) s += WEIGHTS.preferredDay;
  }
  return s;
}

/** Share of the chosen interests this place matches; 0.5 when the traveller chose none. */
export function interestMatch(place: Place, interests: Interest[]): number {
  if (interests.length === 0) return 0.5;
  return matchedInterests(place, interests).length / interests.length;
}

export const matchedInterests = (place: Place, interests: Interest[]) =>
  interests.filter((i) => INTEREST_TAGS[i].some((t) => place.tags.includes(t)));

/** Morning places early, evening places late. */
export function timeOfDayFit(place: Place, start: Minutes): number {
  const morning = place.tags.includes("morning");
  const evening = place.tags.includes("evening");
  if (morning && start < 11 * 60) return WEIGHTS.timeOfDay;
  if (evening && start >= 18 * 60) return WEIGHTS.timeOfDay;
  if (evening && start < 16 * 60) return -WEIGHTS.timeOfDay;
  return 0;
}

const clamp = (n: number) => Math.min(1, Math.max(0, n));
