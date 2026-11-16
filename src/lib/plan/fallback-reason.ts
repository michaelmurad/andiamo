import { mentionsTiming } from "@/lib/ai/select";

/** First words that make a clause advice or a continuation rather than a reason ("Combine with…", "and…"). */
const NOT_A_REASON = new Set([
  "arrive", "book", "bring", "climb", "combine", "come", "cross", "don't", "dress", "go", "grab", "hike", "learn",
  "let", "order", "pre-book", "queue", "rent", "reserve", "share", "skip", "split", "stand", "start", "take", "tell",
  "visit", "walk", "watch", "booking",
  "and", "but", "if", "or", "so", "then", "to", "which", "before", "why", "what", "how",
]);

/** Clauses that are a travel time or run the place down: true, but not a reason to go. */
const NOT_A_SELLING_POINT = /\b\d+\s*(minutes?|mins?|hours?|hrs?)\b|\b\d+-hour\b|tourist[- ](trap|magnet)|expensive|overpriced|inflated|not a substitute/i;

/** Said when no part of the description reads as a reason. */
export const ROUND_OUT = "Added to round out your day.";

const MIN = 20;
const MAX = 120;

/**
 * A reason for a stop the model didn't give one for (the scheduler added it to fill the day, or its reason was
 * blanked for promising a time). Picks the first clause of the description that reads as a reason: not advice,
 * not a promise of a day or time, not a travel time or a put-down, short enough for a card. Falls back to smaller
 * pieces of a clause, then to a plain line. Always a full sentence.
 */
export function fallbackReason(description: string, placeName: string): string {
  const clauses = description.split(/(?<=[.!?])\s+|\s[—–]\s/).map((c) => c.trim()).filter(Boolean);
  // A clause cut at a comma keeps its subject ("the Forum is where the city actually happened, and walking…");
  // the part after a comma can be the tail of a list ("…, and tiramisu from a local nonna"), so only the head counts.
  const pieces = clauses.map((c) => c.split(",")[0]);
  const ok = (c: string) =>
    c.length >= MIN &&
    c.length <= MAX &&
    !NOT_A_REASON.has(firstWord(c)) &&
    !NOT_A_SELLING_POINT.test(c) &&
    !mentionsTiming(c, placeName);
  const pick = clauses.find(ok) ?? pieces.find(ok);
  return pick ? asSentence(pick) : ROUND_OUT;
}

const firstWord = (c: string) => c.split(/\s+/)[0].toLowerCase().replace(/[^a-z'-]/g, "");

function asSentence(text: string): string {
  const t = text.replace(/[\s,;:—–-]+$/, "");
  const capped = t.charAt(0).toUpperCase() + t.slice(1);
  return /[.!?…]$/.test(capped) ? capped : `${capped}.`;
}
