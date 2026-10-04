import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Sql } from "@/lib/db";

/** A fake database that answers the readiness query with `answers`, in turn. */
function fakeSql(...answers: boolean[]) {
  const query = vi.fn(async () => [{ ready: answers.shift() ?? false }]);
  return { sql: query as unknown as Sql, query };
}

/** A fake database that answers the ledger count with `answers`, in turn. */
function fakeCount(...answers: (number | Error)[]) {
  const query = vi.fn(async () => {
    const next = answers.shift() ?? 0;
    if (next instanceof Error) throw next;
    return [{ n: next }];
  });
  return { sql: query as unknown as Sql, query };
}

describe("controlExecutionLogReady", () => {
  beforeEach(() => vi.resetModules());

  it("asks the database once, then keeps a true answer until its time runs out", async () => {
    const { controlExecutionLogReady } = await import("./migration-status.server");
    const { sql, query } = fakeSql(true, false);
    expect(await controlExecutionLogReady(sql, 0)).toBe(true);
    expect(await controlExecutionLogReady(sql, 60_000)).toBe(true);
    expect(query).toHaveBeenCalledTimes(1);
    // Past the five minutes the database is asked again, and a table dropped
    // meanwhile reads as missing.
    expect(await controlExecutionLogReady(sql, 300_001)).toBe(false);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("asks again after a false answer, so a migration applied later is seen", async () => {
    const { controlExecutionLogReady } = await import("./migration-status.server");
    const { sql, query } = fakeSql(false, true);
    expect(await controlExecutionLogReady(sql, 0)).toBe(false);
    expect(await controlExecutionLogReady(sql, 1_000)).toBe(true);
    expect(await controlExecutionLogReady(sql, 2_000)).toBe(true);
    expect(query).toHaveBeenCalledTimes(2);
  });
});

describe("migrationsApplied", () => {
  beforeEach(() => vi.resetModules());

  it("reads the ledger count once, then keeps it until its time runs out", async () => {
    const { migrationsApplied } = await import("./migration-status.server");
    const { sql, query } = fakeCount(44, 45);
    expect(await migrationsApplied(sql, 0)).toBe(44);
    expect(await migrationsApplied(sql, 60_000)).toBe(44);
    expect(query).toHaveBeenCalledTimes(1);
    expect(await migrationsApplied(sql, 300_001)).toBe(45);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("reads null without a ledger, and asks again next time", async () => {
    const { migrationsApplied } = await import("./migration-status.server");
    const { sql, query } = fakeCount(new Error("no such table"), 44);
    expect(await migrationsApplied(sql, 0)).toBeNull();
    expect(await migrationsApplied(sql, 1_000)).toBe(44);
    expect(query).toHaveBeenCalledTimes(2);
  });
});
