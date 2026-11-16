/**
 * A fixed-window limit per key, held in memory. On serverless each instance keeps its own counts, and the trip page
 * and /api/plan are bundled separately, so each counts on its own. This slows abuse rather than stopping it; the
 * real backstop is a spend limit on the Anthropic workspace.
 */
const windows = new Map<string, { start: number; count: number }>();

export type Allowance = { ok: true } | { ok: false; retryAfterSeconds: number };

/** Counts one request for `key`; when over the limit, says how long until its window resets. */
export function allow(key: string, limit = 10, windowMs = 60_000, now = Date.now()): Allowance {
  const w = windows.get(key);
  if (!w || now - w.start >= windowMs) {
    windows.set(key, { start: now, count: 1 });
    return { ok: true };
  }
  w.count += 1;
  if (w.count <= limit) return { ok: true };
  return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((w.start + windowMs - now) / 1000)) };
}

/**
 * How many proxies in front of the app add the caller's address to `x-forwarded-for`. Each one appends what it
 * sees, so the real address is that many entries from the right; anything further left came from the client and
 * can be made up. Vercel, and a single load balancer, are 1, the default. Set TRUSTED_PROXY_HOPS when that's
 * wrong; 0 means nothing in front sets the header, so no address can be trusted and every caller shares one limit.
 */
export function proxyHops(value = process.env.TRUSTED_PROXY_HOPS): number {
  const n = Number(value ?? 1);
  return Number.isInteger(n) && n >= 0 ? n : 1;
}

const SHARED = "unidentified";

/** The caller's address, from a request or from `headers()` in a Server Component. */
export const clientKey = (source: Request | Headers, hops = proxyHops()) => {
  const h = source instanceof Headers ? source : source.headers;
  if (hops === 0) return SHARED;
  // Several headers of the same name arrive joined with commas, so this is the whole chain.
  const chain = (h.get("x-forwarded-for") ?? "").split(",").map((a) => a.trim()).filter(Boolean);
  // A chain shorter than the proxies in front didn't come through them: nothing in it is trustworthy.
  return chain.length >= hops ? chain[chain.length - hops] : SHARED;
};
