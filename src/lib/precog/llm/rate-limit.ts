export interface RateLimitRule {
  limit: number;
  windowMs: number;
}

export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly rule: RateLimitRule,
    private readonly now: () => number = Date.now,
  ) {}

  /** Records a hit when allowed. */
  take(key: string): { allowed: boolean; remaining: number; retryAfterMs: number } {
    this.prune();
    const current = this.now();
    const cutoff = current - this.rule.windowMs;
    const active = (this.hits.get(key) ?? []).filter((timestamp) => timestamp > cutoff);

    if (active.length >= this.rule.limit) {
      this.hits.set(key, active);
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: Math.max(1, active[0] + this.rule.windowMs - current),
      };
    }

    active.push(current);
    this.hits.set(key, active);
    return {
      allowed: true,
      remaining: Math.max(0, this.rule.limit - active.length),
      retryAfterMs: 0,
    };
  }

  /** Drops expired entries; call opportunistically from take(). */
  prune(): void {
    const cutoff = this.now() - this.rule.windowMs;
    for (const [key, timestamps] of this.hits) {
      const active = timestamps.filter((timestamp) => timestamp > cutoff);
      if (active.length) this.hits.set(key, active);
      else this.hits.delete(key);
    }
  }
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

export type LimitResult = ReturnType<SlidingWindowLimiter["take"]>;

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
): (ip: string) => LimitResult {
  const perIp = new SlidingWindowLimiter(rules.perIp, now);
  const all = new SlidingWindowLimiter(rules.all, now);
  return (ip) => {
    const own = perIp.take(ip);
    if (!own.allowed) return own;
    return all.take("anonymous");
  };
}
