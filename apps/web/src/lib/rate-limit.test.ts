import { describe, expect, it, vi } from "vitest";
import { RateLimiter } from "./rate-limit";

describe("RateLimiter", () => {
  it("allows up to max attempts within the window, then blocks", () => {
    const limiter = new RateLimiter(3, 1000);
    expect(limiter.attempt("a")).toBe(true);
    expect(limiter.attempt("a")).toBe(true);
    expect(limiter.attempt("a")).toBe(true);
    expect(limiter.attempt("a")).toBe(false);
  });

  it("tracks keys independently", () => {
    const limiter = new RateLimiter(1, 1000);
    expect(limiter.attempt("a")).toBe(true);
    expect(limiter.attempt("b")).toBe(true);
    expect(limiter.attempt("a")).toBe(false);
  });

  it("forgets attempts once they age out of the window", () => {
    vi.useFakeTimers();
    const limiter = new RateLimiter(1, 1000);
    expect(limiter.attempt("a")).toBe(true);
    expect(limiter.attempt("a")).toBe(false);
    vi.advanceTimersByTime(1001);
    expect(limiter.attempt("a")).toBe(true);
    vi.useRealTimers();
  });
});
