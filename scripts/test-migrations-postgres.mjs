/** Real independent connections; only disposable schemas on an explicitly enabled local test DB. */
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { runMigrations } from "./migrate-core.mjs";

if (process.env.PRECOG_MIGRATION_TEST !== "1")
  throw new Error("Enable PRECOG_MIGRATION_TEST for isolated tests only");
const connectionString = process.env.DATABASE_URL ?? "";
const url = new URL(connectionString);
if (
  !["postgres:", "postgresql:"].includes(url.protocol) ||
  !["localhost", "127.0.0.1", "postgres"].includes(url.hostname)
)
  throw new Error("Migration tests refuse nonlocal database endpoints");
const schema = `precog_migrate_${randomUUID().replaceAll("-", "")}`;
const dir = await mkdtemp(join(tmpdir(), "precog-migrations-"));
const admin = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 5000 });
let pool;
const steps = [];
const step = (message) => {
  steps.push(message);
  console.log(`· ${message}`);
};
try {
  await admin.query(`create schema ${schema}`);
  pool = new Pool({
    connectionString,
    max: 4,
    connectionTimeoutMillis: 5000,
    options: `-c search_path=${schema}`,
  });
  async function run(lockTimeoutMs = 2000) {
    const client = await pool.connect();
    try {
      return await runMigrations({
        migrationsDir: dir,
        exec: async (text, params) => (await client.query(text, params)).rows ?? [],
        lockTimeoutMs,
      });
    } finally {
      client.release();
    }
  }
  await writeFile(
    join(dir, "0001_one.sql"),
    "create table effects(id integer primary key); select pg_sleep(0.03); insert into effects values (1)",
  );
  await writeFile(
    join(dir, "0002_two.sql"),
    "select pg_sleep(0.03); insert into effects values (2)",
  );
  step("two simultaneous runners bootstrap and apply each migration exactly once");
  const results = await Promise.all([run(), run()]);
  assert.deepEqual(results.flatMap((r) => r.applied).sort(), ["0001_one.sql", "0002_two.sql"]);
  assert.deepEqual((await pool.query("select id from effects order by id")).rows, [
    { id: 1 },
    { id: 2 },
  ]);
  assert.deepEqual((await run()).applied, []);
  step("contended lock times out before ledger mutation; rollback releases connection for retry");
  const blocker = await pool.connect();
  try {
    await blocker.query("BEGIN");
    await blocker.query("select pg_advisory_xact_lock(1347568455, 1)");
    await assert.rejects(run(50), /Migration lock wait exceeded 50ms/);
  } finally {
    await blocker.query("ROLLBACK");
    blocker.release();
  }
  assert.deepEqual((await run()).applied, []);
  step("a failed file rolls back all its statements, preserves earlier commits, and retries once");
  await writeFile(
    join(dir, "0003_three.sql"),
    "insert into effects values (3); select * from deliberately_missing_table",
  );
  await assert.rejects(run(), /deliberately_missing_table/);
  assert.deepEqual((await pool.query("select id from effects order by id")).rows, [
    { id: 1 },
    { id: 2 },
  ]);
  assert.equal(
    (await pool.query("select count(*)::int n from _migrations where name='0003_three.sql'"))
      .rows[0].n,
    0,
  );
  await writeFile(join(dir, "0003_three.sql"), "insert into effects values (3)");
  const retries = await Promise.all([run(), run()]);
  assert.deepEqual(
    retries.flatMap((r) => r.applied),
    ["0003_three.sql"],
  );
  assert.equal((await pool.query("select count(*)::int n from effects")).rows[0].n, 3);
  step("advisory locks and lock timeouts do not remain on released pool connections");
  const checks = await Promise.all(
    Array.from({ length: 4 }, async () => {
      const client = await pool.connect();
      try {
        assert.equal((await client.query("show lock_timeout")).rows[0].lock_timeout, "0");
        assert.equal(
          (
            await client.query(
              "select count(*)::int n from pg_locks where pid=pg_backend_pid() and locktype='advisory'",
            )
          ).rows[0].n,
          0,
        );
      } finally {
        client.release();
      }
    }),
  );
  assert.equal(checks.length, 4);
  console.log(
    JSON.stringify({
      ok: true,
      backend: "PostgreSQL",
      independentConnections: 4,
      steps: steps.length,
    }),
  );
} finally {
  await pool?.end();
  try {
    await admin.query(`drop schema if exists ${schema} cascade`);
  } finally {
    await admin.end();
    await rm(dir, { recursive: true, force: true });
  }
}
