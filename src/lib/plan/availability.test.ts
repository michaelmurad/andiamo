import { describe, expect, it } from "vitest";
import { PLACE_BY_ID } from "@/lib/data/places";
import { hm, isOccurrence } from "@/lib/time";
import { availableOn, earliestStart, hoursOn, nextAvailableDate, unavailableReason } from "./availability";

const place = (id: string) => PLACE_BY_ID.get(id)!;

describe("isOccurrence", () => {
  it("finds the 3rd Saturday when the month starts on a Saturday", () => {
    // August 2026 starts on a Saturday: Saturdays are 1, 8, 15, 22, 29.
    expect(isOccurrence("2026-08-15", 3)).toBe(true);
    expect(isOccurrence("2026-08-22", 3)).toBe(false);
  });

  it("finds the last Sunday", () => {
    expect(isOccurrence("2026-08-30", "last")).toBe(true);
    expect(isOccurrence("2026-08-23", "last")).toBe(false);
  });
});

describe("Brera Antique Market: third Saturday and third Sunday (place_059)", () => {
  const brera = place("place_059");

  it("is open on both", () => {
    expect(availableOn(brera, "2026-08-15").ok).toBe(true); // 3rd Saturday
    expect(availableOn(brera, "2026-08-16").ok).toBe(true); // 3rd Sunday
  });

  it("follows the description literally when the 3rd Saturday and 3rd Sunday are a week apart", () => {
    // March 2026 starts on a Sunday: 3rd Sunday is the 15th, 3rd Saturday the 21st.
    expect(availableOn(brera, "2026-03-15").ok).toBe(true);
    expect(availableOn(brera, "2026-03-21").ok).toBe(true);
    expect(availableOn(brera, "2026-03-22").ok).toBe(false);
  });

  it("is closed on other weekends and weekdays, with a reason and a next date", () => {
    expect(availableOn(brera, "2026-08-22")).toEqual({ ok: false, reason: "Only the 3rd Saturday of the month" });
    expect(availableOn(brera, "2026-08-19")).toEqual({ ok: false, reason: "Closed Wednesdays" });
    expect(nextAvailableDate(brera, "2026-08-17")).toBe("2026-09-19");
    expect(unavailableReason(brera, ["2026-08-22", "2026-08-23"])).toBe(
      "Only the 3rd Saturday of the month. Next: Sat 19 Sep",
    );
  });
});

describe("other rules from the notes", () => {
  it("Vatican Museums open only on the last Sunday (place_010)", () => {
    expect(availableOn(place("place_010"), "2026-08-30").ok).toBe(true);
    expect(availableOn(place("place_010"), "2026-08-23").ok).toBe(false);
  });

  it("Lake Como places close in winter (place_064)", () => {
    expect(availableOn(place("place_064"), "2026-12-05")).toEqual({ ok: false, reason: "Open April–October only" });
  });

  it("Boboli Gardens close later in summer (place_034)", () => {
    expect(hoursOn(place("place_034"), "2026-07-01")).toEqual([{ open: hm(8, 15), close: hm(19, 30) }]);
    expect(hoursOn(place("place_034"), "2026-11-01")).toEqual([{ open: hm(8, 15), close: hm(16, 30) }]);
  });

  it("the Parma tour runs weekday mornings only (place_053)", () => {
    expect(availableOn(place("place_053"), "2026-08-16").ok).toBe(false); // Sunday
    expect(earliestStart(place("place_053"), "2026-08-17", hm(8), 360)).toBe(hm(8, 30));
    expect(earliestStart(place("place_053"), "2026-08-17", hm(10), 360)).toBeNull(); // starts in the morning or not at all
  });
});

describe("earliestStart", () => {
  it("waits for opening time", () => {
    expect(earliestStart(place("place_001"), "2026-08-17", hm(8), 120)).toBe(hm(9));
  });

  it("requires the visit to finish before closing", () => {
    expect(earliestStart(place("place_001"), "2026-08-17", hm(17, 30), 120)).toBeNull();
  });

  it("lets a restaurant meal run past the end of service (place_043, 240 min lunch)", () => {
    expect(earliestStart(place("place_043"), "2026-08-18", hm(12, 30), 240)).toBe(hm(12, 30));
    expect(earliestStart(place("place_043"), "2026-08-18", hm(13, 45), 240)).toBe(hm(20)); // past last lunch seating: dinner
  });

  it("uses the second shift when the first has passed (place_003)", () => {
    expect(earliestStart(place("place_003"), "2026-08-17", hm(15), 90)).toBe(hm(19, 30));
  });
});
