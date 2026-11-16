import { describe, expect, it } from "vitest";
import { allow } from "./rate-limit";

describe("allow", () => {
  it("allows up to the limit, then says how long until the window resets", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) expect(allow("a", 3, 60_000, t0 + i)).toEqual({ ok: true });
    expect(allow("a", 3, 60_000, t0 + 20_000)).toEqual({ ok: false, retryAfterSeconds: 40 });
    expect(allow("a", 3, 60_000, t0 + 60_000)).toEqual({ ok: true });
  });
});
