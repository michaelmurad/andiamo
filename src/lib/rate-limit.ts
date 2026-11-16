/**
 * A fixed-window limit per key, held in memory. On serverless each instance keeps its own counts, so this
 * slows abuse rather than stopping it; the real backstop is a spend limit on the Anthropic workspace.
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

export const clientKey = (request: Request) =>
  request.headers.get("x-forwarded-for")?.split(",")[0].trim() || request.headers.get("x-real-ip") || "local";
