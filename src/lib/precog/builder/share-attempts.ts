import type { Sql } from "@/lib/db";

/** Failed guesses allowed per share within the window before the link locks. */
export const PASSCODE_ATTEMPT_LIMIT = 10;
/** Window, in minutes, over which failed guesses count. */
export const PASSCODE_ATTEMPT_WINDOW_MINUTES = 15;

/**
 * Number of failed passcode guesses recorded for a share inside the window.
 * Stored in Postgres, not process memory, so the count survives cold starts
 * and is shared by every serverless instance.
 */
export async function recentPasscodeFailures(sql: Sql, token: string): Promise<number> {
  const rows = await sql<{ failures: number | string }>`
    select count(*) as failures
    from map_share_attempts
    where token = ${token}
      and attempted_at > now() - make_interval(mins => ${PASSCODE_ATTEMPT_WINDOW_MINUTES})
  `;
  return Number(rows[0]?.failures ?? 0);
}

export async function recordPasscodeFailure(
  sql: Sql,
  token: string,
  ipHash: string | null,
): Promise<void> {
  await sql`insert into map_share_attempts (token, ip_hash) values (${token}, ${ipHash})`;
}

/** True once the share has met the failure limit inside the window. */
export async function passcodeLocked(sql: Sql, token: string): Promise<boolean> {
  return (await recentPasscodeFailures(sql, token)) >= PASSCODE_ATTEMPT_LIMIT;
}
