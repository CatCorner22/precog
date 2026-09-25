import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "@/lib/db";

/**
 * An embedded Postgres with every file in migrations/ applied, for store
 * tests: the real schema (composite keys, constraints, cascades), not a
 * hand-written stand-in. Same placeholder rewriting as src/lib/db.ts `toSql`,
 * without importing the app's db bootstrap.
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

export function pgliteSql(db: PGlite): Sql {
  const run = async <T>(text: string, params: unknown[]) => (await db.query<T>(text, params)).rows;
  const tagged = (async <T = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]> => {
    let text = strings[0];
    for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1]}`;
    return run<T>(text, values);
  }) as unknown as Sql;
  tagged.query = <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
    run<T>(text, params);
  return tagged;
}

export async function openTestDb(): Promise<TestDb> {
  const pg = new PGlite();
  await pg.waitReady;
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
  for (const name of files) await pg.exec(await readFile(join(MIGRATIONS_DIR, name), "utf8"));
  return {
    pg,
    sql: pgliteSql(pg),
    seedUser: async (id, email = `${id}@example.test`) => {
      await pg.query(
        `insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
         values ($1, $1, $2, true, now(), now())`,
        [id, email],
      );
    },
    clear: async (...tables) => {
      await pg.exec(tables.map((t) => `delete from ${t};`).join(" "));
    },
    close: () => pg.close(),
  };
}
