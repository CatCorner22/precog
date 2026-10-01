import type { Sql } from "@/lib/db";

/**
 * Whether migration 0026 (control_execution_log) has been applied. Used by
 * /api/health for deploy verification; does not expose connection details.
 */
export async function controlExecutionLogReady(sql: Sql): Promise<boolean> {
  const rows = await sql<{ ready: boolean }>`
    select exists (
      select 1
      from information_schema.tables
      where table_schema = 'public'
        and table_name = 'control_execution_log'
    ) as ready
  `;
  return Boolean(rows[0]?.ready);
}
