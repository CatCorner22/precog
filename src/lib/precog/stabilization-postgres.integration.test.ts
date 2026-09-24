import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Sql } from "@/lib/db";
import { deleteBusinessRow, loadActiveBusiness, saveBusinessRevision } from "./business-store";
import { takeDailyBudget } from "./llm/daily-usage";

const run = promisify(execFile);
const url = process.env.PRECOG_INTEGRATION_DATABASE_URL;
const integration = url ? describe : describe.skip;
const prefix = `integration-${randomUUID()}`;
let pool: Pool;
let temporary: string | undefined;

function clientSql(client: PoolClient): Sql {
  const tagged = (async <T>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]> => {
    let text = strings[0];
    for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1]}`;
    return (await client.query(text, values)).rows as T[];
  }) as Sql;
  tagged.query = async <T>(text: string, values: unknown[] = []) =>
    (await client.query(text, values)).rows as T[];
  return tagged;
}

async function connection<T>(work: (sql: Sql) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    return await work(clientSql(client));
  } finally {
    client.release();
  }
}

const saveInput = (revision: number | null, name = "Fixture") => ({
  userId: prefix,
  businessId: "fixture-business",
  name,
  industry: "general",
  profileJson: JSON.stringify({ businessId: "fixture-business", practiceName: name }),
  baseRevision: revision,
  activate: true,
});

integration("isolated real PostgreSQL stabilization", () => {
  beforeAll(async () => {
    const target = new URL(url!);
    if (
      process.env.PRECOG_TEST_DATABASE_CONFIRMED !== "true" ||
      !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) ||
      !target.pathname.includes("precog")
    ) {
      throw new Error("Integration tests require an explicitly confirmed, loopback-only Precog test database");
    }
    pool = new Pool({ connectionString: url, max: 12 });
    await pool.query("select 'precog_save_business(text,text,text,text,jsonb,bigint,integer,boolean)'::regprocedure");
  });

  beforeEach(async () => {
    await pool.query(
      'insert into "user" (id,name,email,"emailVerified","createdAt","updatedAt") values ($1,$1,$2,true,now(),now()) on conflict (id) do nothing',
      [prefix, `${prefix}@example.test`],
    );
  });

  afterEach(async () => {
    if (!pool) return;
    await pool.query('delete from "user" where id=$1', [prefix]);
    if (temporary) {
      await rm(temporary, { recursive: true, force: true });
      temporary = undefined;
    }
  });
  afterAll(async () => {
    await pool?.end();
  });

  it("allows only one of two separate connections to update the same revision", async () => {
    await connection((sql) => saveBusinessRevision(sql, saveInput(null)));
    const results = await Promise.all([
      connection((sql) => saveBusinessRevision(sql, saveInput(1, "Writer A"))),
      connection((sql) => saveBusinessRevision(sql, saveInput(1, "Writer B"))),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toHaveLength(1);
    const active = await connection((sql) => loadActiveBusiness(sql, prefix));
    expect(active?.revision).toBe(2);
  });

  it("keeps the business deleted when another connection submits a stale save", async () => {
    await connection((sql) => saveBusinessRevision(sql, saveInput(null)));
    await Promise.allSettled([
      connection((sql) => deleteBusinessRow(sql, prefix, "fixture-business")),
      connection((sql) => saveBusinessRevision(sql, saveInput(1))),
    ]);
    const rows = await pool.query("select id from businesses where user_id=$1", [prefix]);
    expect(rows.rowCount).toBe(0);
    expect(await connection((sql) => loadActiveBusiness(sql, prefix))).toBeNull();
    await expect(connection((sql) => saveBusinessRevision(sql, saveInput(null)))).rejects.toThrow("deleted");
  });

  it("rolls back both the business and its active pointer after an injected failure", async () => {
    const client = await pool.connect();
    try {
      await client.query(`
        create or replace function precog_integration_fail_pointer() returns trigger language plpgsql as $$
        begin
          if new.name = 'INJECTED FAILURE' then raise exception 'injected pointer failure'; end if;
          return new;
        end; $$;
        create trigger precog_integration_pointer before insert or update on business_profiles
        for each row execute function precog_integration_fail_pointer();
      `);
      await expect(saveBusinessRevision(clientSql(client), saveInput(null, "INJECTED FAILURE"))).rejects.toThrow("injected pointer failure");
      expect((await client.query("select id from businesses where user_id=$1", [prefix])).rowCount).toBe(0);
      expect((await client.query("select user_id from business_profiles where user_id=$1", [prefix])).rowCount).toBe(0);
    } finally {
      await client.query("drop trigger if exists precog_integration_pointer on business_profiles; drop function if exists precog_integration_fail_pointer();");
      client.release();
    }
  });

  it("does not spend global capacity on denied requests, including concurrent connections", async () => {
    // This job owns the explicitly confirmed disposable database.
    await pool.query("delete from llm_daily_usage; delete from llm_daily_rejections;");
    const outcomes = await Promise.all(Array.from({ length: 30 }, (_, i) =>
      connection((sql) => takeDailyBudget(sql, `${prefix}-${i % 4}`, { perUser: 3, global: 7 })),
    ));
    expect(outcomes.filter((result) => result.allowed)).toHaveLength(7);
    expect(outcomes.every((result) => result.userCalls <= 3 && result.globalCalls <= 7)).toBe(true);
    const global = await pool.query("select calls from llm_daily_usage where scope='global'");
    expect(Number(global.rows[0].calls)).toBe(7);
  });

  async function migrationFixture() {
    temporary = await mkdtemp(join(process.cwd(), ".precog-migration-test-"));
    await mkdir(join(temporary, "scripts"));
    await mkdir(join(temporary, "migrations"));
    await writeFile(join(temporary, "scripts/migrate.mjs"), await readFile("scripts/migrate.mjs", "utf8"));
    return {
      directory: join(temporary, "migrations"),
      start: () => run(process.execPath, [join(temporary!, "scripts/migrate.mjs")], {
        env: { ...process.env, DATABASE_URL: url!, DATABASE_MIGRATION_URL: url!, VERCEL_ENV: "preview", PRECOG_RUNTIME_MODE: "test" },
        timeout: 20_000,
      }),
    };
  }

  it("serializes two migration processes before they read the ledger", async () => {
    const fixture = await migrationFixture();
    const name = "9998_precog_lock_fixture.sql";
    await writeFile(join(fixture.directory, name), "select pg_sleep(0.2); create table precog_lock_fixture (id integer); insert into precog_lock_fixture values (1);");
    try {
      const outcomes = await Promise.all([fixture.start(), fixture.start()]);
      expect(outcomes.every((result) => !result.stderr)).toBe(true);
      expect((await pool.query("select count(*)::int as n from precog_lock_fixture")).rows[0].n).toBe(1);
      expect((await pool.query("select count(*)::int as n from _migrations where name=$1", [name])).rows[0].n).toBe(1);
    } finally {
      await pool.query("drop table if exists precog_lock_fixture");
      await pool.query("delete from _migrations where name=$1", [name]);
    }
  }, 30_000);

  it("rolls back a failed migration and permits a corrected retry", async () => {
    const fixture = await migrationFixture();
    const name = "9999_precog_failure_fixture.sql";
    const path = join(fixture.directory, name);
    await writeFile(path, "create table precog_failure_fixture (id integer); select 1/0;");
    try {
      await expect(fixture.start()).rejects.toThrow();
      expect((await pool.query("select to_regclass('precog_failure_fixture') as table_name")).rows[0].table_name).toBeNull();
      expect((await pool.query("select name from _migrations where name=$1", [name])).rowCount).toBe(0);
      await writeFile(path, "create table precog_failure_fixture (id integer);");
      await fixture.start();
      expect((await pool.query("select name from _migrations where name=$1", [name])).rowCount).toBe(1);
    } finally {
      await pool.query("drop table if exists precog_failure_fixture");
      await pool.query("delete from _migrations where name=$1", [name]);
    }
  }, 30_000);
});
