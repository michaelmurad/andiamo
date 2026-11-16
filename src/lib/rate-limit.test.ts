import { describe, expect, it } from "vitest";
import { allow, clientKey, proxyHops } from "./rate-limit";

describe("allow", () => {
  it("allows up to the limit, then says how long until the window resets", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) expect(allow("a", 3, 60_000, t0 + i)).toEqual({ ok: true });
    expect(allow("a", 3, 60_000, t0 + 20_000)).toEqual({ ok: false, retryAfterSeconds: 40 });
    expect(allow("a", 3, 60_000, t0 + 60_000)).toEqual({ ok: true });
  });
});

describe("clientKey", () => {
  const from = (xff?: string) => new Headers(xff === undefined ? {} : { "x-forwarded-for": xff });

  it("takes the address the proxy added, not what the client sent", () => {
    // The client claims to be 1.1.1.1; the proxy appends the address it actually saw.
    expect(clientKey(from("1.1.1.1, 203.0.113.7"), 1)).toBe("203.0.113.7");
    expect(clientKey(from("203.0.113.7"), 1)).toBe("203.0.113.7");
  });

  it("can't be changed by adding more made-up addresses", () => {
    expect(clientKey(from("9.9.9.9, 8.8.8.8, 203.0.113.7"), 1)).toBe(clientKey(from("203.0.113.7"), 1));
  });

  it("counts back past every trusted proxy", () => {
    expect(clientKey(from("1.1.1.1, 203.0.113.7, 10.0.0.2"), 2)).toBe("203.0.113.7");
  });

  it("shares one limit when no address can be trusted", () => {
    expect(clientKey(from(), 1)).toBe("unidentified");
    expect(clientKey(from("203.0.113.7"), 2)).toBe("unidentified");
    expect(clientKey(from("203.0.113.7"), 0)).toBe("unidentified");
  });

  it("ignores x-real-ip, which a client can set too", () => {
    expect(clientKey(new Headers({ "x-real-ip": "1.1.1.1" }), 1)).toBe("unidentified");
  });

  it("reads TRUSTED_PROXY_HOPS, defaulting to one proxy", () => {
    expect(proxyHops(undefined)).toBe(1);
    expect(proxyHops("2")).toBe(2);
    expect(proxyHops("0")).toBe(0);
    expect(proxyHops("lots")).toBe(1);
  });
});
