import { describe, expect, it } from "vitest";
import type { Sql } from "./db";
import { inTransaction, isDeadlock, toSql, transactionScope } from "./sql-transaction";

const deadlock = () => Object.assign(new Error("deadlock detected"), { code: "40P01" });

/** A client whose transactions fail with `failures` in turn, then run the work. */
function failingClient(failures: Error[]): { sql: Sql; attempts: () => number } {
  let attempts = 0;
  const sql = toSql(async () => []);
  sql.transaction = async (work) => {
    attempts += 1;
    const failure = failures.shift();
    if (failure) throw failure;
    return work(sql);
  };
  return { sql, attempts: () => attempts };
}

describe("inTransaction retryOnDeadlock", () => {
  it("runs the unit again once after a deadlock", async () => {
    const client = failingClient([deadlock()]);
    await expect(
      inTransaction(client.sql, async () => "done", { retryOnDeadlock: true }),
    ).resolves.toBe("done");
    expect(client.attempts()).toBe(2);
  });

  it("passes a second deadlock to the caller", async () => {
    const client = failingClient([deadlock(), deadlock()]);
    await expect(
      inTransaction(client.sql, async () => "done", { retryOnDeadlock: true }),
    ).rejects.toMatchObject({ code: "40P01" });
    expect(client.attempts()).toBe(2);
  });

  it("does not retry other failures, or any failure without the option", async () => {
    const other = failingClient([new Error("unique violation")]);
    await expect(
      inTransaction(other.sql, async () => "done", { retryOnDeadlock: true }),
    ).rejects.toThrow("unique violation");
    expect(other.attempts()).toBe(1);
    const plain = failingClient([deadlock()]);
    await expect(inTransaction(plain.sql, async () => "done")).rejects.toThrow("deadlock");
    expect(plain.attempts()).toBe(1);
  });

  it("does not restart a unit nested in an open transaction", async () => {
    let runs = 0;
    const outer = transactionScope(
      async () => [],
      (tx) =>
        inTransaction(
          tx,
          async () => {
            runs += 1;
            throw deadlock();
          },
          { retryOnDeadlock: true },
        ),
    );
    await expect(outer).rejects.toMatchObject({ code: "40P01" });
    expect(runs).toBe(1);
  });

  it("finds the deadlock code along the cause chain", () => {
    expect(isDeadlock(new Error("aborted", { cause: deadlock() }))).toBe(true);
    expect(isDeadlock(new Error("plain"))).toBe(false);
    expect(isDeadlock(null)).toBe(false);
  });
});
