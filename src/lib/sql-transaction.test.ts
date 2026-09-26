import { describe, expect, it } from "vitest";
import type { Sql } from "./db";
import { inTransaction, postgresTransaction, toSql, transactionScope } from "./sql-transaction";

describe("reserved connection transactions", () => {
  it("parameterizes every query on one client and releases after commit", async () => {
    const log: unknown[] = [];
    const pool = {
      connect: async () => ({
        query: async (text: string, params?: unknown[]) => {
          log.push([text, params]);
          return { rows: [{ value: 1 }] };
        },
        release: (broken?: Error | boolean) => {
          log.push(["release", broken]);
        },
      }),
    };
    const result = await postgresTransaction(pool, (tx) => tx`select ${"';drop"} as value`);
    expect(result).toEqual([{ value: 1 }]);
    expect(log).toEqual([
      ["BEGIN", undefined],
      ["select $1 as value", ["';drop"]],
      ["COMMIT", undefined],
      ["release", false],
    ]);
  });
  it("rolls back a failed write without committing and preserves the error", async () => {
    const log: string[] = [];
    const problem = new Error("write failed");
    const pool = {
      connect: async () => ({
        query: async (text: string) => {
          log.push(text);
          if (text === "write") throw problem;
          return { rows: [] };
        },
        release: () => {
          log.push("release");
        },
      }),
    };
    await expect(postgresTransaction(pool, (tx) => tx.query("write"))).rejects.toBe(problem);
    expect(log).toEqual(["BEGIN", "write", "ROLLBACK", "release"]);
  });
  it("evicts a connection whose rollback failed", async () => {
    let broken: unknown;
    const problem = new Error("original");
    const pool = {
      connect: async () => ({
        query: async (text: string) => {
          if (text === "ROLLBACK") throw new Error("lost");
          return { rows: [] };
        },
        release: (flag?: Error | boolean) => {
          broken = flag;
        },
      }),
    };
    await expect(
      postgresTransaction(pool, async () => {
        throw problem;
      }),
    ).rejects.toBe(problem);
    expect(broken).toBe(true);
  });
  it("never allows independent pooled queries as a fake transaction", () => {
    const sql = toSql(async () => []);
    expect(() => inTransaction(sql, async () => 1)).toThrow("transaction-capable");
  });
  it("refuses use of the reserved adapter after it closes", async () => {
    let escaped!: Sql;
    await transactionScope(
      async () => [],
      async (tx) => {
        escaped = tx;
      },
    );
    await expect(escaped.query("select 1")).rejects.toThrow("closed");
    await expect(inTransaction(escaped, async () => 1)).rejects.toThrow("closed");
  });
  it("does not commit when a nested failure is caught", async () => {
    await expect(
      transactionScope(
        async () => [],
        async (tx) => {
          await inTransaction(tx, async () => {
            throw new Error("nested");
          }).catch(() => {});
          return 1;
        },
      ),
    ).rejects.toThrow("aborted");
  });
});
