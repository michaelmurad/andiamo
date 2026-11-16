import { describe, expect, it } from "vitest";
import { PLACES } from "@/lib/data/places";
import { directionsUrl, mapsQueryFor } from "./view";

describe("mapsQueryFor", () => {
  it("searches for a plain place in its city", () => {
    expect(mapsQueryFor("Pinacoteca di Brera", "Milan")).toBe("Pinacoteca di Brera, Milan");
  });

  it("searches for the venue, not the dish", () => {
    expect(mapsQueryFor("Gelato at Giolitti", "Rome")).toBe("Giolitti, Rome");
    expect(mapsQueryFor("Tagliatelle al Ragù at Trattoria Anna Maria", "Bologna")).toBe("Trattoria Anna Maria, Bologna");
  });

  it("searches for the place, not the time of day", () => {
    expect(mapsQueryFor("Piazza del Popolo at Dawn", "Rome")).toBe("Piazza del Popolo, Rome");
    expect(mapsQueryFor("Navigli Canals at Aperitivo Hour", "Milan")).toBe("Navigli Canals, Milan");
  });

  it("doesn't repeat a city the name already has", () => {
    expect(mapsQueryFor("Roof Garden at the Rinascente, Milan", "Milan")).toBe("the Rinascente, Milan");
    expect(mapsQueryFor("Enoteca al Volto, Venice", "Venice")).toBe("Enoteca al Volto, Venice");
  });

  it("never leaves a dataset name empty", () => {
    for (const p of PLACES) expect(mapsQueryFor(p.name, p.city).split(",")[0].trim()).not.toBe("");
  });
});

describe("directionsUrl", () => {
  it("links Google Maps directions between two places", () => {
    const url = new URL(directionsUrl("Giolitti, Rome", "Pantheon, Rome", "walking"));
    expect(url.origin + url.pathname).toBe("https://www.google.com/maps/dir/");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      api: "1",
      origin: "Giolitti, Rome",
      destination: "Pantheon, Rome",
      travelmode: "walking",
    });
  });

  it("leaves out the origin so Maps starts from the viewer", () => {
    expect(new URL(directionsUrl(null, "Pantheon, Rome", "transit")).searchParams.has("origin")).toBe(false);
  });
});
