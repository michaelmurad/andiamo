import type { Place, PlaceType } from "@/lib/data/types";
import { placePhoto } from "@/lib/photos";
import type { Plan } from "./types";

/** What the browser needs to draw a place. Sent with the plan so the client never loads the dataset. */
export interface PlaceView {
  id: string;
  name: string;
  kind: "city" | "history" | "art" | "food" | "outdoors" | "evening";
  /** Square photo from Wikimedia Commons; missing when the place has none and the stand-in is drawn. */
  photo?: string;
  category: string;
  rating: string;
  price: string;
  duration: string;
  /** What to search for in Google Maps to find this place. */
  mapsQuery: string;
}

const CATEGORY: Record<PlaceType, string> = {
  historic_site: "Historic site",
  neighborhood: "Neighbourhood",
  restaurant: "Restaurant",
  market: "Market",
  museum: "Museum",
  cafe: "Café",
  viewpoint: "Viewpoint",
  experience: "Experience",
  park: "Park",
  shop: "Shop",
};

export function kindOf(p: Pick<Place, "type" | "tags">): PlaceView["kind"] {
  switch (p.type) {
    case "museum":
      return "art";
    case "historic_site":
      return "history";
    case "restaurant":
    case "cafe":
    case "market":
      return "food";
    case "park":
    case "viewpoint":
      return "outdoors";
    default:
      if (p.tags.includes("food")) return "food";
      if (p.tags.includes("outdoors")) return "outdoors";
      if (p.tags.includes("evening")) return "evening";
      return "city";
  }
}

export const formatDuration = (minutes: number) =>
  minutes < 60 ? `${minutes} min` : minutes % 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes / 60} h`;

export function toPlaceView(p: Place): PlaceView {
  return {
    id: p.id,
    name: p.name,
    kind: kindOf(p),
    photo: placePhoto(p.id),
    category: CATEGORY[p.type],
    rating: p.rating.toFixed(1),
    price: p.priceLevel === 0 ? "Free" : "€".repeat(p.priceLevel),
    duration: formatDuration(p.durationMinutes),
    mapsQuery: mapsQueryFor(p.name, p.city),
  };
}

/** A time of day in a name like "Piazza del Popolo at Dawn": the place is the part before it. */
const TIME_OF_DAY = /^(dawn|dusk|sunrise|sunset|night|aperitivo hour)$/i;

/**
 * Names like "Gelato at Giolitti" describe a dish at a venue; Maps needs the venue. Names like
 * "Piazza del Popolo at Dawn" describe a place at a time; Maps needs the place. The city disambiguates.
 */
export function mapsQueryFor(name: string, city: string): string {
  const at = name.lastIndexOf(" at ");
  const after = name.slice(at + 4);
  const where = at < 0 ? name : TIME_OF_DAY.test(after) ? name.slice(0, at) : after;
  return where.toLowerCase().includes(city.toLowerCase()) ? where : `${where}, ${city}`;
}

/** Google Maps directions between two searches. With no origin, Maps starts from the viewer's location. */
export function directionsUrl(from: string | null, to: string, mode: "walking" | "transit"): string {
  const q = new URLSearchParams({ api: "1", destination: to, travelmode: mode });
  if (from) q.set("origin", from);
  return `https://www.google.com/maps/dir/?${q}`;
}

/** Views for every place a plan mentions. */
export function placeViewsFor(plan: Plan, byId: ReadonlyMap<string, Place>): Record<string, PlaceView> {
  const ids = [
    ...plan.days.flatMap((d) => d.stops.map((s) => s.placeId)),
    ...plan.unplaced.map((u) => u.placeId),
    ...plan.avoided.map((u) => u.placeId),
  ];
  const views: Record<string, PlaceView> = {};
  for (const id of ids) {
    const p = id ? byId.get(id) : undefined;
    if (p) views[p.id] = toPlaceView(p);
  }
  return views;
}
