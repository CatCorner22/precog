import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Sql } from "@/lib/db";

/** A fake database that answers the readiness query with `answers`, in turn. */
function fakeSql(...answers: boolean[]) {
  const query = vi.fn(async () => [{ ready: answers.shift() ?? false }]);
  return { sql: query as unknown as Sql, query };
}

describe("controlExecutionLogReady", () => {
  beforeEach(() => vi.resetModules());

  it("asks the database once, then keeps a true answer for the life of the process", async () => {
    const { controlExecutionLogReady } = await import("./migration-status.server");
    const { sql, query } = fakeSql(true);
    expect(await controlExecutionLogReady(sql)).toBe(true);
    expect(await controlExecutionLogReady(sql)).toBe(true);
    expect(await controlExecutionLogReady(sql)).toBe(true);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("asks again after a false answer, so a migration applied later is seen", async () => {
    const { controlExecutionLogReady } = await import("./migration-status.server");
    const { sql, query } = fakeSql(false, true);
    expect(await controlExecutionLogReady(sql)).toBe(false);
    expect(await controlExecutionLogReady(sql)).toBe(true);
    expect(await controlExecutionLogReady(sql)).toBe(true);
    expect(query).toHaveBeenCalledTimes(2);
  });
});
