import hubPhotos from "@/data/hub-photos.json";

const HUBS: Record<string, { portrait: string; wide: string }> = hubPhotos;

/**
 * Portrait (hub card) and wide (trip banner) crops for a hub, or undefined to draw the stand-in.
 * Kept apart from lib/photos so client components don't bundle every place's credits.
 */
export const hubPhoto = (hub: string): { portrait: string; wide: string } | undefined => HUBS[hub];
