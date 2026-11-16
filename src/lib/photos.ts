import photos from "@/data/photos.json";

/** Credit for one Wikimedia Commons photo, as `npm run photos` wrote it. */
export interface PhotoCredit {
  /** The Wikipedia article the photo leads. */
  title: string;
  page: string;
  file: string;
  credit: string;
  license: string;
  licenseUrl: string | null;
  /** The photo's Commons page. */
  source: string;
}

const PLACES: Record<string, { src: string } & PhotoCredit> = photos.places;

/** Square photo for a place, or undefined when the stand-in should be drawn. Server side: sent in PlaceView. */
export const placePhoto = (placeId: string): string | undefined => PLACES[placeId]?.src;

/** Every photo in use, deduplicated by file, for the credits page. Server only: it carries the whole manifest. */
export function photoCredits(): (PhotoCredit & { src: string })[] {
  const all = [
    ...Object.values(photos.hubs as Record<string, PhotoCredit & { portrait: string }>).map((h) => ({ ...h, src: h.portrait })),
    ...Object.values(PLACES),
  ];
  return [...new Map(all.map((c) => [c.file, c])).values()].sort((a, b) => a.title.localeCompare(b.title));
}
