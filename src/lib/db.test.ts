import { EventEmitter } from "node:events";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { validateMigrationManifest } from "../../scripts/migration-manifest.mjs";

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

const PGLITE_ENV = { DATABASE_URL: "", VERCEL_ENV: "" };
const MIGRATION_COUNT = readdirSync(join(process.cwd(), "migrations")).filter((f) =>
  f.endsWith(".sql"),
).length;

describe("PGlite bootstrap", () => {
  it(
    "memoizes one client and applies every migration once across module reloads",
    {
      timeout: 120_000,
    },
    async () => {
      const db = await freshDb(PGLITE_ENV);
      const first = db.getSql();
      expect(db.getSql()).toBe(first);
      const sql = await first;
      const [{ n }] = await sql<{ n: number }>`select count(*) as n from _migrations`;
      expect(n).toBe(MIGRATION_COUNT);

      // An HMR reload: a new module instance over the same globalThis state.
      vi.resetModules();
      const reloaded = await import("./db");
      const again = await reloaded.getSql();
      const [{ n: after }] = await again<{ n: number }>`select count(*) as n from _migrations`;
      expect(after).toBe(MIGRATION_COUNT);
      expect(await reloaded.getPglite()).toBe(await db.getPglite());
    },
  );

  it(
    "retries after a failed start instead of remembering the failure",
    {
      timeout: 120_000,
    },
    async () => {
      vi.doMock("@electric-sql/pglite", async (importOriginal) => {
        const real = await importOriginal<typeof import("@electric-sql/pglite")>();
        let failed = false;
        class FlakyPGlite extends real.PGlite {
          override exec(...args: Parameters<InstanceType<typeof real.PGlite>["exec"]>) {
            if (!failed) {
              failed = true;
              return Promise.reject(new Error("disk full"));
            }
            return super.exec(...args);
          }
        }
        return { ...real, PGlite: FlakyPGlite };
      });
      const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const db = await freshDb(PGLITE_ENV);
      await expect(db.getSql()).rejects.toThrow("disk full");
      const sql = await db.getSql();
      expect(await sql`select 1 as ok`).toEqual([{ ok: 1 }]);
      logged.mockRestore();
    },
  );
});

describe("refusals", () => {
  it("fails every query in production without a database", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const db = await freshDb({ DATABASE_URL: "  ", VERCEL_ENV: "production" });
    await expect(db.getSql()).rejects.toThrow("DATABASE_URL is not set in production");
    await expect(db.ensureDbReady()).resolves.toBeUndefined();
    expect(db.databaseConfigured).toBe(false);
    logged.mockRestore();
  });

  it("refuses Neon's direct host in production, naming the pooled host", async () => {
    vi.doMock("pg", () => ({ Pool: FakePool, types: { setTypeParser: vi.fn() } }));
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const direct =
      "postgresql://u:p@ep-cool-name-123456.us-east-2.aws.neon.tech/app?sslmode=require";
    const db = await freshDb({ DATABASE_URL: direct, VERCEL_ENV: "production" });
    const message =
      "DATABASE_URL points at Neon's direct host in production. Use the pooled host (its name ends in -pooler) and redeploy.";
    await expect(db.getSql()).rejects.toThrow(message);
    await expect(db.getPgPool()).rejects.toThrow(message);
    expect(logged).toHaveBeenCalledWith(`[db] ${message}`);
    logged.mockRestore();
  });

  it("accepts the pooled host in production, and the direct host outside production", async () => {
    vi.doMock("pg", () => ({ Pool: FakePool, types: { setTypeParser: vi.fn() } }));
    const pooled =
      "postgresql://u:p@ep-cool-name-123456-pooler.us-east-2.aws.neon.tech/app?sslmode=require";
    const direct = "postgresql://u:p@ep-cool-name-123456.us-east-2.aws.neon.tech/app";
    const prod = await freshDb({ DATABASE_URL: pooled, VERCEL_ENV: "production" });
    await expect(prod.getPgPool()).resolves.toBeInstanceOf(FakePool);
    const preview = await freshDb({ DATABASE_URL: direct, VERCEL_ENV: "preview" });
    await expect(preview.getPgPool()).resolves.toBeInstanceOf(FakePool);
    const selfHosted = await freshDb({
      DATABASE_URL: "postgres://u:p@db.example/app",
      VERCEL_ENV: "production",
    });
    await expect(selfHosted.getPgPool()).resolves.toBeInstanceOf(FakePool);
    expect(prod.isDirectNeonHost(direct)).toBe(true);
    expect(prod.isDirectNeonHost(pooled)).toBe(false);
    expect(prod.isDirectNeonHost("postgresql://precog:precog@localhost:5432/precog")).toBe(false);
    expect(prod.isDirectNeonHost("not a url")).toBe(false);
  });

  it("refuses to run in a browser", async () => {
    vi.stubGlobal("window", {});
    const db = await freshDb(PGLITE_ENV);
    await expect(db.getSql()).rejects.toThrow(/server-only/);
  });
});

describe("migration manifest (shared with scripts/migrate-core.mjs)", () => {
  it("refuses bad names, shared prefixes and malformed renames", () => {
    expect(() => validateMigrationManifest(["0001_a.sql", "0002_b.sql"], {})).not.toThrow();
    expect(() => validateMigrationManifest(["1_a.sql"], {})).toThrow(/Invalid migration filename/);
    expect(() => validateMigrationManifest(["0024_a.sql", "0024_b.sql"], {})).toThrow(
      /share the prefix 0024/,
    );
    expect(() => validateMigrationManifest(["0001_a.sql"], [])).toThrow(/must be an object/);
    expect(() =>
      validateMigrationManifest(["0002_a.sql"], { "0002_a.sql": "0001_a.sql", _comment: "x" }),
    ).not.toThrow();
    expect(() => validateMigrationManifest(["0002_a.sql"], { "0003_b.sql": "0001_b.sql" })).toThrow(
      /Invalid migration rename/,
    );
  });
});
