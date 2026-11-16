import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_TRIP_DAYS } from "@/lib/plan/settings";
import { SetupForm } from "./setup-form";

// Monday 16 November 2026. The default start is the next Friday at least three weeks out.
const TODAY = new Date(2026, 10, 16, 10);
const DEFAULT_START = "2026-12-11";

/** What the GET form would put in the /trip URL. */
const submitted = () => Object.fromEntries(new FormData(document.querySelector("form")!));

const startInput = () => screen.getByLabelText("Start date") as HTMLInputElement;
const endInput = () => screen.getByLabelText("End date") as HTMLInputElement;
const pick = (input: HTMLInputElement, value: string) => fireEvent.change(input, { target: { value } });
const press = (name: string) => fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${name}`) }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(TODAY);
});
afterEach(() => vi.useRealTimers());

describe("SetupForm", () => {
  it("submits the defaults as a /trip query", () => {
    render(<SetupForm />);
    expect(document.querySelector("form")!.getAttribute("action")).toBe("/trip");
    expect(submitted()).toEqual({
      hub: "Rome",
      pace: "balanced",
      likes: "food,art",
      crowds: "ok",
      days: "3",
      start: DEFAULT_START,
      notes: "",
    });
  });

  it("sends the chosen base, or auto for Pick for me", () => {
    render(<SetupForm />);
    press("Venice");
    expect(submitted().hub).toBe("Venice");
    expect(screen.getByRole("button", { name: /^Venice/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /^Rome/ }).getAttribute("aria-pressed")).toBe("false");

    press("Pick for me");
    expect(submitted().hub).toBe("auto");
  });

  it("toggles interests, and sends Avoid crowds as its own field", () => {
    render(<SetupForm />);
    press("Food");
    press("History");
    press("Hidden gems");
    expect(submitted().likes).toBe("art,history,hidden-gems");

    press("Avoid crowds");
    expect(submitted()).toMatchObject({ likes: "art,history,hidden-gems", crowds: "avoid" });

    press("Avoid crowds");
    expect(submitted().crowds).toBe("ok");
  });

  it("sends an empty likes list when nothing is picked", () => {
    render(<SetupForm />);
    press("Food");
    press("Art");
    expect(submitted().likes).toBe("");
  });

  it("sends the pace in lower case", () => {
    render(<SetupForm />);
    fireEvent.click(screen.getByRole("radio", { name: "Packed" }));
    expect(submitted().pace).toBe("packed");
    expect(screen.getByRole("radio", { name: "Packed" }).getAttribute("aria-checked")).toBe("true");
  });

  it("sends what the traveller typed as notes", () => {
    render(<SetupForm />);
    fireEvent.change(screen.getByLabelText("Anything else?"), { target: { value: "No early starts" } });
    expect(submitted().notes).toBe("No early starts");
  });
});

describe("SetupForm dates", () => {
  it("can't start before today, and ends no later than the longest trip allows", () => {
    render(<SetupForm />);
    expect(startInput().min).toBe("2026-11-16");
    expect(endInput().min).toBe(DEFAULT_START);
    expect(endInput().max).toBe("2026-12-13");
    expect(MAX_TRIP_DAYS).toBe(3); // The max above assumes it; update both together.
  });

  it("keeps the trip length when the start moves", () => {
    render(<SetupForm />);
    pick(endInput(), "2026-12-12");
    pick(startInput(), "2026-12-20");
    expect(endInput().value).toBe("2026-12-21");
    expect(submitted()).toMatchObject({ start: "2026-12-20", days: "2" });
    expect(screen.getByText(/2 days/).textContent).toContain(`(up to ${MAX_TRIP_DAYS})`);
  });

  it("sends the length as days, counting both ends", () => {
    render(<SetupForm />);
    pick(endInput(), DEFAULT_START);
    expect(submitted().days).toBe("1");
    expect(screen.getByText(/· 1 day \(/)).toBeTruthy();
  });

  it("clamps an end date outside the allowed range", () => {
    render(<SetupForm />);
    pick(endInput(), "2027-01-31");
    expect(submitted().days).toBe(String(MAX_TRIP_DAYS));
    pick(endInput(), "2026-12-01");
    expect(submitted().days).toBe("1");
  });

  it("ignores a cleared date field", () => {
    render(<SetupForm />);
    pick(startInput(), "");
    pick(endInput(), "");
    expect(submitted()).toMatchObject({ start: DEFAULT_START, days: "3" });
  });
});
