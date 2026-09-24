import { describe, expect, it } from "vitest";
import { createAnonymousHeavyGate, LLM_LIMITS, SlidingWindowLimiter } from "./rate-limit";

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

describe("createAnonymousHeavyGate", () => {
  it("allows a few calls per address, then refuses that address only", () => {
    const gate = createAnonymousHeavyGate(
      { perIp: { limit: 2, windowMs: 1_000 }, all: { limit: 10, windowMs: 1_000 } },
      () => 0,
    );
    expect(gate("ip:a").allowed).toBe(true);
    expect(gate("ip:a").allowed).toBe(true);
    const refused = gate("ip:a");
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfterMs).toBeGreaterThan(0);
    expect(gate("ip:b").allowed).toBe(true);
  });

  it("caps every signed-out caller together, however many addresses", () => {
    const gate = createAnonymousHeavyGate(
      { perIp: { limit: 2, windowMs: 1_000 }, all: { limit: 3, windowMs: 1_000 } },
      () => 0,
    );
    expect(["ip:1", "ip:2", "ip:3"].map((ip) => gate(ip).allowed)).toEqual([true, true, true]);
    expect(gate("ip:4").allowed).toBe(false);
  });

  it("frees up once the window passes", () => {
    let now = 0;
    const gate = createAnonymousHeavyGate(
      { perIp: { limit: 1, windowMs: 1_000 }, all: { limit: 5, windowMs: 1_000 } },
      () => now,
    );
    expect(gate("ip:a").allowed).toBe(true);
    expect(gate("ip:a").allowed).toBe(false);
    now = 1_001;
    expect(gate("ip:a").allowed).toBe(true);
  });

  it("is much tighter than the shared per-address model limit", () => {
    expect(LLM_LIMITS.anonymousHeavyPerIp.limit).toBeLessThan(LLM_LIMITS.perIp.limit / 4);
  });
});
