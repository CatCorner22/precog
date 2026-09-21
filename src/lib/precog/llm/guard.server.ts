import { assertSameSiteRequest } from "@/lib/auth/isolation.server";
import { DEV_USER_ID, authConfigured, getSessionUser } from "@/lib/auth/verify.server";
import { requestIp } from "@/lib/request-ip.server";
import { LLM_LIMITS, SlidingWindowLimiter } from "./rate-limit";

export type LlmAccess = {
  userId: string | null;
  grok: "allowed" | "unauthenticated" | "rate_limited" | "no_api_key";
};

export class TooManyRequestsError extends Error {
  readonly status = 429;
  readonly retryAfterMs: number;

  constructor(retryAfterMs: number) {
    super("Too many requests — try again in a minute.");
    this.name = "TooManyRequestsError";
    this.retryAfterMs = retryAfterMs;
  }
}

const perUserLimiter = new SlidingWindowLimiter(LLM_LIMITS.perUser);
const perIpLimiter = new SlidingWindowLimiter(LLM_LIMITS.perIp);
const globalLimiter = new SlidingWindowLimiter(LLM_LIMITS.global);

export async function resolveLlmAccess(bearerToken?: string): Promise<LlmAccess> {
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

  if (!process.env.XAI_API_KEY?.trim()) return { userId, grok: "no_api_key" };
  if (!userId) return { userId, grok: "unauthenticated" };

  const userResult = perUserLimiter.take(userId);
  if (!userResult.allowed) return { userId, grok: "rate_limited" };
  const globalResult = globalLimiter.take("global");
  if (!globalResult.allowed) return { userId, grok: "rate_limited" };
  return { userId, grok: "allowed" };
}
