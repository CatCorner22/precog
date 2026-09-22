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
