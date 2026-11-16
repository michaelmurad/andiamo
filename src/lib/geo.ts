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

/**
 * The one travel estimate used everywhere. No routing API: straight-line distance, a detour factor,
 * and a fixed overhead per mode (waiting for a tram, getting to the station).
 *   up to 1.2 km  walk at 5 km/h
 *   up to 20 km   tram, bus, taxi or vaporetto: 10 min overhead + 20 km/h
 *   beyond        regional train: 25 min overhead + 90 km/h
 */
export function travel(a: Coords, b: Coords): Travel {
  const km = haversineKm(a, b);
  const routeKm = km * DETOUR;
  if (km <= WALK_MAX_KM) return { km, mode: "walk", minutes: Math.max(2, Math.round((routeKm / 5) * 60)) };
  if (km <= TRANSIT_MAX_KM) return { km, mode: "transit", minutes: roundTo5(10 + (routeKm / 20) * 60) };
  return { km, mode: "train", minutes: roundTo5(25 + (routeKm / 90) * 60) };
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
