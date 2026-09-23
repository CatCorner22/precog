import type { Sql } from "@/lib/db";

/** Passcode guesses allowed per share within one window before the link locks. */
export const PASSCODE_ATTEMPT_LIMIT = 10;
/** Length, in minutes, of the window the guesses are counted over. */
export const PASSCODE_ATTEMPT_WINDOW_MINUTES = 15;
/** Failed-guess log rows (which carry an IP hash) are kept this many days. */
export const PASSCODE_ATTEMPT_RETENTION_DAYS = 30;

/**
 * Reserves one guess on the share before the passcode is checked. The count
 * lives on the map_shares row, in Postgres rather than process memory, so it
 * holds across serverless instances and cold starts.
 *
 * One statement does the check and the increment. A concurrent guess on the
 * same share waits for this row lock, and Postgres then re-evaluates the WHERE
 * clause against the updated row, so a burst of guesses cannot all read the
 * same count. The window starts at the first guess and resets once it is
 * older than PASSCODE_ATTEMPT_WINDOW_MINUTES. Returns false when the window
 * already holds PASSCODE_ATTEMPT_LIMIT guesses.
 */
export async function reservePasscodeGuess(sql: Sql, token: string): Promise<boolean> {
  const rows = await sql<{ passcode_attempts: number }>`
    update map_shares set
      passcode_window_started_at = case
        when passcode_window_started_at is null
          or passcode_window_started_at <= now() - make_interval(mins => ${PASSCODE_ATTEMPT_WINDOW_MINUTES}::int)
        then now()
        else passcode_window_started_at
      end,
      passcode_attempts = case
        when passcode_window_started_at is null
          or passcode_window_started_at <= now() - make_interval(mins => ${PASSCODE_ATTEMPT_WINDOW_MINUTES}::int)
        then 1
        else passcode_attempts + 1
      end
    where token = ${token}
      and (
        passcode_window_started_at is null
        or passcode_window_started_at <= now() - make_interval(mins => ${PASSCODE_ATTEMPT_WINDOW_MINUTES}::int)
        or passcode_attempts < ${PASSCODE_ATTEMPT_LIMIT}::int
      )
    returning passcode_attempts
  `;
  return rows.length > 0;
}

/** Gives a reserved guess back: a correct passcode must not count toward the lock. */
export async function releasePasscodeGuess(sql: Sql, token: string): Promise<void> {
  await sql`
    update map_shares
    set passcode_attempts = greatest(passcode_attempts - 1, 0)
    where token = ${token}
      and passcode_window_started_at > now() - make_interval(mins => ${PASSCODE_ATTEMPT_WINDOW_MINUTES}::int)
  `;
}

/** Logs a wrong guess. The lock itself is the counter above, not this log. */
export async function recordPasscodeFailure(
  sql: Sql,
  token: string,
  ipHash: string | null,
): Promise<void> {
  await sql`insert into map_share_attempts (token, ip_hash) values (${token}, ${ipHash})`;
}

/** True while the share's current window holds the guess limit. */
export async function passcodeLocked(sql: Sql, token: string): Promise<boolean> {
  const rows = await sql<{ locked: boolean }>`
    select (
      passcode_window_started_at > now() - make_interval(mins => ${PASSCODE_ATTEMPT_WINDOW_MINUTES}::int)
      and passcode_attempts >= ${PASSCODE_ATTEMPT_LIMIT}::int
    ) as locked
    from map_shares
    where token = ${token}
  `;
  return Boolean(rows[0]?.locked);
}

export type PasscodeGuessResult = "correct" | "wrong" | "locked";

/**
 * Runs one passcode guess under the lock: reserve a place in the window,
 * check the passcode, then give the place back when it was right or when the
 * check itself failed. A wrong guess keeps its place and is logged.
 */
export async function checkPasscodeGuess(
  sql: Sql,
  token: string,
  ipHash: string | null,
  verify: () => Promise<boolean>,
): Promise<PasscodeGuessResult> {
  if (!(await reservePasscodeGuess(sql, token))) return "locked";
  let correct: boolean;
  try {
    correct = await verify();
  } catch (error) {
    await releasePasscodeGuess(sql, token).catch(() => undefined);
    throw error;
  }
  if (correct) {
    await releasePasscodeGuess(sql, token).catch((error) =>
      console.error("Failed to release a passcode guess", error),
    );
    return "correct";
  }
  await recordPasscodeFailure(sql, token, ipHash).catch((error) =>
    console.error("Failed to record a passcode failure", error),
  );
  return "wrong";
}

/** Drops failed-guess log rows older than the retention period. */
export async function purgeOldPasscodeAttempts(sql: Sql): Promise<void> {
  await sql`
    delete from map_share_attempts
    where attempted_at < now() - make_interval(days => ${PASSCODE_ATTEMPT_RETENTION_DAYS}::int)
  `;
}
