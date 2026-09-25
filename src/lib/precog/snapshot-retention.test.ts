import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Sql } from "@/lib/db";
import { openTestDb, type TestDb } from "@/test/pglite";
import { enforceSnapshotRetention } from "./snapshot-retention";

/** Same PGLite harness as share-attempts.test.ts: every migration applied for real. */

let db: TestDb;
let pg: PGlite;
let sql: Sql;

beforeAll(async () => {
  db = await openTestDb();
  pg = db.pg;
  sql = db.sql;
}, 60_000);

afterAll(() => db.close());

beforeEach(async () => {
  await pg.exec("delete from assessment_snapshots");
});

async function insert(userId: string, n: number, startMinute: number) {
  for (let i = 0; i < n; i += 1) {
    await pg.query(
      `insert into assessment_snapshots (id, user_id, title, practice_name, profile_json, model_version, corpus_version, created_at)
       values ($1, $2, 'Snapshot', 'Biz', '{}'::jsonb, 'v', 'v', timestamptz '2026-01-01 00:00:00+00' + make_interval(mins => $3))`,
      [`${userId}-${i}`, userId, startMinute + i],
    );
  }
}

describe("snapshot retention", () => {
  it("keeps the newest snapshots up to the limit and leaves other users alone", async () => {
    await insert("u1", 7, 0);
    await insert("u2", 3, 0);
    const removed = await enforceSnapshotRetention(sql, "u1", 5);
    expect(removed).toBe(2);
    const left = await sql<{ id: string }>`
      select id from assessment_snapshots where user_id = 'u1' order by created_at desc`;
    expect(left.map((r) => r.id)).toEqual(["u1-6", "u1-5", "u1-4", "u1-3", "u1-2"]);
    const other = await sql<{ n: number | string }>`
      select count(*) as n from assessment_snapshots where user_id = 'u2'`;
    expect(Number(other[0].n)).toBe(3);
  });

  it("removes nothing at or under the limit", async () => {
    await insert("u1", 5, 0);
    expect(await enforceSnapshotRetention(sql, "u1", 5)).toBe(0);
  });
});
