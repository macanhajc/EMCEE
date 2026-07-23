/**
 * In-memory sliding-window rate limiter for the auth surface
 * (specs/06-auth.md: "magic-link endpoint rate-limited per email + per IP").
 *
 * Same shape as the runtime's ActionThrottle (workers/runtime/catalog/base.py)
 * but per-key instead of per-instance. In-memory only — resets on deploy and
 * doesn't share state across instances. Fine for one Next.js process; swap
 * for a Postgres-backed limiter before running multiple control-plane
 * instances (this app has no Redis dependency to reach for — docs/cost-plan.md R6).
 */
import "server-only";

interface Bucket {
  hits: number[]; // timestamps (ms) within the window
}

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  /** Returns true if `key` is under its limit, recording this attempt either way. */
  attempt(key: string): boolean {
    const now = Date.now();
    const bucket = this.buckets.get(key) ?? { hits: [] };
    bucket.hits = bucket.hits.filter((t) => now - t < this.windowMs);

    if (bucket.hits.length >= this.max) {
      this.buckets.set(key, bucket);
      return false;
    }

    bucket.hits.push(now);
    this.buckets.set(key, bucket);
    return true;
  }
}

// Magic-link requests: 5 per email per 15 min, 20 per IP per 15 min —
// generous enough for real retries, tight enough to blunt stuffing.
export const magicLinkEmailLimiter = new RateLimiter(5, 15 * 60 * 1000);
export const magicLinkIpLimiter = new RateLimiter(20, 15 * 60 * 1000);

// Token entry (instance creation, token replace): "token entry is a
// credential-stuffing target" (specs/05-security.md). Keyed by user id.
export const tokenEntryLimiter = new RateLimiter(10, 15 * 60 * 1000);
