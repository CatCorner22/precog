interface RateLimitRule {
  limit: number;
  windowMs: number;
}

interface LimitDecision {
  allowed: boolean;
  /** How long until the oldest hit leaves the window; 0 when allowed. */
  retryAfterMs: number;
}

// These limiters are per-process memory: fine for one Vercel function instance,
// but not shared across instances.
export const LLM_LIMITS = {
  perUser: { limit: 10, windowMs: 60_000 },
  perIp: { limit: 30, windowMs: 60_000 },
  global: { limit: 120, windowMs: 60_000 },
  /**
   * Signed-out calls to an expensive path (Pioneer runs its whole local
   * analysis on the server, over half a second of CPU for a large map): per
   * address, and for every signed-out caller together on this instance.
   */
  anonymousHeavyPerIp: { limit: 4, windowMs: 60_000 },
  anonymousHeavyAll: { limit: 20, windowMs: 60_000 },
} as const;

export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>();
  private lastSweep = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly rule: RateLimitRule,
    private readonly now: () => number = Date.now,
  ) {}

  /** Records a hit when allowed. */
  take(key: string): LimitDecision {
    return this.decide(key, true);
  }

  /** The decision `take` would make, without recording a hit. */
  check(key: string): LimitDecision {
    return this.decide(key, false);
  }

  private decide(key: string, record: boolean): LimitDecision {
    const current = this.now();
    // Other keys are swept at most once per window, so one busy limiter does
    // not walk every address it has seen on every request.
    if (current - this.lastSweep >= this.rule.windowMs) this.prune();
    const cutoff = current - this.rule.windowMs;
    const active = (this.hits.get(key) ?? []).filter((timestamp) => timestamp > cutoff);

    if (active.length >= this.rule.limit) {
      this.hits.set(key, active);
      return {
        allowed: false,
        retryAfterMs: Math.max(1, active[0] + this.rule.windowMs - current),
      };
    }

    if (record) active.push(current);
    if (active.length) this.hits.set(key, active);
    else this.hits.delete(key);
    return { allowed: true, retryAfterMs: 0 };
  }

  /** Drops expired entries for every key. */
  prune(): void {
    const current = this.now();
    this.lastSweep = current;
    const cutoff = current - this.rule.windowMs;
    for (const [key, timestamps] of this.hits) {
      const active = timestamps.filter((timestamp) => timestamp > cutoff);
      if (active.length) this.hits.set(key, active);
      else this.hits.delete(key);
    }
  }

  /** How many keys the limiter holds; for tests. */
  get size(): number {
    return this.hits.size;
  }
}

/**
 * The allowance for signed-out callers on an expensive path: a few calls a
 * minute per address, and a ceiling on all of them together so many
 * addresses cannot add up to a busy instance.
 */
export function createAnonymousHeavyGate(
  rules: { perIp: RateLimitRule; all: RateLimitRule } = {
    perIp: LLM_LIMITS.anonymousHeavyPerIp,
    all: LLM_LIMITS.anonymousHeavyAll,
  },
  now: () => number = Date.now,
): (ip: string) => LimitDecision {
  const perIp = new SlidingWindowLimiter(rules.perIp, now);
  const all = new SlidingWindowLimiter(rules.all, now);
  // Each bucket is spent only when both allow the call, so a refusal by
  // either one leaves the other unchanged.
  return (ip) => {
    const own = perIp.check(ip);
    if (!own.allowed) return own;
    const shared = all.take("anonymous");
    if (!shared.allowed) return shared;
    return perIp.take(ip);
  };
}
