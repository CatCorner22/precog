import type { Sql } from "@/lib/db";

/** Admitted model requests, not dollars or denied attempts. UTC day boundaries. */
export const LLM_DAILY_LIMITS = {
  perUser: envInt("LLM_DAILY_PER_USER", 150),
  global: envInt("LLM_DAILY_GLOBAL", 1_500),
} as const;

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 && value <= 2_147_483_647 ? value : fallback;
}

export interface DailyBudget {
  allowed: boolean;
  userCalls: number;
  globalCalls: number;
}

export function userScope(userId: string): string {
  return `user:${userId}`;
}

/**
 * The database reserves both capacities in one transaction, global row first.
 * A refused request increments only the separate rejection ledger. No network
 * call is made while database locks are held. See migration 0020.
 */
export async function takeDailyBudget(
  sql: Sql,
  userId: string,
  limits: { perUser: number; global: number } = LLM_DAILY_LIMITS,
): Promise<DailyBudget> {
  const rows = await sql<{ budget: DailyBudget }>`
    select precog_take_daily_budget(
      ${userScope(userId)}::text, ${limits.perUser}::int, ${limits.global}::int
    ) as budget
  `;
  const budget = rows[0]?.budget;
  if (!budget || typeof budget.allowed !== "boolean") throw new Error("Invalid budget result");
  return budget;
}

export async function purgeOldDailyUsage(sql: Sql, keepDays = 35): Promise<void> {
  // One statement, so usage and rejection retention move together.
  await sql`
    with purged as (
      delete from llm_daily_usage
      where day < (now() at time zone 'UTC')::date - ${keepDays}::int
    )
    delete from llm_daily_rejections
    where day < (now() at time zone 'UTC')::date - ${keepDays}::int
  `;
}

export const DAILY_USAGE_PURGE_INTERVAL_MS = 6 * 60 * 60 * 1000;

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

/** Budget-storage failure refuses the model request; callers retain local fallback. */
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
        `[llm] daily ceiling reached: user ${budget.userCalls} admitted, global ${budget.globalCalls} admitted`,
      );
    }
    await purge(sql);
    return budget.allowed;
  } catch (error) {
    console.error("[llm] daily usage check failed; refusing the model call", error);
    return false;
  }
}
