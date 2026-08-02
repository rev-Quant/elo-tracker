/**
 * In-memory rate limiter. Good enough for a single Vercel instance —
 * a dedicated Redis store is only needed when scaling beyond one region.
 */

interface Entry {
  count: number;
  resetAt: number;
}

const store = new Map<string, Entry>();

/** Clean up expired entries every 30s. */
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now >= entry.resetAt) store.delete(key);
  }
}, 30_000).unref();

/**
 * Returns true if the action is allowed, false if rate-limited.
 *
 * @param key   Unique identifier (e.g. ip:email:action)
 * @param limit Max attempts in the window
 * @param windowMs Window in milliseconds
 */
export function check(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now >= entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  entry.count += 1;
  return entry.count <= limit;
}

export function remaining(key: string): number {
  return Math.max(0, (store.get(key)?.count ?? 0));
}