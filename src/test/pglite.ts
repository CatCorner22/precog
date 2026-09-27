import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "@/lib/db";
import { pgliteSql } from "@/lib/pglite-sql";
import { DB_TYPE_PARSERS } from "@/lib/sql-transaction";
// @ts-expect-error -- plain ESM script shared with the deploy-time migrator.
import { listMigrationFiles } from "../../scripts/migrate-core.mjs";

/**
 * An embedded Postgres with every file in migrations/ applied, for store
 * tests: the real schema (composite keys, constraints, cascades), not a
 * hand-written stand-in, and the app's result-type parsers, so a date column
 * comes back as 'YYYY-MM-DD' as it does in production. The same `Sql` adapter
 * as the preview (src/lib/pglite-sql.ts), without importing the app's db
 * bootstrap.
 */
export interface TestDb {
  pg: PGlite;
  sql: Sql;
  seedUser: (id: string, email?: string) => Promise<void>;
  /** Empties the given tables (in order) between tests. */
  clear: (...tables: string[]) => Promise<void>;
  close: () => Promise<void>;
}

/** The repository's migrations/, found from this file so any working directory works. */
export const MIGRATIONS_DIR = fileURLToPath(new URL("../../migrations/", import.meta.url));

/** Inserts one verified user row; shared with ./safety-db.ts. */
export const SEED_USER_SQL = `insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
  values ($1, $1, $2, true, now(), now())`;

export async function openTestDb(): Promise<TestDb> {
  const pg = new PGlite({ parsers: DB_TYPE_PARSERS });
  await pg.waitReady;
  for (const name of await migrationFiles()) {
    await pg.exec(await readFile(join(MIGRATIONS_DIR, name), "utf8"));
  }
  return {
    pg,
    sql: pgliteSql(pg),
    seedUser: async (id, email = `${id}@example.test`) => {
      await pg.query(SEED_USER_SQL, [id, email]);
    },
    clear: async (...tables) => {
      await pg.exec(tables.map((t) => `delete from ${t};`).join(" "));
    },
    close: () => pg.close(),
  };
}

/**
 * The `exec` the deploy migrator expects, over one PGlite: parameterised
 * statements return their rows, a multi-statement script its last result's.
 */
export function pgliteExec(pg: PGlite): (sql: string, params?: unknown[]) => Promise<unknown[]> {
  return async (sql, params) =>
    params ? (await pg.query(sql, params)).rows : ((await pg.exec(sql)).at(-1)?.rows ?? []);
}

/** The migration file names in apply order, validated as the deploy migrator does. */
export function migrationFiles(): Promise<string[]> {
  return listMigrationFiles(MIGRATIONS_DIR) as Promise<string[]>;
}
