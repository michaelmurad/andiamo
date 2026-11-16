export interface Coords {
  lat: number;
  lon: number;
}

export type TravelMode = "walk" | "transit" | "train";

export interface Travel {
  minutes: number;
  mode: TravelMode;
  km: number;
}

export function haversineKm(a: Coords, b: Coords): number {
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Straight-line distance understates real routes; streets and rails wander. */
const DETOUR = 1.3;
const WALK_MAX_KM = 1.2;
const TRANSIT_MAX_KM = 20;

const walkMinutes = (km: number) => ((km * DETOUR) / 5) * 60;
const transitMinutes = (km: number) => 10 + ((km * DETOUR) / 20) * 60;
const trainMinutes = (km: number) => 25 + ((km * DETOUR) / 90) * 60;

/**
 * Transit is held between two limits so a farther place never looks closer than a nearer one:
 * no quicker than walking to the walking limit (the tram's wait outweighs the ride), and no slower
 * than the train at the train limit (past ~8 km a metro, regional train or taxi caps the time).
 */
const TRANSIT_MIN = walkMinutes(WALK_MAX_KM);
const TRANSIT_MAX = trainMinutes(TRANSIT_MAX_KM);

/**
 * The one travel estimate used everywhere. No routing API: straight-line distance, a detour factor,
 * and a fixed overhead per mode (waiting for a tram, getting to the station).
 *   up to 1.2 km  walk at 5 km/h
 *   up to 20 km   tram, bus, taxi or vaporetto: 10 min overhead + 20 km/h, held between the walk and train times
 *   beyond        regional train: 25 min overhead + 90 km/h
 * Time never drops as distance grows, including where the mode changes.
 */
export function travel(a: Coords, b: Coords): Travel {
  const km = haversineKm(a, b);
  if (km <= WALK_MAX_KM) return { km, mode: "walk", minutes: Math.max(2, Math.round(walkMinutes(km))) };
  if (km <= TRANSIT_MAX_KM) {
    return { km, mode: "transit", minutes: roundTo5(Math.min(TRANSIT_MAX, Math.max(TRANSIT_MIN, transitMinutes(km)))) };
  }
  return { km, mode: "train", minutes: roundTo5(trainMinutes(km)) };
}

const roundTo5 = (n: number) => Math.ceil(n / 5) * 5;

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** The median point of a set of coordinates. Robust to one bad point, unlike the mean. */
export const medianPoint = (points: Coords[]): Coords => ({
  lat: median(points.map((p) => p.lat)),
  lon: median(points.map((p) => p.lon)),
});
