import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "@/lib/db";
import { pgliteSql } from "@/lib/pglite-sql";

/**
 * An embedded Postgres with every file in migrations/ applied, for store
 * tests: the real schema (composite keys, constraints, cascades), not a
 * hand-written stand-in. The same `Sql` adapter as the preview
 * (src/lib/pglite-sql.ts), without importing the app's db bootstrap.
 */
export interface TestDb {
  pg: PGlite;
  sql: Sql;
  seedUser: (id: string, email?: string) => Promise<void>;
  /** Empties the given tables (in order) between tests. */
  clear: (...tables: string[]) => Promise<void>;
  close: () => Promise<void>;
}

const MIGRATIONS_DIR = join(process.cwd(), "migrations");

/** Inserts one verified user row; shared with ./safety-db.ts. */
export const SEED_USER_SQL = `insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
  values ($1, $1, $2, true, now(), now())`;

export async function openTestDb(): Promise<TestDb> {
  const pg = new PGlite();
  await pg.waitReady;
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
  for (const name of files) await pg.exec(await readFile(join(MIGRATIONS_DIR, name), "utf8"));
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
