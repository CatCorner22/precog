#!/usr/bin/env node
/**
 * Deploy-time database migrator (node-postgres, `pg`).
 *
 * `npm run db:migrate` applies pending files in ../migrations to DATABASE_URL
 * (see ./migrate-core.mjs for the ledger). `npm run build` runs it with
 * `--only-on-production`, which leaves the database alone unless VERCEL_ENV
 * is production: preview deploys, CI and local builds never write to it (a
 * preview build often carries the production DATABASE_URL).
 *
 * On a production deploy it refuses to continue without DATABASE_URL and
 * BETTER_AUTH_SECRET, and warns about each optional feature that is only half
 * configured (see .env.example) and when no error tracker is set. Elsewhere, no DATABASE_URL means skip: the
 * PGLite fallback applies the same files at startup (src/lib/db.ts).
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";
import { runMigrations } from "./migrate-core.mjs";

const onlyOnProduction = process.argv.includes("--only-on-production");
const isProduction = process.env.VERCEL_ENV === "production";
const databaseUrl = env("DATABASE_URL");
const lockTimeoutMs = env("MIGRATION_LOCK_TIMEOUT_MS")
  ? Number(env("MIGRATION_LOCK_TIMEOUT_MS"))
  : 30_000;

if (onlyOnProduction && !isProduction) {
  console.log("[migrate] not a production deploy — leaving the database unchanged.");
  process.exit(0);
}
if (isProduction) {
  // A production deploy without these runs on an in-memory database with a
  // random signing secret: every cold start loses all data and signs everyone
  // out. Refuse to build rather than ship that.
  const missing = ["DATABASE_URL", "BETTER_AUTH_SECRET"].filter((key) => !env(key));
  if (missing.length > 0) {
    console.error(
      `[migrate] Refusing a production build: ${missing.join(" and ")} ${missing.length === 1 ? "is" : "are"} not set. Set ${missing.length === 1 ? "it" : "them"} in the project's environment variables and redeploy.`,
    );
    process.exit(1);
  }
  for (const warning of featureWarnings()) console.warn(`[migrate] warning: ${warning}`);
}
if (!databaseUrl) {
  console.log("[migrate] DATABASE_URL not set — skipping (the PGLite fallback migrates itself).");
  process.exit(0);
}

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

main().catch((err) => {
  console.error("[migrate] failed:", err?.message || err);
  // pg errors carry the context needed to debug a bad SQL file.
  for (const key of ["code", "detail", "hint", "position", "where"]) {
    if (err?.[key] != null) console.error(`[migrate]   ${key}: ${err[key]}`);
  }
  process.exit(1);
});

async function main() {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 1,
    connectionTimeoutMillis: 10_000,
  });
  const client = await pool.connect();
  try {
    await runMigrations({
      migrationsDir,
      lockTimeoutMs,
      exec: async (sql, params) => (await client.query(sql, params)).rows,
      log: console.log,
    });
  } finally {
    client.release();
    await pool.end();
  }
}

/**
 * One line per optional feature that will not work as deployed: the
 * scheduled job without its secret, or a feature with some of its settings
 * but not all. A feature with none of its settings is simply off.
 */
function featureWarnings() {
  const warnings = [];
  if (!env("CRON_SECRET"))
    warnings.push(
      "CRON_SECRET is not set, so the weekly job is refused: no reminder email, no purge of deleted businesses, no QuickBooks refresh.",
    );
  // The names src/lib/observability/report.server.ts reads.
  if (!env("SENTRY_DSN") && !env("ERROR_REPORT_URL"))
    warnings.push(
      "Neither SENTRY_DSN nor ERROR_REPORT_URL is set, so server errors go only to the server log and nobody is alerted. Set one of them (see docs/OPERATIONS.md, Monitoring).",
    );
  // Features that need every one of their variables (see .env.example).
  const features = [
    [
      "Billing",
      [
        "STRIPE_SECRET_KEY",
        "STRIPE_PRICE_ASSESSMENT",
        "STRIPE_PRICE_MONTHLY",
        "STRIPE_WEBHOOK_SECRET",
      ],
    ],
    ["The QuickBooks link", ["QBO_CLIENT_ID", "QBO_CLIENT_SECRET", "INTEGRATION_KEY"]],
    ["Reminder email", ["RESEND_API_KEY", "EMAIL_FROM"]],
  ];
  for (const [feature, keys] of features) {
    const unset = keys.filter((key) => !env(key));
    if (unset.length > 0 && unset.length < keys.length)
      warnings.push(`${feature} is half set up: ${unset.join(", ")} not set.`);
  }
  return warnings;
}

/** An environment variable, with empty and whitespace-only treated as unset. */
function env(key) {
  return process.env[key]?.trim() || undefined;
}
