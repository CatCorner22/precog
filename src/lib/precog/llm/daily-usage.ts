import type { Sql } from "@/lib/db";

/**
 * Daily ceilings on model calls. The per-minute limiter (rate-limit.ts) lives
 * in process memory and smooths bursts; these counts live in Postgres and cap
 * what a day can spend of the app owner's quota. Override with
 * LLM_DAILY_PER_USER and LLM_DAILY_GLOBAL.
 */
export const LLM_DAILY_LIMITS = {
  perUser: envInt("LLM_DAILY_PER_USER", 150),
  global: envInt("LLM_DAILY_GLOBAL", 1_500),
} as const;

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export interface DailyBudget {
  allowed: boolean;
  userCalls: number;
  globalCalls: number;
}

/** The user's scope key; the global scope is the literal string "global". */
export function userScope(userId: string): string {
  return `user:${userId}`;
}

/**
 * Records one call for the user and for the whole app today, and reports
 * whether either count is now over its ceiling. The row for a denied call is
 * still counted, so a caller who keeps trying stays denied until tomorrow.
 * The day is the database's current date, so every instance agrees on it.
 */
export async function takeDailyBudget(
  sql: Sql,
  userId: string,
  limits: { perUser: number; global: number } = LLM_DAILY_LIMITS,
): Promise<DailyBudget> {
  const rows = await sql<{ scope: string; calls: number | string }>`
    insert into llm_daily_usage (scope, day, calls)
    values (${userScope(userId)}, current_date, 1), ('global', current_date, 1)
    on conflict (scope, day) do update set calls = llm_daily_usage.calls + 1
    returning scope, calls
  `;
  const count = (scope: string) => Number(rows.find((r) => r.scope === scope)?.calls ?? 0);
  const userCalls = count(userScope(userId));
  const globalCalls = count("global");
  return {
    allowed: userCalls <= limits.perUser && globalCalls <= limits.global,
    userCalls,
    globalCalls,
  };
}

/** Removes rows older than the retention window; called opportunistically. */
export async function purgeOldDailyUsage(sql: Sql, keepDays = 35): Promise<void> {
  await sql`delete from llm_daily_usage where day < current_date - ${keepDays}::int`;
}

/** How often, at most, one server instance purges old usage rows. */
export const DAILY_USAGE_PURGE_INTERVAL_MS = 6 * 60 * 60 * 1000;

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
 * The persisted daily ceiling for one model call. Fails closed: when the
 * count cannot be read or written, the call is refused (the caller falls back
 * to the local, model-free answer), because an unreadable budget is no budget
 * and every model call spends the app owner's quota.
 */
export async function withinDailyBudget(
  loadSql: () => Promise<Sql>,
  userId: string,
  limits: { perUser: number; global: number } = LLM_DAILY_LIMITS,
  purge: (sql: Sql) => Promise<boolean> = purgeDailyUsageOccasionally,
): Promise<boolean> {
  try {
    const sql = await loadSql();
    const budget = await takeDailyBudget(sql, userId, limits);
    if (!budget.allowed) {
      console.warn(
        `[llm] daily ceiling reached: user ${budget.userCalls} calls, global ${budget.globalCalls} calls`,
      );
    }
    await purge(sql);
    return budget.allowed;
  } catch (error) {
    console.error("[llm] daily usage check failed; refusing the model call", error);
    return false;
  }
}
