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

describe("withinDailyBudget", () => {
  const noPurge = async () => false;

  it("allows calls under the ceilings and refuses past them", async () => {
    const limits = { perUser: 1, global: 10 };
    expect(await withinDailyBudget(async () => sql, "a", limits, noPurge)).toBe(true);
    const quiet = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(await withinDailyBudget(async () => sql, "a", limits, noPurge)).toBe(false);
    quiet.mockRestore();
  });

  it("refuses the call when the usage table cannot be written", async () => {
    // Regression: a database error used to log and allow the call.
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const broken = (async () => {
      throw new Error("connection terminated");
    }) as unknown as Sql;
    broken.query = async () => {
      throw new Error("connection terminated");
    };
    expect(await withinDailyBudget(async () => broken, "a", undefined, noPurge)).toBe(false);
    quiet.mockRestore();
  });

  it("refuses the call when the database cannot be reached at all", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const unreachable = async (): Promise<Sql> => {
      throw new Error("getaddrinfo ENOTFOUND");
    };
    expect(await withinDailyBudget(unreachable, "a", undefined, noPurge)).toBe(false);
    quiet.mockRestore();
  });

  it("purges old rows on the way through", async () => {
    await pg.exec(
      "insert into llm_daily_usage (scope, day, calls) values ('user:old', current_date - 40, 9)",
    );
    const purge = createDailyUsagePurger();
    expect(await withinDailyBudget(async () => sql, "a", undefined, purge)).toBe(true);
    const rows = await sql<{ scope: string }>`select scope from llm_daily_usage order by scope`;
    expect(rows.map((r) => r.scope)).toEqual(["global", "user:a"]);
  });
});

describe("createDailyUsagePurger", () => {
  it("purges at most once per interval and retries after a failure", async () => {
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
