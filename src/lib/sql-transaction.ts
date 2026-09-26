import type { Sql } from "./db";

export type QueryRunner = <T>(text: string, params: unknown[]) => Promise<T[]>;

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

/** Never pretend independent pool queries form a transaction. */
export function inTransaction<T>(sql: Sql, work: (tx: Sql) => Promise<T>): Promise<T> {
  if (!sql.transaction) throw new Error("This operation requires a transaction-capable SQL client");
  return sql.transaction(work);
}

/** Nested operations join; a caught nested failure still rolls back the outer unit. */
export async function transactionScope<T>(
  run: QueryRunner,
  work: (tx: Sql) => Promise<T>,
): Promise<T> {
  let active = true;
  let failed = false;
  const tx = toSql(async <R>(text: string, params: unknown[]) => {
    if (!active) throw new Error("Transaction is already closed");
    try {
      return await run<R>(text, params);
    } catch (error) {
      failed = true;
      throw error;
    }
  });
  tx.transaction = async (nested) => {
    if (!active) throw new Error("Transaction is already closed");
    try {
      return await nested(tx);
    } catch (error) {
      failed = true;
      throw error;
    }
  };
  try {
    const result = await work(tx);
    if (failed) throw new Error("Transaction aborted after a nested operation failed");
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
