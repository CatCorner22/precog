#!/usr/bin/env node
/** Explicit release operation. A normal application build never invokes this script. */
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import pg from "pg";

const production = process.env.VERCEL_ENV === "production" || process.env.PRECOG_RUNTIME_MODE === "production";
const databaseUrl = process.env.DATABASE_MIGRATION_URL?.trim() || process.env.DATABASE_URL?.trim();
const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const LOCK_NAMESPACE = 1347571527;
const LOCK_RESOURCE = 1;

function integerEnvironment(name, fallback, minimum, maximum) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

async function main() {
  if (!databaseUrl) {
    if (production) throw new Error("DATABASE_MIGRATION_URL is required for a production migration");
    console.log("[migrate] DATABASE_URL not set — skipping; local PGLite migrates itself.");
    return;
  }
  if (production && process.env.PRECOG_MIGRATIONS_APPROVED !== "true") {
    throw new Error("Production migrations require separate release approval and PRECOG_MIGRATIONS_APPROVED=true");
  }
  const target = new URL(databaseUrl);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname);
  if (target.hostname.includes("-pooler")) {
    throw new Error("Use a direct database connection for migrations, not a transaction pooler");
  }
  if (!loopback && !["direct", "session"].includes(process.env.MIGRATION_CONNECTION_MODE ?? "")) {
    throw new Error("Confirm MIGRATION_CONNECTION_MODE=direct or session for the migration connection");
  }
  const timeout = integerEnvironment("MIGRATION_LOCK_TIMEOUT_MS", 30_000, 100, 120_000);
  const client = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 10_000 });
  let locked = false;
  await client.connect();
  try {
    const deadline = Date.now() + timeout;
    do {
      const { rows } = await client.query("select pg_try_advisory_lock($1, $2) as acquired", [LOCK_NAMESPACE, LOCK_RESOURCE]);
      locked = rows[0].acquired === true;
      if (locked) break;
      if (Date.now() >= deadline) throw new Error("Another migration runner holds the lock; no migration was applied by this process");
      await delay(Math.min(250, Math.max(1, deadline - Date.now())));
    } while (!locked);

    // Lock BEFORE creating or reading the ledger. Every subsequent query uses
    // this same direct/session connection, including each file transaction.
    await client.query("CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())");
    const applied = new Set((await client.query("SELECT name FROM _migrations")).rows.map((row) => row.name));
    const files = (await readdir(migrationsDir)).filter((name) => name.endsWith(".sql")).sort();
    let count = 0;
    for (const name of files) {
      if (applied.has(name)) continue;
      const source = await readFile(join(migrationsDir, name), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(source);
        await client.query("INSERT INTO _migrations (name) VALUES ($1)", [name]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw new Error(`Migration ${name} failed and was rolled back`, { cause: error });
      }
      console.log(`[migrate] applied ${name}`);
      count += 1;
    }
    console.log(count ? `[migrate] done — ${count} migration(s) applied.` : "[migrate] up to date.");
  } finally {
    if (locked) {
      await client.query("select pg_advisory_unlock($1, $2)", [LOCK_NAMESPACE, LOCK_RESOURCE]).catch(() => undefined);
    }
    await client.end();
  }
}

main().catch((error) => {
  // Do not print connection strings, SQL parameters, or customer data.
  console.error("[migrate]", error instanceof Error ? error.message : "Migration failed");
  const cause = error?.cause;
  if (cause?.code) console.error("[migrate] database error code:", cause.code);
  process.exitCode = 1;
});
