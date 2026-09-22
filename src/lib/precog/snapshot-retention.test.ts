import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Sql } from "@/lib/db";
import { enforceSnapshotRetention } from "./snapshot-retention";

/** Same PGLite harness as share-attempts.test.ts: every migration applied for real. */
const MIGRATIONS_DIR = join(process.cwd(), "migrations");

let pg: PGlite;
let sql: Sql;

function pgliteSql(db: PGlite): Sql {
  const run = async <T>(text: string, params: unknown[]) => (await db.query<T>(text, params)).rows;
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

beforeAll(async () => {
  pg = new PGlite();
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
  for (const name of files) await pg.exec(await readFile(join(MIGRATIONS_DIR, name), "utf8"));
  sql = pgliteSql(pg);
});

afterAll(async () => {
  await pg.close();
});

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
