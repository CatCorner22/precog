import type { Sql } from "@/lib/db";

/**
 * How long a readiness answer is kept before the database is asked again.
 * Long enough that a monitor costs one `select 1` most calls, short enough
 * that a rollback or a migration applied while the process runs shows up
 * within minutes rather than never.
 */
const READY_TTL_MS = 5 * 60_000;

let knownReady = false;
let knownReadyAt = Number.NEGATIVE_INFINITY;

/**
 * Whether migration 0026 (control_execution_log) has been applied. Used by
 * /api/health for deploy verification; does not expose connection details.
 */
export async function controlExecutionLogReady(
  sql: Sql,
  now: number = Date.now(),
): Promise<boolean> {
  if (knownReady && now - knownReadyAt < READY_TTL_MS) return true;
  const rows = await sql<{ ready: boolean }>`
    select exists (
      select 1
      from information_schema.tables
      where table_schema = 'public'
        and table_name = 'control_execution_log'
    ) as ready
  `;
  knownReady = Boolean(rows[0]?.ready);
  knownReadyAt = now;
  return knownReady;
}

let appliedCount: number | null = null;
let appliedCountAt = Number.NEGATIVE_INFINITY;

/**
 * How many migrations the `_migrations` ledger holds, so /api/health shows
 * whether a deploy's migrations ran, not just whether one table exists.
 * Null when there is no ledger to read. Cached like the readiness answer.
 */
export async function migrationsApplied(
  sql: Sql,
  now: number = Date.now(),
): Promise<number | null> {
  if (appliedCount !== null && now - appliedCountAt < READY_TTL_MS) return appliedCount;
  let count: number | null;
  try {
    const rows = await sql<{ n: number | string }>`select count(*) as n from _migrations`;
    count = Number(rows[0]?.n ?? 0);
  } catch {
    count = null;
  }
  // A missing ledger is asked again next time, like a false readiness
  // answer: the database may gain its ledger while the process runs.
  if (count !== null) {
    appliedCount = count;
    appliedCountAt = now;
  }
  return count;
}
