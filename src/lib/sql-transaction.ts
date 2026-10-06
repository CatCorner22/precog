import type { Sql } from "./db";

type QueryRunner = <T>(text: string, params: unknown[]) => Promise<T[]>;

/**
 * Result-type parity: Postgres sends every value as text plus a type OID, and
 * the JS value is the driver's parsing choice. pg returns int8 as a string and
 * date as a local-midnight Date; PGlite 0.5 returns int8 as a number and date
 * as a UTC Date. Both backends are pinned here so preview and production
 * return identical shapes whatever the driver defaults:
 *   int8/bigint (incl. count(*)) -> number (past 2^53 loses precision — cast
 *                                   `::text` if you ever need huge integers)
 *   date                         -> 'YYYY-MM-DD' string
 *   interval                     -> Postgres interval text
 * numeric already comes back as a string on both (arbitrary precision).
 * Every database the app and its tests open uses this table; it lives here,
 * not in db.ts, because importing db.ts starts the app's database bootstrap.
 */
export const DB_TYPE_PARSERS: Record<number, (value: string) => unknown> = {
  20: Number, // int8
  1082: (value) => value, // date
  1186: (value) => value, // interval
};

/** Shared parameterization for pooled, reserved-connection and embedded SQL. */
export function toSql(run: QueryRunner): Sql {
  const sql = (async <T>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]> => {
    let text = strings[0];
    for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1]}`;
    return run<T>(text, values);
  }) as Sql;
  sql.query = <T>(text: string, params: unknown[] = []) => run<T>(text, params);
  return sql;
}

export interface TransactionOptions {
  /**
   * Run the whole unit once more when Postgres picks it as a deadlock victim
   * (SQLSTATE 40P01). The victim's statements were all rolled back, so `work`
   * starts again from nothing; a second deadlock reaches the caller. Ignored
   * when `sql` is already a transaction: a nested unit cannot restart, since
   * the deadlock aborted the outer one.
   */
  retryOnDeadlock?: boolean;
}

/** The handles `transactionScope` gives its work: a call on one joins that unit. */
const openUnits = new WeakSet<Sql>();

/** Never pretend independent pool queries form a transaction. */
export function inTransaction<T>(
  sql: Sql,
  work: (tx: Sql) => Promise<T>,
  options: TransactionOptions = {},
): Promise<T> {
  if (!sql.transaction) throw new Error("This operation requires a transaction-capable SQL client");
  const run = (): Promise<T> => sql.transaction!(work);
  if (!options.retryOnDeadlock || openUnits.has(sql)) return run();
  return run().catch((error: unknown) => {
    if (!isDeadlock(error)) throw error;
    return run();
  });
}

/** SQLSTATE 40P01 on the error or anywhere along its `cause` chain. */
export function isDeadlock(error: unknown): boolean {
  for (let e = error, depth = 0; e && typeof e === "object" && depth < 8; depth += 1) {
    if ((e as { code?: unknown }).code === "40P01") return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}

/** Nested operations join; a caught nested failure still rolls back the outer unit. */
export async function transactionScope<T>(
  run: QueryRunner,
  work: (tx: Sql) => Promise<T>,
): Promise<T> {
  let active = true;
  let failed = false;
  // The first failure inside the unit, kept as the cause of the abort.
  let firstFailure: unknown;
  const tx = toSql(async <R>(text: string, params: unknown[]) => {
    if (!active) throw new Error("Transaction is already closed");
    try {
      return await run<R>(text, params);
    } catch (error) {
      if (!failed) firstFailure = error;
      failed = true;
      throw error;
    }
  });
  openUnits.add(tx);
  tx.transaction = async (nested) => {
    if (!active) throw new Error("Transaction is already closed");
    try {
      return await nested(tx);
    } catch (error) {
      if (!failed) firstFailure = error;
      failed = true;
      throw error;
    }
  };
  try {
    const result = await work(tx);
    if (failed) {
      throw new Error("Transaction aborted after a nested operation failed", {
        cause: firstFailure,
      });
    }
    return result;
  } finally {
    active = false;
  }
}

interface ReservedClient {
  query(text: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
  release(error?: Error | boolean): void;
}

/** BEGIN, work, and COMMIT/ROLLBACK always use the same reserved connection. */
export async function postgresTransaction<T>(
  pool: { connect(): Promise<ReservedClient> },
  work: (tx: Sql) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  let broken = false;
  try {
    await client.query("BEGIN");
    const result = await transactionScope(
      async <R>(text: string, params: unknown[]) => (await client.query(text, params)).rows as R[],
      work,
    );
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      broken = true;
    }
    throw error;
  } finally {
    client.release(broken);
  }
}
