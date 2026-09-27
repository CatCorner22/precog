import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MIGRATIONS_DIR, migrationFiles, openTestDb, type TestDb } from "./pglite";

let db: TestDb;

beforeAll(async () => {
  db = await openTestDb();
}, 60_000);

afterAll(() => db?.close());

describe("test database", () => {
  it("returns the shapes production returns: bigint as number, date as a day string", async () => {
    const rows = await db.sql<{ n: unknown; d: unknown; i: unknown }>`
      select 1::bigint as n, date '2026-09-26' as d, interval '1 day' as i
    `;
    expect(rows[0]).toEqual({ n: 1, d: "2026-09-26", i: "1 day" });
  });

  it("finds migrations/ next to the source, whatever the working directory", async () => {
    expect(MIGRATIONS_DIR).toMatch(/[\\/]migrations[\\/]$/);
    const files = await migrationFiles();
    expect(files[0]).toBe("0001_auth.sql");
  });
});
