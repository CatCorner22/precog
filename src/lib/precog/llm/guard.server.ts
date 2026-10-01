import { assertSameSiteRequest } from "@/lib/auth/isolation.server";
import { assertExpectedAccount } from "@/lib/auth/expected-account";
import { DEV_USER_ID, authConfigured, getSessionUser } from "@/lib/auth/verify.server";
import { requestIp } from "@/lib/request-ip.server";
import { trustedClientIpHeaders } from "@/lib/client-ip";
import { databaseConfigured, getSql } from "@/lib/db";
import { checkDailyBudget } from "./daily-usage";
import { grokChat, type GrokChatOptions, type GrokChatResult } from "./grok-client.server";
import { createAnonymousHeavyGate, LLM_LIMITS, SlidingWindowLimiter } from "./rate-limit";
import { DailyLimitReached, type GrokAccess } from "./types";
import { RequestError } from "@/lib/request-errors";

export type LlmAccess = {
  userId: string | null;
  grok: GrokAccess;
};

class TooManyRequestsError extends RequestError {
  readonly retryAfterMs: number;

  constructor(retryAfterMs: number, message = "Too many requests — try again in a minute.") {
    super(429, message);
    this.name = "TooManyRequestsError";
    this.retryAfterMs = retryAfterMs;
  }
}

export interface LlmAccessOptions {
  /**
   * The function does costly work on the server even without a model call
   * (Pioneer's local analysis), so every caller is held to a per-minute
   * allowance there, and signed-out callers to a much smaller one.
   */
  heavy?: boolean;
}

/**
 * Who is calling and whether a model call may be made, checked before the
 * function's input is parsed. In order: the same-site check, the per-address
 * limit, the session (and, when the browser sent one, the account it expects),
 * the heavy-path allowances, then the key, the sign-in, and the per-user and
 * instance-wide minute limits. The persisted daily budget is not spent here:
 * `callModel` spends it only when a model call is actually attempted.
 */
export async function resolveLlmAccess(
  bearerToken?: string,
  options: LlmAccessOptions = {},
  expectedAccountId?: string,
): Promise<LlmAccess> {
  assertSameSiteRequest();
  const ipKey = `ip:${requestIp()}`;
  const ipResult = perIpLimiter.take(ipKey);
  if (!ipResult.allowed) throw new TooManyRequestsError(ipResult.retryAfterMs, TRY_AGAIN);

  let userId: string | null = null;
  if (!authConfigured && !databaseConfigured) {
    userId = DEV_USER_ID;
  } else {
    userId = (await getSessionUser(bearerToken))?.id ?? null;
    // A tab that was signed in as one account never gets an answer, or spends
    // a budget, under another.
    if (expectedAccountId !== undefined) assertExpectedAccount(expectedAccountId, userId ?? "");
  }

  if (options.heavy && !userId) {
    const anonymous = anonymousHeavyGate(ipKey);
    if (!anonymous.allowed) {
      throw new TooManyRequestsError(anonymous.retryAfterMs, SIGN_IN_OR_TRY_AGAIN);
    }
  }
  // Taken for every signed-in caller, with or without a key, so the heavy
  // local analysis is capped per account and not only per address.
  const userResult = userId ? perUserLimiter.take(userId) : null;
  const userAllowed = userResult?.allowed ?? true;
  if (options.heavy && userResult && !userResult.allowed) {
    throw new TooManyRequestsError(userResult.retryAfterMs, TRY_AGAIN);
  }

  if (!process.env.XAI_API_KEY?.trim()) return { userId, grok: "no_api_key" };
  if (!userId) return { userId, grok: "unauthenticated" };
  if (!userAllowed) return { userId, grok: "rate_limited" };
  if (!globalLimiter.take("global").allowed) return { userId, grok: "rate_limited" };
  return { userId, grok: "allowed" };
}

/**
 * The one way to call the model for a request the middleware allowed. Spends
 * one unit of the persisted daily budget first, so only an attempted model
 * call is counted. Throws DailyLimitReached when today's budget is spent.
 * Returns null, and the caller uses its local answer, when the request may
 * not call the model, the budget cannot be read (fails closed), or the
 * upstream call fails.
 */
export async function callModel(
  access: LlmAccess,
  opts: GrokChatOptions,
): Promise<GrokChatResult | null> {
  const apiKey = process.env.XAI_API_KEY?.trim();
  if (access.grok !== "allowed" || !access.userId || !apiKey) return null;
  const budget = await checkDailyBudget(
    getSql,
    access.userId,
    undefined,
    undefined,
    callerAddress(),
  );
  if (budget === "spent") throw new DailyLimitReached();
  if (budget !== "allowed") return null;
  return grokChat(apiKey, opts);
}

/** The calling address for the daily budget, or null outside a request. */
/**
 * The caller's address for the per-address daily ceiling, or null when no
 * trusted header names it: behind an untrusted proxy every caller shares the
 * proxy's address (or "unknown"), and one shared bucket would quietly become
 * a second, smaller global ceiling.
 */
function callerAddress(): string | null {
  if (trustedClientIpHeaders().length === 0) return null;
  try {
    const address = requestIp();
    return address === "unknown" ? null : address;
  } catch {
    return null;
  }
}

const TRY_AGAIN = "Too many requests — try again in a minute.";
const SIGN_IN_OR_TRY_AGAIN = "Too many requests — sign in, or try again in a minute.";

const perUserLimiter = new SlidingWindowLimiter(LLM_LIMITS.perUser);
const perIpLimiter = new SlidingWindowLimiter(LLM_LIMITS.perIp);
const globalLimiter = new SlidingWindowLimiter(LLM_LIMITS.global);
const anonymousHeavyGate = createAnonymousHeavyGate();
