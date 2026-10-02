import type { Sql } from "@/lib/db";

/**
 * Whether migration 0026 (control_execution_log) has been applied. Used by
 * /api/health for deploy verification; does not expose connection details.
 *
 * A table, once there, stays there, so a true answer is kept for the life of
 * the process: /api/health and each recorded monthly review then skip the
 * information_schema query, and a monitor calling the health route costs one
 * `select 1`. A false answer is asked again next time, since the migration
 * may be applied while the process runs.
 */
export async function controlExecutionLogReady(sql: Sql): Promise<boolean> {
  if (knownReady) return true;
  const rows = await sql<{ ready: boolean }>`
    select exists (
      select 1
      from information_schema.tables
      where table_schema = 'public'
        and table_name = 'control_execution_log'
    ) as ready
  `;
  knownReady = Boolean(rows[0]?.ready);
  return knownReady;
}

let knownReady = false;
