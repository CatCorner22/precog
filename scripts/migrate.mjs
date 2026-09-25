#!/usr/bin/env node
/**
 * Deploy-time database migrator (node-postgres, `pg`).
 *
 * `npm run db:migrate` applies pending files in ../migrations to DATABASE_URL
 * (see ./migrate-core.mjs for the ledger). `npm run build` invokes it only
 * when VERCEL_ENV is production (see ./migrate-on-production.mjs), so a
 * preview or CI build never writes to the database.
 *
 * No DATABASE_URL -> skip, except on a production deploy, which refuses to
 * build. The PGLite fallback applies the same files at startup (src/lib/db.ts).
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";
import { runMigrations } from "./migrate-core.mjs";

const databaseUrl = process.env.DATABASE_URL?.trim();
const isProduction = process.env.VERCEL_ENV === "production";
if (isProduction) {
  // A production deploy without these runs on an in-memory database with a
  // random signing secret: every cold start loses all data and signs everyone
  // out. Refuse to build rather than ship that.
  const missing = ["DATABASE_URL", "BETTER_AUTH_SECRET"].filter((key) => !process.env[key]?.trim());
  if (missing.length > 0) {
    console.error(
      `[migrate] Refusing a production build: ${missing.join(" and ")} ${missing.length === 1 ? "is" : "are"} not set. Set ${missing.length === 1 ? "it" : "them"} in the project's environment variables and redeploy.`,
    );
    process.exit(1);
  }
}
if (!databaseUrl) {
  console.log("[migrate] DATABASE_URL not set — skipping (the PGLite fallback migrates itself).");
  process.exit(0);
}

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

async function main() {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  const client = await pool.connect();
  try {
    await runMigrations({
      migrationsDir,
      exec: async (sql, params) => (await client.query(sql, params)).rows,
      log: console.log,
    });
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[migrate] failed:", err?.message || err);
  // pg errors carry the context needed to debug a bad SQL file.
  for (const key of ["code", "detail", "hint", "position", "where"]) {
    if (err?.[key] != null) console.error(`[migrate]   ${key}: ${err[key]}`);
  }
  process.exit(1);
});
