import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * db.ts decides its backend at module load, so each test stubs the env,
 * resets the module registry and imports a fresh copy. The PGlite instance
 * and the pool live on globalThis (they must survive HMR), so tests clear
 * those slots too.
 */
type DbGlobals = Record<`__${string}__`, unknown>;

function clearDbGlobals() {
  const g = globalThis as unknown as DbGlobals;
  for (const key of Object.keys(g)) if (/^__pg/.test(key)) delete g[key as `__${string}__`];
}

async function freshDb(env: Record<string, string>) {
  vi.resetModules();
  clearDbGlobals();
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  return import("./db");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.doUnmock("pg");
  vi.doUnmock("@electric-sql/pglite");
  clearDbGlobals();
});

class FakePool extends EventEmitter {
  static last: FakePool | null = null;
  constructor(readonly options: Record<string, unknown>) {
    super();
    FakePool.last = this;
  }
}

describe("postgres pool", () => {
  it("survives an idle connection error instead of crashing the process", async () => {
    vi.doMock("pg", () => ({ Pool: FakePool, types: { setTypeParser: vi.fn() } }));
    const db = await freshDb({ DATABASE_URL: "postgres://u:p@db.example/app" });
    const pool = (await db.getPgPool()) as unknown as FakePool;
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(() =>
      pool.emit("error", new Error("terminating connection due to administrator command")),
    ).not.toThrow();
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  it("fails a slow connect or a stuck statement instead of waiting forever", async () => {
    vi.doMock("pg", () => ({ Pool: FakePool, types: { setTypeParser: vi.fn() } }));
    const db = await freshDb({ DATABASE_URL: "postgres://u:p@db.example/app" });
    await db.getPgPool();
    expect(FakePool.last?.options).toMatchObject({
      max: 4,
      connectionTimeoutMillis: expect.any(Number),
      statement_timeout: expect.any(Number),
    });
  });
});
