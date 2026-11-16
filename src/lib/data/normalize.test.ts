import { describe, expect, it } from "vitest";
import raw from "@/data/italy.json";
import { haversineKm } from "@/lib/geo";
import { normalizePlaces } from "./normalize";
import { PLACE_BY_ID, PLACES, REJECTED } from "./places";

const place = (id: string) => PLACE_BY_ID.get(id)!;
const codes = (id: string) => place(id).issues.map((i) => i.code);

describe("normalizePlaces on italy.json", () => {
  it("keeps every record", () => {
    expect(REJECTED).toEqual([]);
    expect(PLACES).toHaveLength((raw as unknown[]).length);
  });

  it("moves the Brera market back to Milan (place_059 longitude 11.191)", () => {
    const brera = place("place_059");
    expect(codes("place_059")).toContain("COORDS_OUTLIER");
    expect(haversineKm(brera.coords, place("place_058").coords)).toBeLessThan(2);
  });

  it("keeps Chianti where it is, as a day trip (place_035, 21 km out)", () => {
    expect(place("place_035").excursion).toEqual({ zone: "Chianti Day Trip by Bike" });
    expect(codes("place_035")).toContain("FAR_FROM_CITY");
  });

  it("gives every satellite town a hub and a zone", () => {
    expect(place("place_064")).toMatchObject({ hub: "Milan", excursion: { zone: "Lake Como" } });
    expect(place("place_045")).toMatchObject({ hub: "Bologna", excursion: { zone: "Modena" } });
  });

  it("respells local_favorite (place_100)", () => {
    expect(place("place_100").tags).toContain("local-favorite");
    expect(place("place_100").tags).not.toContain("local_favorite");
  });

  it("shows places tagged free as free (place_023, place_093)", () => {
    expect(place("place_023").priceLevel).toBe(0);
    expect(place("place_093").priceLevel).toBe(0);
  });

  it("flags but keeps the budget/€€ conflict (place_082)", () => {
    expect(place("place_082").priceLevel).toBe(2);
    expect(codes("place_082")).toContain("PRICE_TAG_CONFLICT");
  });

  it("never auto-plans Hard Rock Cafe (place_025, rated 2.1)", () => {
    expect(place("place_025").autoPlan).toBe(false);
  });

  it("fills missing durations and booking", () => {
    expect(place("place_014").durationMinutes).toBe(30);
    expect(place("place_020").booking).toBe("unknown");
  });

  it("links places at the same coordinates", () => {
    expect(place("place_018").sameSpotAs).toEqual(["place_077"]);
    expect(place("place_031").sameSpotAs).toEqual(["place_030"]);
  });

  it("treats public spaces without hours as open, and experiences as approximate", () => {
    expect(place("place_008").hoursConfidence).toBe("assumed-open");
    expect(place("place_038").hoursConfidence).toBe("approximate");
  });

  it("applies hours from names and notes", () => {
    expect(place("place_023").hours[1]).toEqual([{ open: 360, close: 510 }]); // "at Dawn"
    expect(place("place_053").hours[0]).toEqual([]); // Parma: weekdays only
  });

  it("records an issue for every seasonal note it read", () => {
    for (const p of PLACES) {
      const note = (raw as { id: string; seasonal_notes: string | null }[]).find((r) => r.id === p.id)!.seasonal_notes;
      if (note) expect(p.issues.some((i) => i.field === "seasonal_notes" || i.code === "HOURS_FROM_TEXT"), p.id).toBe(true);
    }
  });
});

describe("normalizePlaces on bad input", () => {
  it("rejects a record with the reason instead of throwing", () => {
    const { places, rejected } = normalizePlaces([{ id: "x", name: "No fields" }]);
    expect(places).toEqual([]);
    expect(rejected[0]).toMatchObject({ id: "x" });
  });

  it("rejects an unknown city", () => {
    const base = (raw as object[])[0];
    const { rejected } = normalizePlaces([{ ...base, city: "Atlantis" }]);
    expect(rejected[0].reason).toContain("Atlantis");
  });

  it("rejects duplicate ids", () => {
    const base = (raw as object[])[0];
    const { places, rejected } = normalizePlaces([base, base]);
    expect(places).toHaveLength(1);
    expect(rejected[0].reason).toBe("Duplicate id");
  });

  it("downgrades unreadable hours to a flagged default", () => {
    const base = (raw as object[])[0];
    const [p] = normalizePlaces([{ ...base, hours: "By appointment" }]).places;
    expect(p.hoursConfidence).toBe("assumed-open");
    expect(p.issues.map((i) => i.code)).toContain("HOURS_UNREADABLE");
  });
});
