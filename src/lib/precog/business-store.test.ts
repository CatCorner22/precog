import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Sql } from "@/lib/db";
import { saveBusinessRevision } from "./business-store";

/**
 * Runs against an embedded Postgres with every file in migrations/ applied, so
 * the test exercises the real `businesses` schema (composite key, revision
 * column) rather than a hand-written stand-in.
 */

const MIGRATIONS_DIR = join(process.cwd(), "migrations");

let pg: PGlite;
let sql: Sql;

/** Same placeholder rewriting as src/lib/db.ts `toSql`, without importing the app's db bootstrap. */
function pgliteSql(db: PGlite): Sql {
  const run = async <T>(text: string, params: unknown[]) =>
    (await db.query<T>(text, params)).rows;
  const tagged = (async <T = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]> => {
    let text = strings[0];
    for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1]}`;
    return run<T>(text, values);
  }) as unknown as Sql;
  tagged.query = <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
    run<T>(text, params);
  return tagged;
}

async function applyMigrations(db: PGlite): Promise<void> {
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
  for (const name of files) {
    await db.exec(await readFile(join(MIGRATIONS_DIR, name), "utf8"));
  }
}

async function seedUser(id: string): Promise<void> {
  await pg.query(
    `insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
     values ($1, $1, $2, true, now(), now())`,
    [id, `${id}@example.test`],
  );
}

function input(
  userId: string,
  businessId: string,
  baseRevision: number | null,
  name = "Business",
) {
  return {
    userId,
    businessId,
    name,
    industry: "dental",
    profileJson: JSON.stringify({ practiceName: name, businessId }),
    baseRevision,
  };
}

async function revisionOf(userId: string, businessId: string): Promise<number | null> {
  const rows = await sql<{ revision: number | string }>`
    select revision from businesses where user_id = ${userId} and id = ${businessId}
  `;
  return rows[0] ? Number(rows[0].revision) : null;
}

beforeAll(async () => {
  pg = new PGlite();
  await pg.waitReady;
  await applyMigrations(pg);
  sql = pgliteSql(pg);
}, 60_000);

afterAll(async () => {
  await pg.close();
});

beforeEach(async () => {
  await pg.exec(`delete from businesses; delete from "user";`);
  await seedUser("user-a");
  await seedUser("user-b");
});

describe("businesses schema", () => {
  it("is keyed by (user_id, id), not id alone", async () => {
    const rows = await pg.query<{ column_name: string }>(
      `select kcu.column_name
       from information_schema.table_constraints tc
       join information_schema.key_column_usage kcu
         on kcu.constraint_name = tc.constraint_name
       where tc.table_name = 'businesses' and tc.constraint_type = 'PRIMARY KEY'
       order by kcu.ordinal_position`,
    );
    expect(rows.rows.map((r) => r.column_name)).toEqual(["user_id", "id"]);
  });
});

describe("saveBusinessRevision — first save", () => {
  it("creates the row at revision 1 when the client has never loaded it", async () => {
    const result = await saveBusinessRevision(sql, input("user-a", "biz_1", null));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.revision).toBe(1);
    expect(await revisionOf("user-a", "biz_1")).toBe(1);
  });

  it("two users can each own a business with the same client-generated id", async () => {
    // Regression: under the old global primary key the second save matched
    // nothing and the server threw "Unable to save business profile".
    const a = await saveBusinessRevision(sql, input("user-a", "biz_default", null, "A Dental"));
    const b = await saveBusinessRevision(sql, input("user-b", "biz_default", null, "B Dental"));
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);

    const rows = await sql<{ user_id: string; name: string; revision: number | string }>`
      select user_id, name, revision from businesses where id = 'biz_default' order by user_id
    `;
    expect(rows.map((r) => [r.user_id, r.name, Number(r.revision)])).toEqual([
      ["user-a", "A Dental", 1],
      ["user-b", "B Dental", 1],
    ]);
  });

  it("one user's save never touches another user's row with the same id", async () => {
    await saveBusinessRevision(sql, input("user-a", "shared-id", null, "A"));
    await saveBusinessRevision(sql, input("user-a", "shared-id", 1, "A v2"));
    await saveBusinessRevision(sql, input("user-b", "shared-id", null, "B"));

    const rows = await sql<{ user_id: string; name: string; revision: number | string }>`
      select user_id, name, revision from businesses where id = 'shared-id' order by user_id
    `;
    expect(rows.map((r) => [r.user_id, r.name, Number(r.revision)])).toEqual([
      ["user-a", "A v2", 2],
      ["user-b", "B", 1],
    ]);
  });
});

describe("saveBusinessRevision — compare-and-swap", () => {
  it("increments the revision when the base matches", async () => {
    await saveBusinessRevision(sql, input("user-a", "biz_1", null));
    const second = await saveBusinessRevision(sql, input("user-a", "biz_1", 1, "v2"));
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.revision).toBe(2);
    expect(await revisionOf("user-a", "biz_1")).toBe(2);
  });

  it("rejects a save whose base revision is behind, and returns the current row", async () => {
    await saveBusinessRevision(sql, input("user-a", "biz_1", null, "v1"));
    await saveBusinessRevision(sql, input("user-a", "biz_1", 1, "v2"));

    const stale = await saveBusinessRevision<{ practiceName: string }>(
      sql,
      input("user-a", "biz_1", 1, "v2-from-other-tab"),
    );
    expect(stale.ok).toBe(false);
    if (!stale.ok) {
      expect(stale.existing.revision).toBe(2);
      expect(stale.existing.name).toBe("v2");
      expect(stale.existing.profile.practiceName).toBe("v2");
    }
    // The stale writer changed nothing.
    expect(await revisionOf("user-a", "biz_1")).toBe(2);
    const rows = await sql<{ name: string }>`
      select name from businesses where user_id = 'user-a' and id = 'biz_1'
    `;
    expect(rows[0].name).toBe("v2");
  });

  it("rejects a save from a client that never loaded a business that already exists", async () => {
    await saveBusinessRevision(sql, input("user-a", "biz_1", null, "cloud"));
    const fresh = await saveBusinessRevision(sql, input("user-a", "biz_1", null, "local-only"));
    expect(fresh.ok).toBe(false);
    if (!fresh.ok) expect(fresh.existing.name).toBe("cloud");
    expect(await revisionOf("user-a", "biz_1")).toBe(1);
  });

  it("lets exactly one of two racing writers on the same base revision win", async () => {
    // Regression: the previous read-then-write implementation let both pass
    // the stale check, so the second silently overwrote the first.
    await saveBusinessRevision(sql, input("user-a", "biz_1", null, "v1"));

    const [x, y] = await Promise.all([
      saveBusinessRevision(sql, input("user-a", "biz_1", 1, "writer-x")),
      saveBusinessRevision(sql, input("user-a", "biz_1", 1, "writer-y")),
    ]);
    const winners = [x, y].filter((r) => r.ok);
    const losers = [x, y].filter((r) => !r.ok);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(await revisionOf("user-a", "biz_1")).toBe(2);

    const rows = await sql<{ name: string }>`
      select name from businesses where user_id = 'user-a' and id = 'biz_1'
    `;
    const winnerName = x.ok ? "writer-x" : "writer-y";
    expect(rows[0].name).toBe(winnerName);
    if (!losers[0].ok) expect(losers[0].existing.name).toBe(winnerName);
  });

  it("throws only when the row vanished between the write and the re-read", async () => {
    // A base revision for a row that no longer exists is not a conflict — the
    // insert path creates it fresh (matches the previous `isStaleSave(null, N)` behaviour).
    const result = await saveBusinessRevision(sql, input("user-a", "gone", 7, "recreated"));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.revision).toBe(1);
  });
});
