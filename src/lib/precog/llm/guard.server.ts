import { assertSameSiteRequest } from "@/lib/auth/isolation.server";
import { DEV_USER_ID, authConfigured, getSessionUser } from "@/lib/auth/verify.server";
import { requestIp } from "@/lib/request-ip.server";
import { getSql } from "@/lib/db";
import { withinDailyBudget } from "./daily-usage";
import { createAnonymousHeavyGate, LLM_LIMITS, SlidingWindowLimiter } from "./rate-limit";

export type LlmAccess = {
  userId: string | null;
  grok: "allowed" | "unauthenticated" | "rate_limited" | "no_api_key";
};

class TooManyRequestsError extends Error {
  readonly status = 429;
  readonly retryAfterMs: number;

  constructor(retryAfterMs: number, message = "Too many requests — try again in a minute.") {
    super(message);
    this.name = "TooManyRequestsError";
    this.retryAfterMs = retryAfterMs;
  }
}

const perUserLimiter = new SlidingWindowLimiter(LLM_LIMITS.perUser);
const perIpLimiter = new SlidingWindowLimiter(LLM_LIMITS.perIp);
const globalLimiter = new SlidingWindowLimiter(LLM_LIMITS.global);
const anonymousHeavyGate = createAnonymousHeavyGate();

export interface LlmAccessOptions {
  /**
   * The function does costly work on the server even without a model call
   * (Pioneer's local analysis), so signed-out callers get a much smaller
   * allowance there than the per-address limit every model path shares.
   */
  heavy?: boolean;
}

export async function resolveLlmAccess(
  bearerToken?: string,
  options: LlmAccessOptions = {},
): Promise<LlmAccess> {
  assertSameSiteRequest();
  const ipKey = `ip:${requestIp()}`;
  const ipResult = perIpLimiter.take(ipKey);
  if (!ipResult.allowed) throw new TooManyRequestsError(ipResult.retryAfterMs);

  let userId: string | null = null;
  if (!authConfigured && !process.env.DATABASE_URL?.trim()) {
    userId = DEV_USER_ID;
  } else {
    userId = (await getSessionUser(bearerToken))?.id ?? null;
  }

  // Checked before the input is parsed or any analysis runs.
  if (options.heavy && !userId) {
    const anonymous = anonymousHeavyGate(ipKey);
    if (!anonymous.allowed) {
      throw new TooManyRequestsError(
        anonymous.retryAfterMs,
        "Too many requests — sign in, or try again in a minute.",
      );
    }
  }

  if (!process.env.XAI_API_KEY?.trim()) return { userId, grok: "no_api_key" };
  if (!userId) return { userId, grok: "unauthenticated" };

  const userResult = perUserLimiter.take(userId);
  if (!userResult.allowed) return { userId, grok: "rate_limited" };
  const globalResult = globalLimiter.take("global");
  if (!globalResult.allowed) return { userId, grok: "rate_limited" };
  // Fails closed: if the daily count cannot be read, the caller gets the
  // local answer rather than an uncounted model call.
  if (!(await withinDailyBudget(getSql, userId))) return { userId, grok: "rate_limited" };
  return { userId, grok: "allowed" };
}
