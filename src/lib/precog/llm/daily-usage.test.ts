import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Sql } from "@/lib/db";
import {
  createDailyUsagePurger,
  purgeOldDailyUsage,
  takeDailyBudget,
  withinDailyBudget,
} from "./daily-usage";

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
}, 60_000);

afterAll(async () => {
  await pg.close();
});
beforeEach(async () => {
  await pg.exec("delete from llm_daily_usage; delete from llm_daily_rejections;");
});

describe("daily model-call budget", () => {
  it("counts only admitted requests; one exhausted user cannot drain the global quota", async () => {
    const limits = { perUser: 2, global: 3 };
    expect((await takeDailyBudget(sql, "a", limits)).allowed).toBe(true);
    expect((await takeDailyBudget(sql, "a", limits)).allowed).toBe(true);
    for (let i = 0; i < 10; i += 1) {
      expect(await takeDailyBudget(sql, "a", limits)).toEqual({
        allowed: false,
        userCalls: 2,
        globalCalls: 2,
      });
    }
    expect(await takeDailyBudget(sql, "b", limits)).toEqual({
      allowed: true,
      userCalls: 1,
      globalCalls: 3,
    });
    expect(await takeDailyBudget(sql, "b", limits)).toEqual({
      allowed: false,
      userCalls: 1,
      globalCalls: 3,
    });
    const rejected = await sql<{ attempts: string | number }>`
      select attempts from llm_daily_rejections where scope = 'user:a'
    `;
    expect(Number(rejected[0].attempts)).toBe(10);
  });

  it("never admits more than either limit under concurrent requests", async () => {
    const outcomes = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        takeDailyBudget(sql, `user-${i % 3}`, { perUser: 2, global: 5 }),
      ),
    );
    expect(outcomes.filter((r) => r.allowed)).toHaveLength(5);
    expect(outcomes.every((r) => r.userCalls <= 2 && r.globalCalls <= 5)).toBe(true);
  });

  it("does not let earlier-day usage consume today's budget", async () => {
    await pg.exec(
      "insert into llm_daily_usage (scope, day, calls) values ('global', (now() at time zone 'UTC')::date - 1, 999)",
    );
    expect(await takeDailyBudget(sql, "a", { perUser: 1, global: 1 })).toEqual({
      allowed: true,
      userCalls: 1,
      globalCalls: 1,
    });
  });

  it("purges old usage and rejection rows without removing today's", async () => {
    await pg.exec(
      "insert into llm_daily_usage (scope, day, calls) values ('user:old', current_date - 40, 9); insert into llm_daily_rejections (scope, day, attempts) values ('user:old', current_date - 40, 9);",
    );
    await takeDailyBudget(sql, "today");
    await purgeOldDailyUsage(sql);
    const rows = await sql<{ scope: string }>`select scope from llm_daily_usage order by scope`;
    expect(rows.map((r) => r.scope)).toEqual(["global", "user:today"]);
    expect(await sql`select * from llm_daily_rejections`).toEqual([]);
  });
});

describe("withinDailyBudget", () => {
  const noPurge = async () => false;
  it("allows under the ceilings and refuses over them", async () => {
    const limits = { perUser: 1, global: 10 };
    expect(await withinDailyBudget(async () => sql, "a", limits, noPurge)).toBe(true);
    const quiet = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(await withinDailyBudget(async () => sql, "a", limits, noPurge)).toBe(false);
    quiet.mockRestore();
  });
  it("fails closed on a query failure", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const broken = (async () => {
      throw new Error("connection terminated");
    }) as unknown as Sql;
    expect(await withinDailyBudget(async () => broken, "a", undefined, noPurge)).toBe(false);
    quiet.mockRestore();
  });
  it("fails closed when no connection can be obtained", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(
      await withinDailyBudget(async () => {
        throw new Error("getaddrinfo ENOTFOUND");
      }, "a"),
    ).toBe(false);
    quiet.mockRestore();
  });
  it("purges through the normal admission path", async () => {
    await pg.exec(
      "insert into llm_daily_usage (scope, day, calls) values ('user:old', current_date - 40, 9)",
    );
    expect(await withinDailyBudget(async () => sql, "a", undefined, createDailyUsagePurger())).toBe(true);
    const rows = await sql<{ scope: string }>`select scope from llm_daily_usage order by scope`;
    expect(rows.map((r) => r.scope)).toEqual(["global", "user:a"]);
  });
});

describe("createDailyUsagePurger", () => {
  it("runs once per interval and retries failed housekeeping", async () => {
    const purge = createDailyUsagePurger(1_000);
    expect(await purge(sql, 10_000)).toBe(true);
    expect(await purge(sql, 10_500)).toBe(false);
    expect(await purge(sql, 11_000)).toBe(true);
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const broken = (async () => {
      throw new Error("down");
    }) as unknown as Sql;
    expect(await purge(broken, 20_000)).toBe(false);
    quiet.mockRestore();
    expect(await purge(sql, 20_001)).toBe(true);
  });
});
