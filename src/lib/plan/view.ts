import type { Place, PlaceType } from "@/lib/data/types";
import type { Plan } from "./types";

/** What the browser needs to draw a place. Sent with the plan so the client never loads the dataset. */
export interface PlaceView {
  id: string;
  name: string;
  kind: "city" | "history" | "art" | "food" | "outdoors" | "evening";
  category: string;
  rating: string;
  price: string;
  duration: string;
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
    category: CATEGORY[p.type],
    rating: p.rating.toFixed(1),
    price: p.priceLevel === 0 ? "Free" : "€".repeat(p.priceLevel),
    duration: formatDuration(p.durationMinutes),
  };
}

/** Views for every place a plan mentions. */
export function placeViewsFor(plan: Plan, byId: ReadonlyMap<string, Place>): Record<string, PlaceView> {
  const ids = [...plan.days.flatMap((d) => d.stops.map((s) => s.placeId)), ...plan.unplaced.map((u) => u.placeId)];
  const views: Record<string, PlaceView> = {};
  for (const id of ids) {
    const p = id ? byId.get(id) : undefined;
    if (p) views[p.id] = toPlaceView(p);
  }
  return views;
}
