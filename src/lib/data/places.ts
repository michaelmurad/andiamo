import raw from "@/data/italy.json";
import { normalizePlaces } from "./normalize";
import type { Place } from "./types";

/**
 * The cleaned dataset. Normalized once when the module loads: 103 records cost nothing, there's no
 * generated file to go stale, and tests run exactly the same function.
 */
export const { places: PLACES, rejected: REJECTED } = normalizePlaces(raw);

export const PLACE_BY_ID: ReadonlyMap<string, Place> = new Map(PLACES.map((p) => [p.id, p]));

export function getPlace(id: string): Place {
  const place = PLACE_BY_ID.get(id);
  if (!place) throw new Error(`Unknown place ${id}`);
  return place;
}
