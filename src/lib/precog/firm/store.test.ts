import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Sql } from "@/lib/db";
import {
  deleteClientAudit,
  insertReviewEvent,
  listClientEngagements,
  listReviewEvents,
  saveFirm,
} from "./store";

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
  await pg.exec(
    'delete from review_events; delete from engagement_marks; delete from firms; delete from businesses; delete from "user";',
  );
  for (const id of ["ua", "ub"]) {
    await pg.query(
      `insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
       values ($1, $1, $2, true, now(), now())`,
      [id, `${id}@example.test`],
    );
    await pg.query(
      `insert into businesses (id, user_id, name, industry, profile, revision)
       values ('biz_1', $1, $2, 'general', '{}'::jsonb, 1)`,
      [id, id === "ua" ? "Client A" : "Client B"],
    );
  }
});

describe("firm client isolation", () => {
  it("lists only the signed-in account's clients and review log", async () => {
    await saveFirm(sql, "ua", "North Advisors", "assessment");
    await insertReviewEvent(sql, "ua", {
      businessId: "biz_1",
      period: "2026-09",
      itemKey: "bank_statement",
      ownerName: "Ada",
      dueOn: "2026-10-10",
      result: "done",
      notes: "Statement opened",
    });
    await insertReviewEvent(sql, "ub", {
      businessId: "biz_1",
      period: "2026-09",
      itemKey: "new_vendors",
      ownerName: "Bea",
      dueOn: "2026-10-10",
      result: "exception",
      notes: "Other firm",
    });
    const clients = await listClientEngagements(sql, "ua");
    expect(clients.map((c) => c.name)).toEqual(["Client A"]);
    expect(clients[0].lastReviewAt).toBeTruthy();
    const events = await listReviewEvents(sql, "ua", "biz_1");
    expect(events.map((e) => e.notes)).toEqual(["Statement opened"]);
    await deleteClientAudit(sql, "ua", "biz_1");
    expect(await listReviewEvents(sql, "ua", "biz_1")).toEqual([]);
    expect((await listReviewEvents(sql, "ub", "biz_1")).map((e) => e.notes)).toEqual([
      "Other firm",
    ]);
  });
});
