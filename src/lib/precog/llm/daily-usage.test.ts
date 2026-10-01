import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Sql } from "@/lib/db";
import { openTestDb, type TestDb } from "@/test/pglite";
import {
  checkDailyBudget,
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
  it("reserves capacity only for admitted calls and keeps it available to other users", async () => {
    const limits = { perUser: 2, global: 3 };
    expect(await takeDailyBudget(sql, "a", limits)).toEqual({
      allowed: true,
      userCalls: 1,
      globalCalls: 1,
    });
    expect(await takeDailyBudget(sql, "a", limits)).toEqual({
      allowed: true,
      userCalls: 2,
      globalCalls: 2,
    });
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
  });

  it("does not oversubscribe when requests arrive together", async () => {
    const results = await Promise.all(
      Array.from({ length: 30 }, (_, i) =>
        takeDailyBudget(sql, `user-${i % 3}`, { perUser: 3, global: 7 }),
      ),
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(7);
    const rows = await sql<{
      scope: string;
      calls: number;
    }>`select scope, calls from llm_daily_usage`;
    expect(rows.find((r) => r.scope === "global")?.calls).toBe(7);
    expect(rows.filter((r) => r.scope !== "global").reduce((n, r) => n + r.calls, 0)).toBe(7);
    expect(rows.filter((r) => r.scope !== "global").every((r) => r.calls <= 3)).toBe(true);
  });

  it("uses a separate budget for today's date", async () => {
    await pg.exec(
      "insert into llm_daily_usage values ('global', current_date - 1, 999), ('user:a', current_date - 1, 999)",
    );
    expect(await takeDailyBudget(sql, "a", { perUser: 1, global: 1 })).toEqual({
      allowed: true,
      userCalls: 1,
      globalCalls: 1,
    });
  });

  it("rejects invalid limits or identity without admitting a call", async () => {
    await expect(takeDailyBudget(sql, "", { perUser: 1, global: 1 })).rejects.toThrow();
    await expect(takeDailyBudget(sql, "a", { perUser: 0, global: 1 })).rejects.toThrow();
    expect(await sql`select * from llm_daily_usage`).toEqual([]);
  });

  it("rolls back the whole reservation if either counter update fails", async () => {
    await pg.exec(`
      create function reject_quota_update() returns trigger language plpgsql as $$
      begin
        if new.scope = 'user:a' then raise exception 'injected counter failure'; end if;
        return new;
      end; $$;
      create trigger reject_quota_update before update on llm_daily_usage
        for each row execute function reject_quota_update();
    `);
    try {
      await expect(takeDailyBudget(sql, "a")).rejects.toThrow("injected counter failure");
      expect(await sql`select * from llm_daily_usage`).toEqual([]);
    } finally {
      await pg.exec(
        "drop trigger reject_quota_update on llm_daily_usage; drop function reject_quota_update();",
      );
    }
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

  it("tells a spent budget apart from one that cannot be read", async () => {
    const limits = { perUser: 1, global: 10 };
    expect(await checkDailyBudget(async () => sql, "b", limits, noPurge)).toBe("allowed");
    const quiet = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(await checkDailyBudget(async () => sql, "b", limits, noPurge)).toBe("spent");
    quiet.mockRestore();
    const quietError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const unreachable = async (): Promise<Sql> => {
      throw new Error("getaddrinfo ENOTFOUND");
    };
    expect(await checkDailyBudget(unreachable, "b", limits, noPurge)).toBe("unavailable");
    quietError.mockRestore();
  });

  it("purges old rows on the way through", async () => {
    await pg.exec(
      "insert into llm_daily_usage (scope, day, calls) values ('user:old', current_date - 40, 9)",
    );
    const purge = createDailyUsagePurger();
    expect(await withinDailyBudget(async () => sql, "a", undefined, purge)).toBe(true);
    const rows = await sql<{ scope: string }>`select scope from llm_daily_usage order by scope`;
    // "a" has no verified email or social sign-in, so it draws on the shared pool too.
    expect(rows.map((r) => r.scope)).toEqual(["global", "pool:unverified", "user:a"]);
  });
});

describe("shares of the global budget", () => {
  const noPurge = async () => false;
  const limits = { perUser: 5, global: 100, perAddress: 6, unverified: 4 };

  beforeEach(async () => {
    await db.clear('"user"');
    for (const id of ["free-1", "free-2", "free-3", "google-1", "verified-1"]) {
      await db.seedUser(id);
    }
    await pg.exec(`update "user" set "emailVerified" = (id = 'verified-1')`);
    await pg.exec(`
      insert into "account" ("id", "accountId", "providerId", "userId", "updatedAt")
      values ('acc-g', 'g-1', 'google', 'google-1', now()),
        ('acc-c', 'free-1', 'credential', 'free-1', now())
    `);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it("holds every unverified account to one shared pool, not the global budget", async () => {
    let admitted = 0;
    for (const user of ["free-1", "free-2", "free-3"]) {
      for (let i = 0; i < 5; i += 1) {
        if (await withinDailyBudget(async () => sql, user, limits, noPurge)) admitted += 1;
      }
    }
    expect(admitted).toBe(4);
    // Accounts made with Google or a verified email still have their own share.
    expect(await withinDailyBudget(async () => sql, "google-1", limits, noPurge)).toBe(true);
    expect(await withinDailyBudget(async () => sql, "verified-1", limits, noPurge)).toBe(true);
  });

  it("caps one address across accounts, and a refusal spends nothing", async () => {
    const calls = (user: string, address: string) =>
      withinDailyBudget(async () => sql, user, { ...limits, unverified: 100 }, noPurge, address);
    for (let i = 0; i < 5; i += 1) expect(await calls("google-1", "198.51.100.7")).toBe(true);
    expect(await calls("verified-1", "198.51.100.7")).toBe(true);
    expect(await calls("verified-1", "198.51.100.7")).toBe(false);
    expect(await calls("verified-1", "198.51.100.8")).toBe(true);
    const rows = await sql<{ scope: string; calls: number }>`
      select scope, calls from llm_daily_usage order by scope
    `;
    expect(rows.find((r) => r.scope === "global")?.calls).toBe(7);
    expect(rows.find((r) => r.scope === "user:verified-1")?.calls).toBe(2);
    // The address is stored hashed.
    expect(rows.some((r) => r.scope.includes("198.51"))).toBe(false);
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
