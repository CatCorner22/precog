import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error -- shared plain ESM deploy script, tested against the real runner.
import { runMigrations } from "../../scripts/migrate-core.mjs";

type Exec = (sql: string, params?: unknown[]) => Promise<unknown[]>;
const cleanups: Array<() => Promise<unknown>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});
async function directory(files: Record<string, string>) {
  const dir = await mkdtemp(join(tmpdir(), "precog-migration-test-"));
  cleanups.push(() => rm(dir, { recursive: true, force: true }));
  for (const [name, source] of Object.entries(files)) await writeFile(join(dir, name), source);
  return dir;
}
async function database() {
  const pg = new PGlite();
  await pg.waitReady;
  cleanups.push(() => pg.close());
  const exec: Exec = async (sql, params) =>
    params ? (await pg.query(sql, params)).rows : ((await pg.exec(sql)).at(-1)?.rows ?? []);
  return { pg, exec };
}

describe("migration safety", () => {
  it("locks before every ledger access and rechecks each file inside its transaction", async () => {
    const dir = await directory({ "0001_one.sql": "create table example(id integer)" });
    const { exec } = await database();
    const statements: string[] = [];
    await runMigrations({
      migrationsDir: dir,
      exec: async (sql: string, params?: unknown[]) => {
        statements.push(sql);
        return exec(sql, params);
      },
    });
    let locked = false;
    for (const sql of statements) {
      if (sql === "BEGIN") locked = false;
      if (sql.includes("pg_advisory_xact_lock")) locked = true;
      if (sql.includes("_migrations") || sql.includes("create table example"))
        expect(locked).toBe(true);
      if (sql === "COMMIT" || sql === "ROLLBACK") locked = false;
    }
    expect(statements.filter((s) => s.includes("pg_advisory_xact_lock"))).toHaveLength(2);
    expect(statements).toContain("SELECT name FROM _migrations WHERE name = $1");
  });

  it("rolls back a broken file but keeps earlier committed files; retry skips earlier work", async () => {
    const dir = await directory({
      "0001_one.sql": "create table one(id integer primary key); insert into one values (1)",
      "0002_two.sql": "create table two(id integer); insert into nonexistent values (1)",
    });
    const { exec } = await database();
    await expect(runMigrations({ migrationsDir: dir, exec })).rejects.toThrow();
    expect(await exec("select * from one")).toEqual([{ id: 1 }]);
    expect(await exec("select to_regclass('two') as name")).toEqual([{ name: null }]);
    expect(await exec("select name from _migrations")).toEqual([{ name: "0001_one.sql" }]);
    await writeFile(join(dir, "0002_two.sql"), "create table two(id integer)");
    const retried = await runMigrations({ migrationsDir: dir, exec });
    expect(retried.applied).toEqual(["0002_two.sql"]);
    expect((await runMigrations({ migrationsDir: dir, exec })).applied).toEqual([]);
  });

  it("rolls back file changes when ledger insertion fails", async () => {
    const dir = await directory({ "0001_one.sql": "create table uncommitted(id integer)" });
    const { exec } = await database();
    const faulty: Exec = async (sql, params) => {
      if (sql.startsWith("INSERT INTO _migrations")) throw new Error("injected ledger failure");
      return exec(sql, params);
    };
    await expect(runMigrations({ migrationsDir: dir, exec: faulty })).rejects.toThrow(
      "injected ledger failure",
    );
    expect(await exec("select to_regclass('uncommitted') as name")).toEqual([{ name: null }]);
    expect(await exec("select * from _migrations")).toEqual([]);
    expect((await runMigrations({ migrationsDir: dir, exec })).applied).toEqual(["0001_one.sql"]);
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
    const { exec } = await database();
    await exec(
      "create table _migrations(name text primary key); insert into _migrations values ('0011_old.sql'), ('0012_old.sql')",
    );
    const faulty: Exec = async (sql, params) => {
      if (sql.startsWith("UPDATE _migrations") && params?.[0] === "0002_two.sql")
        throw new Error("injected rename failure");
      return exec(sql, params);
    };
    await expect(runMigrations({ migrationsDir: dir, exec: faulty })).rejects.toThrow(
      "injected rename failure",
    );
    expect(await exec("select name from _migrations order by name")).toEqual([
      { name: "0011_old.sql" },
      { name: "0012_old.sql" },
    ]);
    expect(await runMigrations({ migrationsDir: dir, exec })).toMatchObject({
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
    let called = false;
    await expect(
      runMigrations({
        migrationsDir: dir,
        exec: async () => {
          called = true;
          return [];
        },
      }),
    ).rejects.toThrow();
    expect(called).toBe(false);
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
    let called = false;
    await expect(
      runMigrations({
        migrationsDir: dir,
        exec: async () => {
          called = true;
          return [];
        },
      }),
    ).rejects.toThrow("two migrations share");
    expect(called).toBe(false);
  });

  it("adds an actionable lock-timeout message, rolls back, and preserves its cause", async () => {
    const dir = await directory({ "0001_one.sql": "select 1" });
    const timeout = Object.assign(new Error("lock timeout"), { code: "55P03" });
    const statements: string[] = [];
    const exec: Exec = async (sql) => {
      statements.push(sql);
      if (sql.includes("pg_advisory_xact_lock")) throw timeout;
      return [];
    };
    await expect(
      runMigrations({ migrationsDir: dir, exec, lockTimeoutMs: 25 }),
    ).rejects.toMatchObject({
      message: expect.stringContaining("Migration lock wait exceeded 25ms"),
      cause: timeout,
    });
    expect(statements.at(-1)).toBe("ROLLBACK");
    expect(statements.some((s) => s.includes("_migrations"))).toBe(false);
  });
});
