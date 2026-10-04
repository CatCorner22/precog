import type { Sql } from "@/lib/db";

/**
 * Daily ceilings on model calls. The per-minute limiter (rate-limit.ts) lives
 * in process memory and smooths bursts; these counts live in Postgres and cap
 * what a day can spend of the app owner's quota. A paid account (the Firm
 * plan, or an Assessment inside its window) has a larger allowance than a
 * free one, and free accounts together draw on at most a third of the global
 * ceiling, so paid accounts keep two thirds of it. An account costs nothing
 * to make, so the per-user ceiling alone would let a handful of accounts
 * spend the global one: each calling address has its own ceiling (well above
 * one user's, since an office shares one address), and accounts with neither
 * a verified email nor a Google or X sign-in share one smaller pool. Override
 * with LLM_DAILY_PER_USER, LLM_DAILY_PER_USER_PAID, LLM_DAILY_GLOBAL,
 * LLM_DAILY_FREE_POOL, LLM_DAILY_PER_ADDRESS and LLM_DAILY_UNVERIFIED.
 */
export const LLM_DAILY_LIMITS: DailyLimits = {
  perUser: envInt("LLM_DAILY_PER_USER", 100),
  perUserPaid: envInt("LLM_DAILY_PER_USER_PAID", 400),
  global: envInt("LLM_DAILY_GLOBAL", 1_500),
  freePool: envInt("LLM_DAILY_FREE_POOL", 500),
  perAddress: envInt("LLM_DAILY_PER_ADDRESS", 450),
  unverified: envInt("LLM_DAILY_UNVERIFIED", 300),
};

/** The AI allowance a plan gives: "paid" is the Firm plan or an Assessment inside its window. */
export type AiPlan = "free" | "paid";

export interface DailyLimits {
  /** Calls a day for one free account. */
  perUser: number;
  /** Calls a day for one paid account; unset means the free figure. */
  perUserPaid?: number;
  global: number;
  /** Calls a day shared by all free accounts; unset means no pool. */
  freePool?: number;
  /** Calls a day from one network address; unset means no address ceiling. */
  perAddress?: number;
  /** Calls a day shared by all unverified accounts; unset means no pool. */
  unverified?: number;
}

/** The pool all free accounts share. */
export const FREE_POOL_SCOPE = "pool:free";

/**
 * The per-user figure in force for a plan, and the paid one beside it, so a
 * limit message prints the figures this deployment set rather than a typed
 * default.
 */
export function userDailyLimits(
  plan: AiPlan,
  limits: DailyLimits = LLM_DAILY_LIMITS,
): { limit: number; paidLimit: number } {
  const paidLimit = limits.perUserPaid ?? limits.perUser;
  return { limit: plan === "paid" ? paidLimit : limits.perUser, paidLimit };
}

/** A further daily ceiling a call must fit under, besides the user's and the global one. */
export interface DailyScope {
  scope: string;
  limit: number;
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

interface DailyBudget {
  allowed: boolean;
  userCalls: number;
  globalCalls: number;
}

/** The user's scope key; the global scope is the literal string "global". */
export function userScope(userId: string): string {
  return `user:${userId}`;
}

/** The pool all unverified accounts share. */
export const UNVERIFIED_SCOPE = "pool:unverified";

/** An address's scope key. Hashed, so the usage table holds no raw address. */
export async function addressScope(address: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(address));
  // Hex by hand: scripts/test-quota-postgres.mjs loads this file in plain Node,
  // which cannot resolve the "@/" alias a shared helper would need.
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  return `ip:${hex.slice(0, 32)}`;
}

/**
 * True when the account has a verified email or signs in with Google or X,
 * which a script cannot make for free; a bare email/password account is not.
 */
export async function verifiedAccount(sql: Sql, userId: string): Promise<boolean> {
  const rows = await sql<{ verified: boolean }>`
    select exists (select 1 from "user" where id = ${userId} and "emailVerified")
      or exists (
        select 1 from "account" where "userId" = ${userId} and "providerId" <> 'credential'
      ) as verified
  `;
  return rows[0]?.verified === true;
}

/** The extra scopes a call is held to, under `limits`. */
async function extraScopes(
  sql: Sql,
  userId: string,
  address: string | null,
  limits: DailyLimits,
  plan: AiPlan,
): Promise<DailyScope[]> {
  const scopes: DailyScope[] = [];
  if (limits.freePool && plan === "free") {
    scopes.push({ scope: FREE_POOL_SCOPE, limit: limits.freePool });
  }
  if (limits.unverified && !(await verifiedAccount(sql, userId))) {
    scopes.push({ scope: UNVERIFIED_SCOPE, limit: limits.unverified });
  }
  if (limits.perAddress && address) {
    scopes.push({ scope: await addressScope(address), limit: limits.perAddress });
  }
  return scopes;
}

/**
 * Atomically admits a call only when both budgets have capacity. The database
 * function locks the shared day before the user and updates both together.
 * Rejected attempts do not consume capacity; process-local throttles still
 * limit abusive retries. No transaction remains open during the model call.
 */
export async function takeDailyBudget(
  sql: Sql,
  userId: string,
  limits: { perUser: number; global: number } = LLM_DAILY_LIMITS,
  extra: DailyScope[] = [],
): Promise<DailyBudget> {
  const rows = await sql<{
    allowed: boolean;
    user_calls: number;
    global_calls: number;
  }>`
    select allowed, user_calls, global_calls
    from precog_take_llm_daily_budget(
      ${userId}, ${limits.perUser}, ${limits.global},
      ${extra.map((e) => e.scope)}::text[], ${extra.map((e) => e.limit)}::integer[]
    )
  `;
  const row = rows[0];
  if (
    !row ||
    typeof row.allowed !== "boolean" ||
    !Number.isSafeInteger(row.user_calls) ||
    row.user_calls < 0 ||
    !Number.isSafeInteger(row.global_calls) ||
    row.global_calls < 0
  )
    throw new Error("Invalid daily budget response");
  return { allowed: row.allowed, userCalls: row.user_calls, globalCalls: row.global_calls };
}

/** Removes rows older than the retention window; called opportunistically. */
export async function purgeOldDailyUsage(sql: Sql, keepDays = 35): Promise<void> {
  await sql`delete from llm_daily_usage where day < current_date - ${keepDays}::int`;
}

/** How often, at most, one server instance purges old usage rows. */
const DAILY_USAGE_PURGE_INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * A purge that runs at most once per interval in this process, so the table
 * stays bounded without a scheduled job and without a delete on every call.
 * Returns whether it purged. A failed purge is logged and retried next time.
 */
export function createDailyUsagePurger(intervalMs = DAILY_USAGE_PURGE_INTERVAL_MS) {
  let lastPurgeAt: number | null = null;
  return async (sql: Sql, now = Date.now()): Promise<boolean> => {
    if (lastPurgeAt !== null && now - lastPurgeAt < intervalMs) return false;
    lastPurgeAt = now;
    try {
      await purgeOldDailyUsage(sql);
      return true;
    } catch (error) {
      lastPurgeAt = null;
      console.error("[llm] failed to purge old daily usage rows", error);
      return false;
    }
  };
}

const purgeDailyUsageOccasionally = createDailyUsagePurger();

/**
 * The persisted daily ceiling for one model call: "allowed" (one unit taken),
 * "spent" (the caller's own ceiling under their plan, or a pool it shares, is
 * reached), "spent-global" (Precog's ceiling across every account is reached)
 * or "unavailable". A free account is held to `perUser` and the free pool, a
 * paid one to `perUserPaid` alone. Fails closed: when the count cannot be
 * read or written, the call is refused (the caller falls back to the local,
 * model-free answer), because an unreadable budget is no budget and every
 * model call spends the app owner's quota.
 */
export async function checkDailyBudget(
  loadSql: () => Promise<Sql>,
  userId: string,
  limits: DailyLimits = LLM_DAILY_LIMITS,
  purge: (sql: Sql) => Promise<boolean> = purgeDailyUsageOccasionally,
  address: string | null = null,
  plan: AiPlan = "free",
): Promise<"allowed" | "spent" | "spent-global" | "unavailable"> {
  try {
    const sql = await loadSql();
    const extra = await extraScopes(sql, userId, address, limits, plan);
    const perUser = userDailyLimits(plan, limits).limit;
    const budget = await takeDailyBudget(sql, userId, { perUser, global: limits.global }, extra);
    if (!budget.allowed) {
      console.warn(
        `[llm] daily ceiling reached: user ${budget.userCalls} calls, global ${budget.globalCalls} calls`,
      );
    }
    await purge(sql);
    if (budget.allowed) return "allowed";
    return budget.globalCalls >= limits.global ? "spent-global" : "spent";
  } catch (error) {
    console.error("[llm] daily usage check failed; refusing the model call", error);
    return "unavailable";
  }
}

/** Whether one model call fits today's budget, taking one unit when it does; see checkDailyBudget. */
export async function withinDailyBudget(
  ...args: Parameters<typeof checkDailyBudget>
): Promise<boolean> {
  return (await checkDailyBudget(...args)) === "allowed";
}
