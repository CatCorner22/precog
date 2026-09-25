import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error -- plain ESM script shared with the deploy-time migrator.
import { runMigrations } from "../../scripts/migrate-core.mjs";

const MIGRATIONS_DIR = join(process.cwd(), "migrations");

/**
 * The deploy migrator's ledger against an embedded Postgres: every file
 * applies once, a second run applies nothing, and a ledger written before
 * the files were renumbered is moved rather than re-applied.
 */
describe("migration ledger", () => {
  let pg: PGlite;
  afterEach(async () => {
    await pg?.close();
  });

  async function migrator() {
    pg = new PGlite();
    await pg.waitReady;
    return () =>
      runMigrations({
        migrationsDir: MIGRATIONS_DIR,
        exec: async (sql: string, params?: unknown[]) =>
          params ? (await pg.query(sql, params)).rows : ((await pg.exec(sql)).at(-1)?.rows ?? []),
      }) as Promise<{ applied: string[]; moved: [string, string][] }>;
  }

  it("applies every file once and is idempotent", async () => {
    const run = await migrator();
    const first = await run();
    expect(first.applied.length).toBeGreaterThan(10);
    expect(first.applied[0]).toBe("0001_auth.sql");
    const second = await run();
    expect(second.applied).toEqual([]);
    const ledger = await pg.query<{ name: string }>("select name from _migrations order by name");
    expect(ledger.rows.map((r) => r.name)).toEqual(first.applied);
  });

  it("moves ledger rows that carry a renumbered file's old name instead of re-applying", async () => {
    const run = await migrator();
    // A database migrated before the renumbering: apply everything under the
    // current names, then rewrite the ledger to the old names.
    const first = await run();
    const renamed = (await import("../../migrations/renamed.json")).default as Record<
      string,
      string
    >;
    for (const [current, previous] of Object.entries(renamed)) {
      if (current.startsWith("_")) continue;
      await pg.query("update _migrations set name = $1 where name = $2", [previous, current]);
    }
    const second = await run();
    expect(second.applied).toEqual([]);
    expect(second.moved.length).toBe(Object.keys(renamed).filter((k) => !k.startsWith("_")).length);
    const ledger = await pg.query<{ name: string }>("select name from _migrations order by name");
    expect(ledger.rows.map((r) => r.name)).toEqual(first.applied);
  });
});
