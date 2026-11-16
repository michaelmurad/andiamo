import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Selection } from "@/lib/ai/select";
import { planTrip } from "./plan-trip";
import type { TripSettings } from "./types";

const selectPlaces = vi.hoisted(() => vi.fn<() => Promise<Selection | null>>());
vi.mock("@/lib/ai/select", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/ai/select")>()), selectPlaces }));

const settings: TripSettings = {
  startDate: "2027-05-14",
  days: 3,
  hub: null,
  pace: "balanced",
  interests: ["food", "art"],
  avoidCrowds: false,
  maxPrice: 3,
  dayTrip: "auto",
};

describe("planTrip", () => {
  beforeEach(() => {
    selectPlaces.mockReset();
    selectPlaces.mockResolvedValue({ hub: "Venice", picks: [], unknownIds: [], prompt: "select-places@3" });
  });

  it("asks the model by default", async () => {
    const r = await planTrip(settings, "");
    expect(selectPlaces).toHaveBeenCalledOnce();
    expect(r).toMatchObject({ source: "ai", prompt: "select-places@3", plan: { hub: "Venice" } });
  });

  it("never calls the model when it's turned off, and plans with the scheduler alone", async () => {
    const r = await planTrip(settings, "lots of gelato", { useModel: false });
    expect(selectPlaces).not.toHaveBeenCalled();
    expect(r.source).toBe("fallback");
    expect(r.prompt).toBeNull();
    expect(r.plan.days).toHaveLength(3);
  });

  it("plans the same trip every time without the model", async () => {
    const a = await planTrip(settings, "", { useModel: false });
    const b = await planTrip(settings, "", { useModel: false });
    expect(b.plan).toEqual(a.plan);
  });
});
