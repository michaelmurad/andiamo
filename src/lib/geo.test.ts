import { describe, expect, it } from "vitest";
import { haversineKm, medianPoint, travel, type Coords } from "./geo";

const ORIGIN: Coords = { lat: 45, lon: 9 };
/** A point this many km due north of ORIGIN. Along a meridian, a degree of latitude is a fixed distance. */
const north = (km: number): Coords => ({ lat: ORIGIN.lat + km / ((6371 * Math.PI) / 180), lon: ORIGIN.lon });
const trip = (km: number) => travel(ORIGIN, north(km));

describe("haversineKm", () => {
  it("is zero between a point and itself", () => {
    expect(haversineKm(ORIGIN, ORIGIN)).toBe(0);
  });

  it("measures distance along a meridian", () => {
    expect(haversineKm(ORIGIN, north(5))).toBeCloseTo(5, 6);
  });

  it("is the same in both directions", () => {
    const duomo = { lat: 45.4642, lon: 9.19 };
    const colosseum = { lat: 41.8902, lon: 12.4922 };
    expect(haversineKm(duomo, colosseum)).toBe(haversineKm(colosseum, duomo));
  });

  it("matches a known city-to-city distance", () => {
    // Milan's Duomo to Rome's Colosseum is about 478 km as the crow flies.
    expect(haversineKm({ lat: 45.4642, lon: 9.19 }, { lat: 41.8902, lon: 12.4922 })).toBeCloseTo(478, 0);
  });
});

describe("travel", () => {
  describe("walking, up to 1.2 km", () => {
    it("walks at 5 km/h over a route 1.3 times the straight line", () => {
      // 1 km straight is 1.3 km of streets: 15.6 min, rounded to the nearest minute.
      expect(trip(1)).toMatchObject({ mode: "walk", minutes: 16 });
    });

    it("walks right up to the limit", () => {
      expect(trip(1.19)).toMatchObject({ mode: "walk", minutes: 19 });
    });

    it("never quotes less than 2 minutes, even to the same spot", () => {
      expect(trip(0)).toMatchObject({ mode: "walk", minutes: 2 });
      expect(trip(0.1)).toMatchObject({ mode: "walk", minutes: 2 });
    });
  });

  describe("transit, from 1.2 km to 20 km", () => {
    it("adds 10 minutes of waiting to 20 km/h, rounded up to 5 minutes", () => {
      // 5 km straight is 6.5 km of route: 10 + 19.5 = 29.5 min, rounded up to 30.
      expect(trip(5)).toMatchObject({ mode: "transit", minutes: 30 });
    });

    it("switches from walking just past 1.2 km", () => {
      expect(trip(1.21).mode).toBe("transit");
    });

    it("is never quicker than walking to the walking limit", () => {
      // The tram formula alone gives 15 min at 1.21 km, less than the 19 min walk at 1.19 km.
      expect(trip(1.21).minutes).toBeGreaterThanOrEqual(trip(1.19).minutes);
      expect(trip(2).minutes).toBe(20);
    });

    it("is never slower than the train at the train limit", () => {
      // The tram formula alone gives 90 min at 20 km; a metro, regional train or taxi caps it at the train's 45.
      expect(trip(12)).toMatchObject({ mode: "transit", minutes: 45 });
      expect(trip(19.99)).toMatchObject({ mode: "transit", minutes: 45 });
    });
  });

  describe("train, beyond 20 km", () => {
    it("adds 25 minutes of getting to the station to 90 km/h, rounded up to 5 minutes", () => {
      // 100 km straight is 130 km of track: 25 + 86.7 = 111.7 min, rounded up to 115.
      expect(trip(100)).toMatchObject({ mode: "train", minutes: 115 });
    });

    it("switches from transit just past 20 km", () => {
      expect(trip(20.01).mode).toBe("train");
    });
  });

  it("reports the straight-line distance, not the route", () => {
    expect(trip(5).km).toBeCloseTo(5, 6);
  });

  it("takes as long in both directions", () => {
    const a = { lat: 45.4642, lon: 9.19 };
    const b = { lat: 45.4719, lon: 9.1881 };
    expect(travel(a, b)).toEqual(travel(b, a));
  });

  it("never gets quicker as the distance grows, even where the mode changes", () => {
    // The scheduler picks places by these times, so a farther place must never look closer.
    let last = 0;
    for (let km = 0; km <= 400; km += 0.01) {
      const { minutes } = trip(km);
      if (minutes < last) expect.fail(`${km.toFixed(2)} km takes ${minutes} min, less than ${last} min just before it`);
      last = minutes;
    }
  });

  it("quotes transit and train in whole 5-minute steps", () => {
    for (const km of [1.5, 3, 7.3, 12, 19, 25, 60, 250]) expect(trip(km).minutes % 5).toBe(0);
  });
});

describe("medianPoint", () => {
  it("ignores a single far-off point, unlike the mean", () => {
    const points = [{ lat: 45, lon: 9 }, { lat: 45.01, lon: 9.01 }, { lat: 45.02, lon: 9.02 }, { lat: 10, lon: 50 }, { lat: 45.01, lon: 9.01 }];
    expect(medianPoint(points)).toEqual({ lat: 45.01, lon: 9.01 });
  });
});
