import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Sql } from "@/lib/db";
import { openTestDb, type TestDb } from "@/test/pglite";
import {
  createDailyUsagePurger,
  purgeOldDailyUsage,
  takeDailyBudget,
  withinDailyBudget,
} from "./daily-usage";

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
