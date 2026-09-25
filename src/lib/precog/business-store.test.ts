import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Sql } from "@/lib/db";
import {
  BusinessDeletedError,
  BusinessLimitError,
  deleteBusinessRow,
  listBusinessSummaries,
  loadActiveBusiness,
  MAX_BUSINESSES_PER_USER,
  saveBusinessRevision,
  setActiveBusiness,
} from "./business-store";

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

function input(userId: string, businessId: string, baseRevision: number | null, name = "Business") {
  return {
    userId,
    businessId,
    name,
    industry: "dental",
    profileJson: JSON.stringify({ practiceName: name, businessId }),
    baseRevision,
  };
}

async function revisionOf(userId: string, businessId: string): Promise<number | null> {
  const rows = await sql<{ revision: number | string }>`
    select revision from businesses where user_id = ${userId} and id = ${businessId}
  `;
  return rows[0] ? Number(rows[0].revision) : null;
}

beforeAll(async () => {
  pg = new PGlite();
  await pg.waitReady;
  const dir = join(process.cwd(), "migrations");
  for (const name of (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort()) {
    await pg.exec(await readFile(join(dir, name), "utf8"));
  }
  sql = pgliteSql(pg);
}, 60_000);

afterAll(async () => {
  await pg.close();
});

beforeEach(async () => {
  await pg.exec('delete from "user";');
  for (const id of ["user-a", "user-b"]) {
    await pg.query(
      'insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") values ($1, $1, $2, true, now(), now())',
      [id, `${id}@example.test`],
    );
  }
});

describe("business identity and revision checks", () => {
  it("creates at revision one and isolates identical business ids by account", async () => {
    const a = await saveBusinessRevision(sql, input("user-a", "biz_default", null, "A"));
    const b = await saveBusinessRevision(sql, input("user-b", "biz_default", null, "B"));
    expect(a).toMatchObject({ ok: true, revision: 1 });
    expect(b).toMatchObject({ ok: true, revision: 1 });
    await saveBusinessRevision(sql, input("user-a", "biz_default", 1, "A2"));
    expect(await revisionOf("user-a", "biz_default")).toBe(2);
    expect(await revisionOf("user-b", "biz_default")).toBe(1);
    expect((await listBusinessSummaries(sql, "user-b"))[0].name).toBe("B");
  });

  it("returns the current row without changing it when a revision is stale or absent", async () => {
    await saveBusinessRevision(sql, input("user-a", "one", null, "v1"));
    await saveBusinessRevision(sql, input("user-a", "one", 1, "v2"));
    for (const base of [1, null]) {
      const result = await saveBusinessRevision(sql, input("user-a", "one", base, "stale"));
      expect(result).toMatchObject({
        ok: false,
        conflict: true,
        existing: { revision: 2, name: "v2", profile: { practiceName: "v2" } },
      });
    }
    expect(await revisionOf("user-a", "one")).toBe(2);
  });

  it("lets only one racing update on a given revision succeed", async () => {
    await saveBusinessRevision(sql, input("user-a", "one", null));
    const results = await Promise.all([
      saveBusinessRevision(sql, input("user-a", "one", 1, "x")),
      saveBusinessRevision(sql, input("user-a", "one", 1, "y")),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toHaveLength(1);
    expect(await revisionOf("user-a", "one")).toBe(2);
  });

  it("never turns a revision-bearing update into a creation", async () => {
    await expect(saveBusinessRevision(sql, input("user-a", "gone", 7))).rejects.toThrow(
      BusinessDeletedError,
    );
    expect(await revisionOf("user-a", "gone")).toBeNull();
  });

  it("rejects unsafe, fractional, zero, and negative revisions", async () => {
    for (const revision of [0, -1, 1.2, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      await expect(saveBusinessRevision(sql, input("user-a", "one", revision))).rejects.toThrow();
    }
    expect(await listBusinessSummaries(sql, "user-a")).toEqual([]);
  });
});

describe("active pointer and atomic saves", () => {
  it("returns null when the account has no active business", async () => {
    expect(await loadActiveBusiness(sql, "user-a")).toBeNull();
  });
  it("reads the authoritative row rather than a stale pointer snapshot", async () => {
    await saveBusinessRevision(sql, input("user-a", "one", null, "v1"));
    await setActiveBusiness(sql, input("user-a", "one", null, "v1"));
    await saveBusinessRevision(sql, input("user-a", "one", 1, "v2"));
    expect(await loadActiveBusiness(sql, "user-a")).toMatchObject({ name: "v2", revision: 2 });
  });
  it("still loads a genuine legacy pointer-only account", async () => {
    await setActiveBusiness(sql, input("user-a", "biz_default", null, "legacy"));
    expect(await loadActiveBusiness(sql, "user-a")).toMatchObject({
      name: "legacy",
      revision: null,
    });
  });
  it("sets the active business within the successful save transaction", async () => {
    await saveBusinessRevision(sql, { ...input("user-a", "one", null, "atomic"), activate: true });
    expect(await loadActiveBusiness(sql, "user-a")).toMatchObject({
      businessId: "one",
      name: "atomic",
      revision: 1,
    });
  });
  it("rolls back the business if the active-pointer write fails", async () => {
    await pg.exec(`
      create function test_fail_pointer() returns trigger language plpgsql as $$
      begin raise exception 'injected pointer failure'; end; $$;
      create trigger test_pointer before insert or update on business_profiles
      for each row execute function test_fail_pointer();
    `);
    try {
      await expect(
        saveBusinessRevision(sql, { ...input("user-a", "one", null), activate: true }),
      ).rejects.toThrow("injected pointer failure");
      expect(await revisionOf("user-a", "one")).toBeNull();
      expect(await loadActiveBusiness(sql, "user-a")).toBeNull();
    } finally {
      await pg.exec(
        "drop trigger test_pointer on business_profiles; drop function test_fail_pointer();",
      );
    }
  });
  it("ignores a dangling pointer when the account has revision-tracked businesses", async () => {
    await saveBusinessRevision(sql, input("user-a", "one", null));
    await setActiveBusiness(sql, input("user-a", "one", null));
    await saveBusinessRevision(sql, input("user-a", "two", null));
    await sql`delete from businesses where user_id = 'user-a' and id = 'one'`;
    expect(await loadActiveBusiness(sql, "user-a")).toBeNull();
  });
  it("never loads another account's business", async () => {
    await saveBusinessRevision(sql, { ...input("user-b", "one", null), activate: true });
    expect(await loadActiveBusiness(sql, "user-a")).toBeNull();
  });
});

describe("deletion and tombstones", () => {
  it("deletes the last business without legacy fallback and rejects both stale create paths", async () => {
    await saveBusinessRevision(sql, { ...input("user-a", "one", null), activate: true });
    await deleteBusinessRow(sql, "user-a", "one");
    expect(await loadActiveBusiness(sql, "user-a")).toBeNull();
    for (const revision of [1, null]) {
      await expect(saveBusinessRevision(sql, input("user-a", "one", revision))).rejects.toThrow(
        BusinessDeletedError,
      );
    }
    await expect(setActiveBusiness(sql, input("user-a", "one", null))).rejects.toThrow();
    expect(await revisionOf("user-a", "one")).toBeNull();
  });
  it("is idempotent and does not delete another account or business", async () => {
    await saveBusinessRevision(sql, input("user-a", "one", null));
    await saveBusinessRevision(sql, input("user-a", "two", null));
    await saveBusinessRevision(sql, input("user-b", "one", null));
    await deleteBusinessRow(sql, "user-a", "one");
    await deleteBusinessRow(sql, "user-a", "one");
    expect(await revisionOf("user-a", "two")).toBe(1);
    expect(await revisionOf("user-b", "one")).toBe(1);
  });
  it("cannot be undone by a racing stale save", async () => {
    await saveBusinessRevision(sql, input("user-a", "one", null));
    await Promise.allSettled([
      deleteBusinessRow(sql, "user-a", "one"),
      saveBusinessRevision(sql, input("user-a", "one", 1)),
    ]);
    expect(await revisionOf("user-a", "one")).toBeNull();
  });
  it("rolls back the tombstone and deletion if pointer deletion fails", async () => {
    await saveBusinessRevision(sql, { ...input("user-a", "one", null), activate: true });
    await pg.exec(`
      create function test_fail_delete() returns trigger language plpgsql as $$
      begin raise exception 'injected delete failure'; end; $$;
      create trigger test_delete before delete on business_profiles
      for each row execute function test_fail_delete();
    `);
    try {
      await expect(deleteBusinessRow(sql, "user-a", "one")).rejects.toThrow(
        "injected delete failure",
      );
      expect(await revisionOf("user-a", "one")).toBe(1);
      expect(await sql`select * from business_tombstones`).toEqual([]);
    } finally {
      await pg.exec(
        "drop trigger test_delete on business_profiles; drop function test_fail_delete();",
      );
    }
  });
  it("removes tombstones on full account deletion", async () => {
    await saveBusinessRevision(sql, input("user-a", "one", null));
    await deleteBusinessRow(sql, "user-a", "one");
    await sql`delete from "user" where id = 'user-a'`;
    expect(await sql`select * from business_tombstones where user_id = 'user-a'`).toEqual([]);
  });
});

describe("limits, summaries, and timestamps", () => {
  it("enforces limits atomically while permitting updates and other accounts", async () => {
    const results = await Promise.allSettled(
      ["one", "two", "three", "four"].map((id) =>
        saveBusinessRevision(sql, input("user-a", id, null), 3),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    expect(
      (results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason,
    ).toBeInstanceOf(BusinessLimitError);
    expect((await saveBusinessRevision(sql, input("user-a", "one", 1), 3)).ok).toBe(true);
    expect((await saveBusinessRevision(sql, input("user-b", "one", null), 3)).ok).toBe(true);
    await deleteBusinessRow(sql, "user-a", "one");
    expect((await saveBusinessRevision(sql, input("user-a", "new", null), 3)).ok).toBe(true);
  });
  it("uses the published default limit", async () => {
    for (let i = 0; i < MAX_BUSINESSES_PER_USER; i += 1) {
      await saveBusinessRevision(sql, input("user-a", `biz_${i}`, null));
    }
    await expect(saveBusinessRevision(sql, input("user-a", "extra", null))).rejects.toThrow(
      `${MAX_BUSINESSES_PER_USER} businesses`,
    );
  });
  it("lists legacy portfolios beyond the creation limit, newest first", async () => {
    for (let i = 0; i < 60; i += 1) {
      await pg.query(
        "insert into businesses (id,user_id,name,industry,profile,revision,updated_at) values ($1,'user-a',$1,'dental','{}',1,now()-make_interval(mins=>$2))",
        [`biz_${i}`, i],
      );
    }
    const list = await listBusinessSummaries(sql, "user-a");
    expect(list).toHaveLength(60);
    expect(list[0].id).toBe("biz_0");
    expect(list[59].id).toBe("biz_59");
    expect(await listBusinessSummaries(sql, "user-b")).toEqual([]);
  });
  it("reads process counts and latest health without trusting malformed shapes", async () => {
    await saveBusinessRevision(sql, {
      ...input("user-a", "one", null),
      profileJson: JSON.stringify({
        customProcesses: [{}, {}],
        mapHealthHistory: [{ score: 40 }, { score: 72 }],
      }),
    });
    await saveBusinessRevision(sql, {
      ...input("user-a", "two", null),
      profileJson: JSON.stringify({ customProcesses: "x", mapHealthHistory: [null] }),
    });
    const byId = new Map((await listBusinessSummaries(sql, "user-a")).map((b) => [b.id, b]));
    expect(byId.get("one")).toMatchObject({ processCount: 2, healthScore: 72 });
    expect(byId.get("two")).toMatchObject({ processCount: 0, healthScore: null });
  });
  it("normalizes save, conflict, and load timestamps to ISO milliseconds", async () => {
    const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
    const saved = await saveBusinessRevision(sql, {
      ...input("user-a", "one", null),
      activate: true,
    });
    if (!saved.ok) throw new Error("save failed");
    expect(saved.updatedAt).toMatch(iso);
    const conflict = await saveBusinessRevision(sql, input("user-a", "one", null));
    if (conflict.ok) throw new Error("expected conflict");
    expect(conflict.existing.updated_at).toMatch(iso);
    expect((await loadActiveBusiness(sql, "user-a"))?.updated_at).toMatch(iso);
  });
});
