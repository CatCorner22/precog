import type { PGlite } from "@electric-sql/pglite";
import type { Sql } from "./db";
import { toSql, transactionScope } from "./sql-transaction";

/**
 * A PGlite instance behind the app's `Sql` surface: parameterized queries,
 * and transactions whose nested calls join the outer unit. Shared by the
 * preview's embedded database (`db.ts`) and the store tests (src/test), so
 * tests exercise the same adapter the preview runs.
 */
export function pgliteSql(pg: PGlite): Sql {
  const sql = toSql(
    async <T>(text: string, params: unknown[]) => (await pg.query<T>(text, params)).rows,
  );
  sql.transaction = (work) =>
    pg.transaction((tx) =>
      transactionScope(
        async <T>(text: string, params: unknown[]) => (await tx.query<T>(text, params)).rows,
        work,
      ),
    );
  return sql;
}
