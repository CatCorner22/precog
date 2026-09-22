import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Sql } from "@/lib/db";
import { purgeOldDailyUsage, takeDailyBudget } from "./daily-usage";

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
  await pg.exec("delete from llm_daily_usage");
});

describe("daily model-call budget", () => {
  it("counts per user and globally and denies past either ceiling", async () => {
    const limits = { perUser: 2, global: 3 };
    expect((await takeDailyBudget(sql, "a", limits)).allowed).toBe(true);
    expect((await takeDailyBudget(sql, "a", limits)).allowed).toBe(true);
    const third = await takeDailyBudget(sql, "a", limits);
    expect(third.allowed).toBe(false);
    expect(third.userCalls).toBe(3);
    expect(third.globalCalls).toBe(3);
    // A different user is under their own ceiling but the app is over its total.
    const other = await takeDailyBudget(sql, "b", limits);
    expect(other.userCalls).toBe(1);
    expect(other.globalCalls).toBe(4);
    expect(other.allowed).toBe(false);
  });

  it("purges rows older than the retention window and keeps today's", async () => {
    await pg.exec(
      "insert into llm_daily_usage (scope, day, calls) values ('user:old', current_date - 40, 9)",
    );
    await takeDailyBudget(sql, "today");
    await purgeOldDailyUsage(sql);
    const rows = await sql<{ scope: string }>`select scope from llm_daily_usage order by scope`;
    expect(rows.map((r) => r.scope)).toEqual(["global", "user:today"]);
  });
});
