/**
 * The deploy migrator (./migrate-core.mjs) against an embedded Postgres: the
 * real migrations apply once and a second run applies nothing, a ledger
 * written before the files were renumbered is moved rather than re-applied,
 * every ledger access happens under the advisory lock, and a failed file,
 * ledger write or rename rolls back cleanly and retries safely.
 *
 * One PGlite per file: booting it is the slow part (2 s idle, 7 s with four
 * test files booting at once), so tests share it and reset the schema.
 */
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "./migrate-core.mjs";

const MIGRATIONS_DIR = fileURLToPath(new URL("../migrations", import.meta.url));

let pg;
const inflight = [];
const cleanups = [];

beforeAll(async () => {
  pg = new PGlite();
  await pg.waitReady;
});
afterAll(() => pg.close());
beforeEach(() => pg.exec("drop schema public cascade; create schema public"));
afterEach(async () => {
  // A test that timed out leaves its migrator running. Let it finish here, so
  // it cannot write into the next test's freshly reset schema.
  await Promise.allSettled(inflight.splice(0));
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

describe("migration ledger", () => {
  it("applies every file once and is idempotent", async () => {
    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
    const first = await migrate(MIGRATIONS_DIR);
    expect(first.applied).toEqual(files);
    const second = await migrate(MIGRATIONS_DIR);
    expect(second.applied).toEqual([]);
    expect(await ledger()).toEqual(files);
  });

  it("moves ledger rows that carry a renumbered file's old name instead of re-applying", async () => {
    // A database migrated before the renumbering: apply everything under the
    // current names, then rewrite the ledger to the old names.
    const first = await migrate(MIGRATIONS_DIR);
    const renamed = JSON.parse(await readFile(join(MIGRATIONS_DIR, "renamed.json"), "utf8"));
    const renames = Object.entries(renamed).filter(([current]) => !current.startsWith("_"));
    for (const [current, previous] of renames) {
      await pg.query("update _migrations set name = $1 where name = $2", [previous, current]);
    }
    const second = await migrate(MIGRATIONS_DIR);
    expect(second.applied).toEqual([]);
    expect(second.moved).toHaveLength(renames.length);
    expect(await ledger()).toEqual(first.applied);
  });
});

describe("migration safety", () => {
  it("locks before every ledger access and rechecks each file inside its transaction", async () => {
    const dir = await directory({ "0001_one.sql": "create table example(id integer)" });
    const statements = [];
    await migrate(dir, async (sql, params) => {
      statements.push(sql);
      return exec(sql, params);
    });
    // Replay the log one transaction at a time: each must take the lock before
    // it touches the ledger, and the file's SQL must follow a ledger read in
    // the same transaction (the recheck that stops a second runner applying it
    // again).
    let locked = false;
    let rechecked = false;
    for (const sql of statements) {
      if (sql === "BEGIN") locked = rechecked = false;
      if (sql.includes("pg_advisory_xact_lock")) locked = true;
      if (sql.includes("_migrations")) expect(locked).toBe(true);
      if (/^SELECT .* FROM _migrations/.test(sql)) rechecked = true;
      if (sql.includes("create table example")) expect(locked && rechecked).toBe(true);
      if (sql === "COMMIT" || sql === "ROLLBACK") locked = rechecked = false;
    }
    expect(statements).toContain("create table example(id integer)");
  });

  it("rolls back a broken file but keeps earlier committed files; retry skips earlier work", async () => {
    const dir = await directory({
      "0001_one.sql": "create table one(id integer primary key); insert into one values (1)",
      "0002_two.sql": "create table two(id integer); insert into nonexistent values (1)",
    });
    await expect(migrate(dir)).rejects.toThrow();
    expect(await exec("select * from one")).toEqual([{ id: 1 }]);
    expect(await exec("select to_regclass('two') as name")).toEqual([{ name: null }]);
    expect(await ledger()).toEqual(["0001_one.sql"]);
    await writeFile(join(dir, "0002_two.sql"), "create table two(id integer)");
    expect((await migrate(dir)).applied).toEqual(["0002_two.sql"]);
    expect((await migrate(dir)).applied).toEqual([]);
  });

  it("rolls back file changes when ledger insertion fails", async () => {
    const dir = await directory({ "0001_one.sql": "create table uncommitted(id integer)" });
    const faulty = async (sql, params) => {
      if (sql.startsWith("INSERT INTO _migrations")) throw new Error("injected ledger failure");
      return exec(sql, params);
    };
    await expect(migrate(dir, faulty)).rejects.toThrow("injected ledger failure");
    expect(await exec("select to_regclass('uncommitted') as name")).toEqual([{ name: null }]);
    expect(await ledger()).toEqual([]);
    expect((await migrate(dir)).applied).toEqual(["0001_one.sql"]);
  });

  it("rolls back renames together and retries safely", async () => {
    const dir = await directory({
      "0001_one.sql": "select 1",
      "0002_two.sql": "select 2",
      "renamed.json": JSON.stringify({
        "0001_one.sql": "0011_old.sql",
        "0002_two.sql": "0012_old.sql",
      }),
    });
    await exec(
      "create table _migrations(name text primary key); insert into _migrations values ('0011_old.sql'), ('0012_old.sql')",
    );
    const faulty = async (sql, params) => {
      if (sql.startsWith("UPDATE _migrations") && params?.[0] === "0002_two.sql")
        throw new Error("injected rename failure");
      return exec(sql, params);
    };
    await expect(migrate(dir, faulty)).rejects.toThrow("injected rename failure");
    expect(await ledger()).toEqual(["0011_old.sql", "0012_old.sql"]);
    expect(await migrate(dir)).toMatchObject({
      applied: [],
      moved: [
        ["0011_old.sql", "0001_one.sql"],
        ["0012_old.sql", "0002_two.sql"],
      ],
    });
  });

  it.each([
    ["malformed JSON", "{bad"],
    ["array", "[]"],
    ["null", "null"],
    ["missing current file", '{"0002_missing.sql":"0001_old.sql"}'],
    ["nonstring previous name", '{"0001_one.sql":12}'],
  ])("rejects %s rename metadata before database writes", async (_label, manifest) => {
    const dir = await directory({ "0001_one.sql": "select 1", "renamed.json": manifest });
    const calls = [];
    await expect(migrate(dir, recorder(calls))).rejects.toThrow();
    expect(calls).toEqual([]);
  });

  it.each([0, -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, 300001])(
    "refuses unbounded or invalid lock timeout %s",
    async (lockTimeoutMs) => {
      await expect(
        runMigrations({ migrationsDir: "unused", exec: async () => [], lockTimeoutMs }),
      ).rejects.toThrow("Migration lock timeout");
    },
  );

  it("rejects duplicate prefixes before touching the ledger", async () => {
    const dir = await directory({ "0001_one.sql": "select 1", "0001_two.sql": "select 2" });
    const calls = [];
    await expect(migrate(dir, recorder(calls))).rejects.toThrow("two migrations share");
    expect(calls).toEqual([]);
  });

  it("adds an actionable lock-timeout message, rolls back, and preserves its cause", async () => {
    const dir = await directory({ "0001_one.sql": "select 1" });
    const timeout = Object.assign(new Error("lock timeout"), { code: "55P03" });
    const statements = [];
    const locked = async (sql) => {
      statements.push(sql);
      if (sql.includes("pg_advisory_xact_lock")) throw timeout;
      return [];
    };
    await expect(
      runMigrations({ migrationsDir: dir, exec: locked, lockTimeoutMs: 25 }),
    ).rejects.toMatchObject({
      message: expect.stringContaining("Migration lock wait exceeded 25ms"),
      cause: timeout,
    });
    expect(statements.at(-1)).toBe("ROLLBACK");
    expect(statements.some((s) => s.includes("_migrations"))).toBe(false);
  });
});

/** Runs the migrator over `dir` on the shared database, tracked for afterEach. */
function migrate(dir, run = exec) {
  const result = runMigrations({ migrationsDir: dir, exec: run });
  inflight.push(result);
  return result;
}

/** The single-connection `exec` the migrator expects, over the shared PGlite. */
async function exec(sql, params) {
  return params ? (await pg.query(sql, params)).rows : ((await pg.exec(sql)).at(-1)?.rows ?? []);
}

/** An `exec` that only records what it was asked to run. */
function recorder(calls) {
  return async (sql) => {
    calls.push(sql);
    return [];
  };
}

async function ledger() {
  return (await exec("select name from _migrations order by name")).map((r) => r.name);
}

async function directory(files) {
  const dir = await mkdtemp(join(tmpdir(), "precog-migration-test-"));
  cleanups.push(() => rm(dir, { recursive: true, force: true }));
  for (const [name, source] of Object.entries(files)) await writeFile(join(dir, name), source);
  return dir;
}
