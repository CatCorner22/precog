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
 * On a production deploy it refuses to continue without DATABASE_URL, a
 * BETTER_AUTH_SECRET of 32 or more characters, an https BETTER_AUTH_URL and
 * the SUPPORT_EMAIL mailbox, with sign-in turned off, or while
 * src/lib/precog/legal/operator.ts still holds a bracketed placeholder such as
 * "[STATE]" (the Terms and Privacy pages print those constants), printing one
 * line per problem. It warns about sign-in without its broker client, each
 * optional feature that is only half configured (see .env.example) and when
 * no error tracker is set. Elsewhere, no DATABASE_URL means skip: the PGLite
 * fallback applies the same files at startup (src/lib/db.ts).
 */
import { readFileSync } from "node:fs";
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
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
/** The operator constants the legal pages print, relative to the repository root. */
const OPERATOR_FILE = "src/lib/precog/legal/operator.ts";

if (onlyOnProduction && !isProduction) {
  console.log("[migrate] not a production deploy — leaving the database unchanged.");
  process.exit(0);
}
if (isProduction) {
  const problems = productionProblems();
  for (const problem of problems)
    console.error(`[migrate] Refusing a production build: ${problem}`);
  if (problems.length > 0) process.exit(1);
  for (const warning of featureWarnings()) console.warn(`[migrate] warning: ${warning}`);
}
if (!databaseUrl) {
  console.log("[migrate] DATABASE_URL not set — skipping (the PGLite fallback migrates itself).");
  process.exit(0);
}

const migrationsDir = join(repoRoot, "migrations");

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
 * One line per setting that leaves a production deploy broken or unsafe. A
 * line names the variable, never its value.
 */
function productionProblems() {
  const problems = [];
  // Without these it runs on an in-memory database with a random signing
  // secret: every cold start loses all data and signs everyone out.
  const missing = ["DATABASE_URL", "BETTER_AUTH_SECRET"].filter((key) => !env(key));
  if (missing.length > 0)
    problems.push(
      `${missing.join(" and ")} ${missing.length === 1 ? "is" : "are"} not set. Set ${missing.length === 1 ? "it" : "them"} in the project's environment variables and redeploy.`,
    );
  const secret = env("BETTER_AUTH_SECRET");
  if (secret && secret.length < 32)
    problems.push(
      "BETTER_AUTH_SECRET has fewer than 32 characters. Set a random one of 32 or more, for example from openssl rand -base64 32, and redeploy.",
    );
  // Sign-in and every link Precog sends out start from this address; without
  // it, sign-in looks for the live-preview hosts and fails.
  const authUrl = env("BETTER_AUTH_URL");
  if (!authUrl)
    problems.push(
      "BETTER_AUTH_URL is not set. Set it to this deployment's public address, for example https://precog.example.com, and redeploy.",
    );
  else if (!isHttps(authUrl))
    problems.push(
      "BETTER_AUTH_URL is not an https address. Set it to this deployment's public https address and redeploy.",
    );
  if (env("VITE_AUTH_ENABLED") === "false")
    problems.push('VITE_AUTH_ENABLED is "false", which turns sign-in off. Remove it and redeploy.');
  // The footer, the legal pages and the broken-link page print this mailbox.
  if (!env("SUPPORT_EMAIL"))
    problems.push(
      "SUPPORT_EMAIL is not set. Set it to the mailbox that answers support and data requests, and redeploy.",
    );
  // The Terms and Privacy pages print these constants; a bracketed value is
  // the template's placeholder, not the operator. The SUPPORT_EMAIL line is
  // not a bare literal, so it never matches here (the env check above is its gate).
  const operatorFile = env("PRECOG_OPERATOR_FILE") ?? join(repoRoot, OPERATOR_FILE);
  for (const [, name, literal] of readFileSync(operatorFile, "utf8").matchAll(
    /^export const ([A-Z_]+) = "(\[[A-Z ]+\])";$/gm,
  ))
    problems.push(
      `${name} in ${OPERATOR_FILE} is still the placeholder ${literal}. Enter the real value and redeploy.`,
    );
  return problems;
}

function isHttps(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * One line per optional feature that will not work as deployed: the
 * scheduled job without its secret, or a feature with some of its settings
 * but not all. A feature with none of its settings is simply off.
 */
function featureWarnings() {
  const warnings = [];
  // Email and password sign-in works without the broker client; Google and X
  // sign-in fall back to the preview client, which the broker refuses here.
  if (!env("GROK_AUTH_CLIENT_ID") || !env("GROK_AUTH_CLIENT_SECRET"))
    warnings.push(
      "GROK_AUTH_CLIENT_ID and GROK_AUTH_CLIENT_SECRET are not both set, so Google and X sign-in fail; only email and password sign-in works.",
    );
  if (!env("CRON_SECRET"))
    warnings.push(
      "CRON_SECRET is not set, so the weekly job is refused: no reminder email, no purge of deleted businesses or share logs, no QuickBooks refresh.",
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
