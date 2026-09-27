import { DB_TYPE_PARSERS, toSql, postgresTransaction } from "./sql-transaction";
import { pgliteSql } from "./pglite-sql";
import { validateMigrationManifest } from "../../scripts/migration-manifest.mjs";

/**
 * The app's one database, **server-only**. A real Postgres (node-postgres,
 * `pg`) when `DATABASE_URL` is set — a deployed app or a configured sandbox,
 * Neon or any other Postgres — otherwise an embedded PGlite (Postgres compiled
 * to WASM) so the live preview has a working database with nothing
 * configured. Schema comes from `migrations/*.sql` on both.
 *
 * Sections: the `Sql` surface and the public functions; backend selection and
 * the production guard; the two backends; state kept across HMR; the eager
 * bootstrap.
 */

/**
 * Minimal shared SQL surface, satisfied by both backends. Both the
 * tagged-template and `.query()` forms resolve to an array of row objects:
 *
 *   const sql = await getSql();
 *   const rows = await sql`select * from todos where id = ${id}`; // parameterized
 *   const rows2 = await sql.query("select * from todos where id = $1", [id]);
 */
export interface Sql {
  <T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]>;
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  /** Runs all statements on one connection. Nested calls join the transaction. */
  transaction?<T>(work: (sql: Sql) => Promise<T>): Promise<T>;
}

/**
 * Get the shared SQL client. Memoized per module instance — safe to call per
 * request; a failed init is not memoized, so the next call retries. Schema
 * comes from `migrations/*.sql`, applied before the first query on the PGlite
 * backend (production applies it at build) — define tables there, never inline
 * in server functions.
 */
export function getSql(): Promise<Sql> {
  sqlPromise ??= createSql().catch((err) => {
    sqlPromise = null;
    throw err;
  });
  return sqlPromise;
}

/**
 * Finish the database bootstrap before the server handles traffic.
 *
 * - **PGlite** (preview / no `DATABASE_URL`): open the in-memory database and
 *   apply `migrations/*.sql`. Idempotent — concurrent callers share one promise.
 * - **Postgres**: no-op (the pool is created lazily on first query).
 *
 * Vite `configureServer` awaits this at dev startup; importing this module
 * starts it in production (see the bottom of the file).
 */
export function ensureDbReady(): Promise<void> {
  if (dbSource !== "pglite" || PRODUCTION_WITHOUT_DATABASE) return Promise.resolve();
  return getSql().then(() => undefined);
}

/**
 * The one node-postgres pool of this process, shared by app queries and Better
 * Auth (see `@/lib/auth/server`). Small and short-lived: each warm serverless
 * instance keeps its own pool, so a large default (10) multiplied by instances
 * and by two pools exhausts the database.
 */
export function getPgPool(): Promise<import("pg").Pool> {
  if (dbSource !== "postgres") {
    return Promise.reject(
      new Error("getPgPool() needs DATABASE_URL (the PGLite fallback has no pool)"),
    );
  }
  state.__pgPoolPromise__ ??= createPool().catch((err) => {
    state.__pgPoolPromise__ = undefined;
    throw err;
  });
  return state.__pgPoolPromise__;
}

/**
 * The shared PGlite instance (preview only), with `migrations/*.sql` applied.
 * Lets Better Auth persist to the SAME embedded database as app data (via a
 * Kysely dialect). Throws when `DATABASE_URL` is set.
 */
export async function getPglite(): Promise<import("@electric-sql/pglite").PGlite> {
  if (dbSource !== "pglite") {
    throw new Error("getPglite() is only available on the PGLite fallback (no DATABASE_URL)");
  }
  await getSql();
  const pg = await state.__pgliteInstance__;
  if (!pg) throw new Error("PGLite instance failed to initialize");
  return pg;
}

// ── Backend selection and the production guard ───────────────────────────────

/** Which database backend is active. */
type DbSource = "postgres" | "pglite";

// An empty/whitespace DATABASE_URL (an easy misconfig in deploy UIs) must mean
// "unset" — otherwise production would silently run on the PGLite fallback.
const rawDatabaseUrl = typeof process !== "undefined" ? process.env.DATABASE_URL : undefined;
const databaseUrl = rawDatabaseUrl && rawDatabaseUrl.trim() ? rawDatabaseUrl : undefined;

/**
 * True when a real database is configured (`DATABASE_URL` set and not blank).
 * The one place that decides it: auth and the coach guard import this.
 */
export const databaseConfigured = databaseUrl !== undefined;

const dbSource: DbSource = databaseConfigured ? "postgres" : "pglite";

/**
 * Production never falls back to the in-memory database: every cold start
 * would lose all saved data and sign everyone out. The build already refuses
 * to ship without DATABASE_URL (scripts/migrate.mjs); a process that somehow
 * starts without it fails every query with this message instead of serving.
 */
const PRODUCTION_WITHOUT_DATABASE =
  typeof process !== "undefined" &&
  process.env.VERCEL_ENV === "production" &&
  dbSource === "pglite";
const PRODUCTION_WITHOUT_DATABASE_MESSAGE =
  "DATABASE_URL is not set in production. Set it in the project's environment variables and redeploy.";

if (PRODUCTION_WITHOUT_DATABASE) console.error(`[db] ${PRODUCTION_WITHOUT_DATABASE_MESSAGE}`);

let sqlPromise: Promise<Sql> | null = null;

async function createSql(): Promise<Sql> {
  if (typeof window !== "undefined") {
    throw new Error(
      "@/lib/db is server-only — call getSql() from a createServerFn handler " +
        "or a server route loader, never from client code.",
    );
  }
  if (PRODUCTION_WITHOUT_DATABASE) throw new Error(PRODUCTION_WITHOUT_DATABASE_MESSAGE);
  return dbSource === "postgres" ? createPostgresSql() : createPgliteSql();
}

// ── The two backends ─────────────────────────────────────────────────────────

/** Fail fast instead of holding a request until the platform kills it. */
const CONNECT_TIMEOUT_MS = 10_000;
const STATEMENT_TIMEOUT_MS = 30_000;

async function createPool(): Promise<import("pg").Pool> {
  // Imported on demand so `pg` never loads on the PGLite path.
  const { Pool, types } = await import("pg");
  // Result types match PGlite's (see DB_TYPE_PARSERS in ./sql-transaction).
  for (const [oid, parse] of Object.entries(DB_TYPE_PARSERS)) {
    types.setTypeParser(Number(oid), parse);
  }
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 4,
    idleTimeoutMillis: 10_000,
    allowExitOnIdle: true,
    // A connect (or a wait for a free slot) longer than this, or a statement
    // that runs longer than that, rejects with a clear error.
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    statement_timeout: STATEMENT_TIMEOUT_MS,
  });
  // The database closes idle connections (compute suspend, pooler restart).
  // pg-pool reports that as an 'error' event on the pool; with no listener
  // Node throws it as an uncaught exception and the whole process dies.
  pool.on("error", (err) => {
    console.error("[db] idle connection error:", err.message);
    void import("./observability/report.server")
      .then(({ reportServerError }) => reportServerError(err, "pg-pool"))
      .catch(() => undefined);
  });
  return pool;
}

function createPostgresSql(): Promise<Sql> {
  state.__pgSqlPromise__ ??= (async () => {
    const pool = await getPgPool();
    const sql = toSql(async <T>(text: string, params: unknown[]) => {
      const res = await pool.query(text, params);
      return res.rows as T[];
    });
    sql.transaction = (work) => postgresTransaction(pool, work);
    return sql;
  })().catch((err) => {
    state.__pgSqlPromise__ = undefined;
    throw err;
  });
  return state.__pgSqlPromise__;
}

async function createPgliteSql(): Promise<Sql> {
  // One in-memory instance per process, shared across HMR module instances, so
  // data survives source edits (it resets on dev-server restart).
  state.__pgliteInstance__ ??= openPglite().catch((err) => {
    state.__pgliteInstance__ = undefined;
    throw err;
  });
  const pg = await state.__pgliteInstance__;
  // Runs once per module instance — so an HMR reload after adding a migration
  // file applies it live — with passes serialized on a global chain so
  // concurrent callers never double-apply.
  const pass = (state.__pgliteMigrateChain__ ?? Promise.resolve())
    .catch(() => undefined) // an earlier failed pass must not wedge the chain
    .then(() => applyMigrations(pg));
  state.__pgliteMigrateChain__ = pass;
  await pass;
  return pgliteSql(pg);
}

async function openPglite(): Promise<import("@electric-sql/pglite").PGlite> {
  // Imported on demand so PGlite never loads on the Postgres path.
  const { PGlite } = await import("@electric-sql/pglite");
  const pg = new PGlite({ parsers: DB_TYPE_PARSERS });
  await pg.waitReady;
  await pg.exec(
    "create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())",
  );
  return pg;
}

/**
 * Apply migrations/ (the single schema source) so the preview matches
 * production. The SQL is inlined by the bundler via import.meta.glob (no
 * runtime fs) and checked against the same manifest rules the production
 * runner enforces; applied files are tracked in `_migrations`.
 */
async function applyMigrations(pg: import("@electric-sql/pglite").PGlite): Promise<void> {
  const files = import.meta.glob("/migrations/*.sql", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const renamed = import.meta.glob("/migrations/renamed.json", {
    import: "default",
    eager: true,
  }) as Record<string, unknown>;
  const sources = new Map(
    Object.entries(files).map(([path, text]) => [path.split("/").pop() as string, text]),
  );
  const names = [...sources.keys()].sort();
  validateMigrationManifest(names, Object.values(renamed)[0] ?? {});

  const doneRows = await pg.query<{ name: string }>("select name from _migrations");
  const done = new Set(doneRows.rows.map((r) => r.name));
  for (const name of names) {
    if (done.has(name)) continue;
    // Apply + record atomically (parity with scripts/migrate-core.mjs) so a
    // failed statement can't leave a file half-applied but untracked.
    await pg.transaction(async (tx) => {
      await tx.exec(sources.get(name) as string);
      await tx.query("insert into _migrations (name) values ($1)", [name]);
    });
  }
}

// ── State kept across HMR ────────────────────────────────────────────────────

/**
 * Init state lives on globalThis as promises: dev HMR creates new instances of
 * this module, and two instances racing module-level state would open a second
 * pool or run two concurrent PGLite migration passes (whose duplicate
 * `_migrations` insert rejects — and would get memoized, poisoning every later
 * `getSql()`). A failed init clears its slot so the next call retries. The
 * slot names are stable so a running dev server keeps its database across an
 * edit of this file.
 */
const state = globalThis as typeof globalThis & {
  __pgPoolPromise__?: Promise<import("pg").Pool>;
  __pgSqlPromise__?: Promise<Sql>;
  __pgliteInstance__?: Promise<import("@electric-sql/pglite").PGlite>;
  __pgliteMigrateChain__?: Promise<void>;
  __pgBootstrapPromise__?: Promise<void>;
};

// ── Eager bootstrap ──────────────────────────────────────────────────────────

// Importing this module in Node is what starts the PGlite bootstrap in
// production and for every server module that imports it (auth included).
// Client bundles never hit this path (`getSql` throws in the browser). Logged,
// not rethrown: an unhandled rejection here would end the whole process. The
// next getSql() call retries and surfaces the error to that request alone.
if (typeof window === "undefined" && dbSource === "pglite" && !PRODUCTION_WITHOUT_DATABASE) {
  state.__pgBootstrapPromise__ ??= ensureDbReady().catch((err) => {
    state.__pgBootstrapPromise__ = undefined;
    console.error("[db] PGLite bootstrap failed:", err);
  });
}
