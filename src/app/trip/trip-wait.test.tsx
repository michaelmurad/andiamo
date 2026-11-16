import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TripWait } from "./trip-wait";

const status = () => screen.getByRole("status").textContent;
const tick = (seconds: number) => act(() => vi.advanceTimersByTime(seconds * 1000));

describe("TripWait when rate-limited", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("counts down once a second, then retries exactly once", () => {
    const onRetry = vi.fn();
    render(<TripWait retryAfterSeconds={3} onRetry={onRetry} />);
    expect(status()).toContain("starts again in 3 s.");

    tick(1);
    expect(status()).toContain("2 s.");
    tick(1);
    expect(status()).toContain("1 s.");
    expect(onRetry).not.toHaveBeenCalled();

    tick(1);
    expect(status()).toBe("Trying again now.");
    expect(onRetry).toHaveBeenCalledTimes(1);

    // The interval keeps running at zero; it must not retry again.
    tick(10);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("keeps counting when the parent re-renders, and calls the newest onRetry", () => {
    const first = vi.fn();
    const latest = vi.fn();
    const { rerender } = render(<TripWait retryAfterSeconds={2} onRetry={first} />);
    tick(1);
    rerender(<TripWait retryAfterSeconds={2} onRetry={latest} />);
    expect(status()).toContain("1 s.");

    tick(1);
    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledTimes(1);
  });

  it("doesn't retry again when the parent re-renders after the retry", () => {
    // The retry is a router refresh, which re-renders this screen with a new onRetry while it's still at zero.
    const first = vi.fn();
    const next = vi.fn();
    const { rerender } = render(<TripWait retryAfterSeconds={1} onRetry={first} />);
    tick(1);
    expect(first).toHaveBeenCalledTimes(1);

    rerender(<TripWait retryAfterSeconds={1} onRetry={next} />);
    tick(5);
    expect(first).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();
  });

  it("still waits a second when told to retry immediately", () => {
    const onRetry = vi.fn();
    render(<TripWait retryAfterSeconds={0} onRetry={onRetry} />);
    expect(onRetry).not.toHaveBeenCalled();
    tick(1);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("offers no manual retry while counting down, only a way back", () => {
    render(<TripWait retryAfterSeconds={5} onRetry={() => {}} />);
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(screen.getByRole("link", { name: "Change trip" }).getAttribute("href")).toBe("/");
  });

  it("stops the timer when it unmounts", () => {
    const onRetry = vi.fn();
    const { unmount } = render(<TripWait retryAfterSeconds={2} onRetry={onRetry} />);
    unmount();
    tick(5);
    expect(onRetry).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("TripWait on an error", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("shows the error and retries only when asked", () => {
    const onRetry = vi.fn();
    render(<TripWait message="The planner didn't answer" onRetry={onRetry} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Couldn't plan your trip");
    expect(status()).toBe("The planner didn't answer");

    tick(60);
    expect(onRetry).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("falls back to a generic message", () => {
    render(<TripWait onRetry={() => {}} />);
    expect(status()).toBe("The planner didn't answer. Try again in a moment.");
  });
});
