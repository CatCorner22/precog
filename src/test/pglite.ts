import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
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

/**
 * Lets the rest of the transaction delete activity-log rows, as the account
 * deletion does (src/lib/precog/firm/audit.server.ts). Shared with the test
 * cleanups that delete users who may hold log rows.
 */
export const AUDIT_BYPASS_SQL = "select set_config('precog.audit_bypass', 'on', true);";

/**
 * Where the migrated cluster's data directory is kept between test files, as
 * the tar PGlite dumps: under `.tmp/` in the repository (gitignored) so a CI
 * run and every worker in it share one file. PRECOG_PGLITE_TEMPLATE_DIR
 * overrides it; an unwritable directory just means every file migrates.
 */
const TEMPLATE_DIR =
  process.env.PRECOG_PGLITE_TEMPLATE_DIR ??
  fileURLToPath(new URL("../../.tmp/pglite-template/", import.meta.url));

/** The dump for this exact set of migration files, read once per worker. */
let templatePromise: Promise<Blob | null> | null = null;

/**
 * Open a PGlite with every migration applied. `initdb` is the slow part of a
 * fresh PGlite (one to two seconds; the 50 migration files take a fifth of
 * that), so the first caller in a run builds the cluster once, dumps its data
 * directory to disk, and every later caller, in this worker and the others,
 * loads that dump instead: about a third of a second. The dump is keyed by a
 * checksum of the migration files, so adding or editing one rebuilds it.
 */
export async function openTestDb(): Promise<TestDb> {
  templatePromise ??= loadOrBuildTemplate().catch((err) => {
    templatePromise = null;
    console.warn(`[test/pglite] no template, migrating per file: ${(err as Error).message}`);
    return null;
  });
  const template = await templatePromise;
  const pg = template
    ? new PGlite({ parsers: DB_TYPE_PARSERS, loadDataDir: template })
    : await freshMigratedPglite();
  await pg.waitReady;
  return {
    pg,
    sql: pgliteSql(pg),
    seedUser: async (id, email = `${id}@example.test`) => {
      await pg.query(SEED_USER_SQL, [id, email]);
    },
    clear: async (...tables) => {
      // Under the audit bypass (migration 0048): deleting a user cascades
      // into its firm's activity log, which refuses every other delete.
      const deletes = tables.map((t) => `delete from ${t};`).join(" ");
      try {
        await pg.exec(`begin; ${AUDIT_BYPASS_SQL} ${deletes} commit;`);
      } catch (err) {
        await pg.exec("rollback;");
        throw err;
      }
    },
    close: () => pg.close(),
  };
}

/** A fresh cluster with every migration applied, the way each test file did before the template. */
async function freshMigratedPglite(): Promise<PGlite> {
  const pg = new PGlite({ parsers: DB_TYPE_PARSERS });
  await pg.waitReady;
  for (const name of await migrationFiles()) {
    await pg.exec(await readFile(join(MIGRATIONS_DIR, name), "utf8"));
  }
  return pg;
}

/**
 * The migrated cluster's dump for the current migration files: read from
 * disk when a run already built it, built and written otherwise. Two workers
 * building at once each write their own temporary file and rename it into
 * place, so a reader never sees a partial dump.
 */
async function loadOrBuildTemplate(): Promise<Blob> {
  const names = await migrationFiles();
  const hash = createHash("sha256");
  for (const name of names) {
    hash
      .update(name)
      .update("\0")
      .update(await readFile(join(MIGRATIONS_DIR, name)))
      .update("\0");
  }
  const path = join(TEMPLATE_DIR, `${hash.digest("hex").slice(0, 16)}.tar`);
  try {
    return new Blob([await readFile(path)]);
  } catch {
    // Not built yet (or unreadable): build it below.
  }
  const pg = await freshMigratedPglite();
  const dump = await pg.dumpDataDir("none");
  await pg.close();
  const bytes = new Uint8Array(await dump.arrayBuffer());
  try {
    await mkdir(TEMPLATE_DIR, { recursive: true });
    const partial = join(
      TEMPLATE_DIR,
      `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.partial`,
    );
    await writeFile(partial, bytes);
    await rename(partial, path);
  } catch (err) {
    // The dump still serves this worker; the next run builds again.
    console.warn(
      `[test/pglite] template not saved under ${TEMPLATE_DIR}: ${(err as Error).message}`,
    );
  }
  return new Blob([bytes]);
}

/** The migration file names in apply order, validated as the deploy migrator does. */
export function migrationFiles(): Promise<string[]> {
  return listMigrationFiles(MIGRATIONS_DIR) as Promise<string[]>;
}
