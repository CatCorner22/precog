/** Real multi-connection regression, confined to a disposable schema. Never uses business data. */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { takeDailyBudget } from "../src/lib/precog/llm/daily-usage.ts";

if (process.env.PRECOG_QUOTA_TEST !== "1" || !process.env.DATABASE_URL) {
  throw new Error("Set PRECOG_QUOTA_TEST=1 and DATABASE_URL to an isolated test database");
}
const schema = `quota_test_${randomBytes(8).toString("hex")}`;
const admin = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
let pool;
try {
  await admin.query(`create schema ${schema}`);
  pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 8,
    options: `-c search_path=${schema}`,
  });
  for (const file of ["0012_llm_daily_usage.sql", "0022_atomic_llm_budget.sql"]) {
    await pool.query(await readFile(new URL(`../migrations/${file}`, import.meta.url), "utf8"));
  }
  const sql = async (strings, ...values) => {
    const query = strings.reduce(
      (text, part, index) => text + (index ? `$${index}` : "") + part,
      "",
    );
    return (await pool.query(query, values)).rows;
  };
  const limits = { perUser: 2, global: 3 };
  await takeDailyBudget(sql, "a", limits);
  await takeDailyBudget(sql, "a", limits);
  const rejected = await Promise.all(
    Array.from({ length: 32 }, () => takeDailyBudget(sql, "a", limits)),
  );
  assert.ok(rejected.every((r) => !r.allowed && r.userCalls === 2 && r.globalCalls === 2));
  assert.deepEqual(await takeDailyBudget(sql, "b", limits), {
    allowed: true,
    userCalls: 1,
    globalCalls: 3,
  });

  await pool.query("truncate llm_daily_usage");
  const parallel = await Promise.all(
    Array.from({ length: 64 }, (_, i) =>
      takeDailyBudget(sql, `user-${i % 4}`, { perUser: 3, global: 7 }),
    ),
  );
  assert.equal(parallel.filter((r) => r.allowed).length, 7);
  const { rows } = await pool.query("select scope, calls from llm_daily_usage");
  assert.equal(rows.find((r) => r.scope === "global").calls, 7);
  assert.equal(
    rows.filter((r) => r.scope !== "global").reduce((n, r) => n + r.calls, 0),
    7,
  );
  assert.ok(rows.filter((r) => r.scope !== "global").every((r) => r.calls <= 3));

  await pool.query("truncate llm_daily_usage");
  await pool.query(`create function fail_user_counter() returns trigger language plpgsql as $$ begin
    if new.scope = 'user:failure' then raise exception 'test rollback'; end if; return new; end; $$;
    create trigger fail_user_counter before update on llm_daily_usage for each row execute function fail_user_counter();`);
  await assert.rejects(takeDailyBudget(sql, "failure"), /test rollback/);
  assert.equal((await pool.query("select count(*)::int as n from llm_daily_usage")).rows[0].n, 0);
  console.log(
    JSON.stringify({
      ok: true,
      connections: 8,
      parallelRequests: 64,
      admitted: 7,
      fairness: true,
      atomicRollback: true,
    }),
  );
} finally {
  await pool?.end();
  await admin.query(`drop schema if exists ${schema} cascade`);
  await admin.end();
}
