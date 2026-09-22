import { describe, expect, it } from "vitest";
import { SlidingWindowLimiter } from "./rate-limit";

describe("SlidingWindowLimiter", () => {
  it("allows the limit then denies with a retry window", () => {
    const limiter = new SlidingWindowLimiter({ limit: 2, windowMs: 1_000 }, () => 100);

    expect(limiter.take("user")).toEqual({ allowed: true, remaining: 1, retryAfterMs: 0 });
    expect(limiter.take("user")).toEqual({ allowed: true, remaining: 0, retryAfterMs: 0 });
    const denied = limiter.take("user");

    expect(denied.allowed).toBe(false);
    expect(denied.remaining).toBe(0);
    expect(denied.retryAfterMs).toBeGreaterThan(0);
    expect(denied.retryAfterMs).toBeLessThanOrEqual(1_000);
  });

  it("slides the window with the injected clock", () => {
    let now = 0;
    const limiter = new SlidingWindowLimiter({ limit: 1, windowMs: 1_000 }, () => now);

    expect(limiter.take("user").allowed).toBe(true);
    expect(limiter.take("user").allowed).toBe(false);
    now = 1_001;
    expect(limiter.take("user").allowed).toBe(true);
  });

  it("keeps keys independent", () => {
    const limiter = new SlidingWindowLimiter({ limit: 1, windowMs: 1_000 }, () => 0);

    expect(limiter.take("first").allowed).toBe(true);
    expect(limiter.take("second").allowed).toBe(true);
    expect(limiter.take("first").allowed).toBe(false);
  });

  it("prunes expired entries", () => {
    let now = 0;
    const limiter = new SlidingWindowLimiter({ limit: 1, windowMs: 1_000 }, () => now);

    expect(limiter.take("user").allowed).toBe(true);
    now = 1_001;
    limiter.prune();
    expect(limiter.take("user").allowed).toBe(true);
  });
});
