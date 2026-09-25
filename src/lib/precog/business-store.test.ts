import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Sql } from "@/lib/db";
import { openTestDb, type TestDb } from "@/test/pglite";
import {
  BusinessLimitError,
  deleteBusinessRow,
  listBusinessHistory,
  listBusinessSummaries,
  listDeletedBusinesses,
  loadActiveBusiness,
  loadBusinessHistoryVersion,
  MAX_BUSINESSES_PER_USER,
  purgeDeletedBusinesses,
  resolveBusinessOwner,
  restoreBusinessRow,
  saveBusinessRevision,
  setActiveBusiness,
} from "./business-store";

/**
 * Runs against an embedded Postgres with every file in migrations/ applied, so
 * the test exercises the real `businesses` schema (composite key, revision
 * column) rather than a hand-written stand-in.
 */

let db: TestDb;
let pg: PGlite;
let sql: Sql;

async function seedUser(id: string): Promise<void> {
  await pg.query(
    `insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
     values ($1, $1, $2, true, now(), now())`,
    [id, `${id}@example.test`],
  );
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
  db = await openTestDb();
  pg = db.pg;
  sql = db.sql;
}, 60_000);

afterAll(() => db.close());

beforeEach(async () => {
  await pg.exec(
    `delete from firm_members; delete from firms; delete from businesses; delete from business_profiles; delete from "user";`,
  );
  await seedUser("user-a");
  await seedUser("user-b");
});

describe("businesses schema", () => {
  it("is keyed by (user_id, id), not id alone", async () => {
    const rows = await pg.query<{ column_name: string }>(
      `select kcu.column_name
       from information_schema.table_constraints tc
       join information_schema.key_column_usage kcu
         on kcu.constraint_name = tc.constraint_name
       where tc.table_name = 'businesses' and tc.constraint_type = 'PRIMARY KEY'
       order by kcu.ordinal_position`,
    );
    expect(rows.rows.map((r) => r.column_name)).toEqual(["user_id", "id"]);
  });
});

describe("saveBusinessRevision — first save", () => {
  it("creates the row at revision 1 when the client has never loaded it", async () => {
    const result = await saveBusinessRevision(sql, input("user-a", "biz_1", null));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.revision).toBe(1);
    expect(await revisionOf("user-a", "biz_1")).toBe(1);
  });

  it("two users can each own a business with the same client-generated id", async () => {
    // Regression: under the old global primary key the second save matched
    // nothing and the server threw "Unable to save business profile".
    const a = await saveBusinessRevision(sql, input("user-a", "biz_default", null, "A Dental"));
    const b = await saveBusinessRevision(sql, input("user-b", "biz_default", null, "B Dental"));
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);

    const rows = await sql<{ user_id: string; name: string; revision: number | string }>`
      select user_id, name, revision from businesses where id = 'biz_default' order by user_id
    `;
    expect(rows.map((r) => [r.user_id, r.name, Number(r.revision)])).toEqual([
      ["user-a", "A Dental", 1],
      ["user-b", "B Dental", 1],
    ]);
  });

  it("one user's save never touches another user's row with the same id", async () => {
    await saveBusinessRevision(sql, input("user-a", "shared-id", null, "A"));
    await saveBusinessRevision(sql, input("user-a", "shared-id", 1, "A v2"));
    await saveBusinessRevision(sql, input("user-b", "shared-id", null, "B"));

    const rows = await sql<{ user_id: string; name: string; revision: number | string }>`
      select user_id, name, revision from businesses where id = 'shared-id' order by user_id
    `;
    expect(rows.map((r) => [r.user_id, r.name, Number(r.revision)])).toEqual([
      ["user-a", "A v2", 2],
      ["user-b", "B", 1],
    ]);
  });
});

describe("saveBusinessRevision — compare-and-swap", () => {
  it("increments the revision when the base matches", async () => {
    await saveBusinessRevision(sql, input("user-a", "biz_1", null));
    const second = await saveBusinessRevision(sql, input("user-a", "biz_1", 1, "v2"));
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.revision).toBe(2);
    expect(await revisionOf("user-a", "biz_1")).toBe(2);
  });

  it("rejects a save whose base revision is behind, and returns the current row", async () => {
    await saveBusinessRevision(sql, input("user-a", "biz_1", null, "v1"));
    await saveBusinessRevision(sql, input("user-a", "biz_1", 1, "v2"));

    const stale = await saveBusinessRevision<{ practiceName: string }>(
      sql,
      input("user-a", "biz_1", 1, "v2-from-other-tab"),
    );
    expect(stale.ok).toBe(false);
    if (!stale.ok) {
      expect(stale.existing.revision).toBe(2);
      expect(stale.existing.name).toBe("v2");
      expect(stale.existing.profile.practiceName).toBe("v2");
    }
    // The stale writer changed nothing.
    expect(await revisionOf("user-a", "biz_1")).toBe(2);
    const rows = await sql<{ name: string }>`
      select name from businesses where user_id = 'user-a' and id = 'biz_1'
    `;
    expect(rows[0].name).toBe("v2");
  });

  it("rejects a save from a client that never loaded a business that already exists", async () => {
    await saveBusinessRevision(sql, input("user-a", "biz_1", null, "cloud"));
    const fresh = await saveBusinessRevision(sql, input("user-a", "biz_1", null, "local-only"));
    expect(fresh.ok).toBe(false);
    if (!fresh.ok) expect(fresh.existing.name).toBe("cloud");
    expect(await revisionOf("user-a", "biz_1")).toBe(1);
  });

  it("lets exactly one of two racing writers on the same base revision win", async () => {
    // Regression: the previous read-then-write implementation let both pass
    // the stale check, so the second silently overwrote the first.
    await saveBusinessRevision(sql, input("user-a", "biz_1", null, "v1"));

    const [x, y] = await Promise.all([
      saveBusinessRevision(sql, input("user-a", "biz_1", 1, "writer-x")),
      saveBusinessRevision(sql, input("user-a", "biz_1", 1, "writer-y")),
    ]);
    const winners = [x, y].filter((r) => r.ok);
    const losers = [x, y].filter((r) => !r.ok);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(await revisionOf("user-a", "biz_1")).toBe(2);

    const rows = await sql<{ name: string }>`
      select name from businesses where user_id = 'user-a' and id = 'biz_1'
    `;
    const winnerName = x.ok ? "writer-x" : "writer-y";
    expect(rows[0].name).toBe(winnerName);
    if (!losers[0].ok) expect(losers[0].existing.name).toBe(winnerName);
  });

  it("throws only when the row vanished between the write and the re-read", async () => {
    // A base revision for a row that no longer exists is not a conflict — the
    // insert path creates it fresh (matches the previous `isStaleSave(null, N)` behaviour).
    const result = await saveBusinessRevision(sql, input("user-a", "gone", 7, "recreated"));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.revision).toBe(1);
  });
});

describe("loadActiveBusiness", () => {
  it("returns null for a user with no saved business", async () => {
    expect(await loadActiveBusiness(sql, "user-a")).toBeNull();
  });

  it("prefers the revision-checked row over the active pointer", async () => {
    // Simulates the pointer write failing after the businesses row succeeded:
    // the pointer still holds v1, the authoritative row is at v2.
    await saveBusinessRevision(sql, input("user-a", "biz_1", null, "v1"));
    await setActiveBusiness(sql, { ...input("user-a", "biz_1", null, "v1") });
    await saveBusinessRevision(sql, input("user-a", "biz_1", 1, "v2"));

    const active = await loadActiveBusiness<{ practiceName: string; businessId?: string }>(
      sql,
      "user-a",
    );
    expect(active?.businessId).toBe("biz_1");
    expect(active?.name).toBe("v2");
    expect(active?.profile.practiceName).toBe("v2");
    expect(active?.revision).toBe(2);
  });

  it("falls back to the pointer row for a legacy user with no businesses row", async () => {
    await setActiveBusiness(sql, { ...input("user-a", "biz_default", null, "legacy") });
    const active = await loadActiveBusiness(sql, "user-a");
    expect(active?.businessId).toBe("biz_default");
    expect(active?.name).toBe("legacy");
    expect(active?.revision).toBeNull();
  });

  it("drops the active pointer with the business so a later load cannot resurrect it", async () => {
    await saveBusinessRevision(sql, input("user-a", "biz_1", null, "one"));
    await setActiveBusiness(sql, { ...input("user-a", "biz_1", null, "one") });
    await saveBusinessRevision(sql, input("user-a", "biz_2", null, "two"));

    await deleteBusinessRow(sql, "user-a", "biz_1");

    expect(await loadActiveBusiness(sql, "user-a")).toBeNull();
    // Deleted means marked, not gone: the row waits out its grace period.
    expect(await revisionOf("user-a", "biz_1")).toBe(1);
    expect((await listBusinessSummaries(sql, "user-a")).map((b) => b.id)).toEqual(["biz_2"]);
    expect(await revisionOf("user-a", "biz_2")).toBe(1);
  });

  it("a deleted business can be restored within the grace period, then purged after it", async () => {
    await saveBusinessRevision(sql, input("user-a", "biz_1", null, "one"));
    await deleteBusinessRow(sql, "user-a", "biz_1");

    const deleted = await listDeletedBusinesses(sql, "user-a");
    expect(deleted.map((d) => d.id)).toEqual(["biz_1"]);
    expect(new Date(deleted[0].purgeOn).getTime()).toBeGreaterThan(
      new Date(deleted[0].deletedAt).getTime(),
    );

    expect(await restoreBusinessRow(sql, "user-a", "biz_1")).toBe(true);
    expect((await listBusinessSummaries(sql, "user-a")).map((b) => b.id)).toEqual(["biz_1"]);

    await deleteBusinessRow(sql, "user-a", "biz_1");
    await sql`update businesses set deleted_at = now() - interval '40 days' where id = 'biz_1'`;
    expect(await purgeDeletedBusinesses(sql)).toBe(1);
    expect(await revisionOf("user-a", "biz_1")).toBeNull();
  });
});

describe("history", () => {
  it("keeps the replaced version of every save, with who saved it", async () => {
    await saveBusinessRevision(sql, input("user-a", "biz_1", null, "v1"));
    await saveBusinessRevision(sql, { ...input("user-a", "biz_1", 1, "v2"), savedBy: "user-b" });
    await saveBusinessRevision(sql, input("user-a", "biz_1", 2, "v3"));

    const history = await listBusinessHistory(sql, "user-a", "biz_1");
    expect(history.map((h) => [h.revision, h.name, h.savedBy])).toEqual([
      [2, "v2", "user-b"],
      [1, "v1", "user-a"],
    ]);
    const v1 = await loadBusinessHistoryVersion<{ practiceName: string }>(
      sql,
      "user-a",
      "biz_1",
      1,
    );
    expect(v1?.profile.practiceName).toBe("v1");
  });

  it("records nothing for a save the revision check refuses", async () => {
    await saveBusinessRevision(sql, input("user-a", "biz_1", null, "v1"));
    const stale = await saveBusinessRevision(sql, input("user-a", "biz_1", 7, "stale"));
    expect(stale.ok).toBe(false);
    expect(await listBusinessHistory(sql, "user-a", "biz_1")).toEqual([]);
  });
});

describe("firm access", () => {
  beforeEach(async () => {
    await pg.exec(`delete from firm_members; delete from firms;`);
    await sql`insert into firms (user_id, name) values ('user-a', 'A & Co')`;
    await sql`insert into firm_members (firm_user_id, member_user_id, role) values ('user-a', 'user-a', 'owner')`;
    await sql`insert into firm_members (firm_user_id, member_user_id, role) values ('user-a', 'user-b', 'reviewer')`;
  });

  it("a member reaches a colleague's business through the firm, an outsider does not", async () => {
    await seedUser("user-c");
    await saveBusinessRevision(sql, {
      ...input("user-a", "biz_1", null, "Client"),
      firmUserId: "user-a",
    });
    await saveBusinessRevision(sql, input("user-a", "biz_private", null, "Own"));

    expect(await resolveBusinessOwner(sql, "user-b", "biz_1")).toBe("user-a");
    expect(await resolveBusinessOwner(sql, "user-b", "biz_private")).toBeNull();
    expect(await resolveBusinessOwner(sql, "user-c", "biz_1")).toBeNull();

    const shared = await listBusinessSummaries(sql, "user-b", "user-a");
    expect(shared.map((b) => [b.id, b.shared])).toEqual([["biz_1", true]]);
  });

  it("a member's save lands on the owner's row and names the member", async () => {
    await saveBusinessRevision(sql, {
      ...input("user-a", "biz_1", null, "Client"),
      firmUserId: "user-a",
    });
    const owner = await resolveBusinessOwner(sql, "user-b", "biz_1");
    const saved = await saveBusinessRevision(sql, {
      ...input(owner as string, "biz_1", 1, "Client v2"),
      savedBy: "user-b",
    });
    expect(saved.ok).toBe(true);
    const rows = await sql<{ saved_by: string; revision: number | string }>`
      select saved_by, revision from businesses where user_id = 'user-a' and id = 'biz_1'
    `;
    expect([rows[0].saved_by, Number(rows[0].revision)]).toEqual(["user-b", 2]);
  });

  it("prefers the caller's own row when a colleague's business carries the same id", async () => {
    await saveBusinessRevision(sql, {
      ...input("user-a", "same", null, "Theirs"),
      firmUserId: "user-a",
    });
    await saveBusinessRevision(sql, input("user-b", "same", null, "Mine"));
    expect(await resolveBusinessOwner(sql, "user-b", "same")).toBe("user-b");
  });

  it("ignores a dangling pointer when the user has other businesses", async () => {
    await saveBusinessRevision(sql, input("user-a", "biz_1", null, "one"));
    await setActiveBusiness(sql, { ...input("user-a", "biz_1", null, "one") });
    await saveBusinessRevision(sql, input("user-a", "biz_2", null, "two"));
    await sql`delete from businesses where user_id = ${"user-a"} and id = ${"biz_1"}`;

    expect(await loadActiveBusiness(sql, "user-a")).toBeNull();
  });

  it("never returns another user's business", async () => {
    await saveBusinessRevision(sql, input("user-b", "biz_1", null, "B"));
    await setActiveBusiness(sql, { ...input("user-b", "biz_1", null, "B") });
    expect(await loadActiveBusiness(sql, "user-a")).toBeNull();
  });
});

describe("timestamps", () => {
  const ISO_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

  async function storedMs(userId: string, businessId: string): Promise<number> {
    const rows = await sql<{ ms: number | string | bigint }>`
      select floor(extract(epoch from updated_at) * 1000)::bigint as ms
      from businesses where user_id = ${userId} and id = ${businessId}
    `;
    return Number(rows[0].ms);
  }

  it("returns updatedAt from a save as ISO 8601 with milliseconds", async () => {
    const saved = await saveBusinessRevision(sql, input("user-a", "biz_1", null));
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.updatedAt).toMatch(ISO_MS);
    expect(new Date(saved.updatedAt).getTime()).toBe(await storedMs("user-a", "biz_1"));
  });

  it("returns the conflicting row's updated_at as ISO 8601", async () => {
    await saveBusinessRevision(sql, input("user-a", "biz_1", null));
    const stale = await saveBusinessRevision(sql, input("user-a", "biz_1", null));
    expect(stale.ok).toBe(false);
    if (stale.ok) return;
    expect(stale.existing.updated_at).toMatch(ISO_MS);
    expect(new Date(stale.existing.updated_at).getTime()).toBe(await storedMs("user-a", "biz_1"));
  });

  it("loads updated_at as ISO 8601 from the business row and the legacy pointer", async () => {
    await saveBusinessRevision(sql, input("user-a", "biz_1", null));
    await setActiveBusiness(sql, { ...input("user-a", "biz_1", null) });
    const active = await loadActiveBusiness(sql, "user-a");
    expect(active?.updated_at).toMatch(ISO_MS);
    expect(new Date(active!.updated_at).getTime()).toBe(await storedMs("user-a", "biz_1"));

    await setActiveBusiness(sql, { ...input("user-b", "biz_default", null, "legacy") });
    const legacy = await loadActiveBusiness(sql, "user-b");
    expect(legacy?.revision).toBeNull();
    expect(legacy?.updated_at).toMatch(ISO_MS);
  });
});

describe("business limit", () => {
  it("refuses a new business once the account holds the limit, and stores nothing", async () => {
    for (let i = 0; i < 3; i += 1) {
      expect((await saveBusinessRevision(sql, input("user-a", `biz_${i}`, null), 3)).ok).toBe(true);
    }
    await expect(saveBusinessRevision(sql, input("user-a", "biz_3", null), 3)).rejects.toThrow(
      BusinessLimitError,
    );
    expect(await revisionOf("user-a", "biz_3")).toBeNull();
  });

  it("still saves, and still reports conflicts on, businesses the account already has", async () => {
    for (let i = 0; i < 3; i += 1)
      await saveBusinessRevision(sql, input("user-a", `biz_${i}`, null), 3);
    const update = await saveBusinessRevision(sql, input("user-a", "biz_1", 1, "renamed"), 3);
    expect(update.ok).toBe(true);
    const stale = await saveBusinessRevision(sql, input("user-a", "biz_1", 1, "stale"), 3);
    expect(stale.ok).toBe(false);
  });

  it("counts each account separately", async () => {
    for (let i = 0; i < 3; i += 1)
      await saveBusinessRevision(sql, input("user-a", `biz_${i}`, null), 3);
    expect((await saveBusinessRevision(sql, input("user-b", "biz_0", null), 3)).ok).toBe(true);
  });

  it("lets a deleted business make room for a new one", async () => {
    for (let i = 0; i < 3; i += 1)
      await saveBusinessRevision(sql, input("user-a", `biz_${i}`, null), 3);
    await deleteBusinessRow(sql, "user-a", "biz_0");
    expect((await saveBusinessRevision(sql, input("user-a", "biz_3", null), 3)).ok).toBe(true);
  });

  it("defaults to MAX_BUSINESSES_PER_USER", async () => {
    for (let i = 0; i < MAX_BUSINESSES_PER_USER; i += 1) {
      await saveBusinessRevision(sql, input("user-a", `biz_${i}`, null));
    }
    await expect(saveBusinessRevision(sql, input("user-a", "one_too_many", null))).rejects.toThrow(
      `${MAX_BUSINESSES_PER_USER} businesses`,
    );
  });
});

describe("listBusinessSummaries", () => {
  it("lists every business the account holds, beyond the old limit of 50", async () => {
    // Rows written before the limit existed must stay reachable.
    for (let i = 0; i < 60; i += 1) {
      await pg.query(
        `insert into businesses (id, user_id, name, industry, profile, revision, updated_at)
         values ($1, 'user-a', $1, 'dental', '{}'::jsonb, 1, now() - make_interval(mins => $2))`,
        [`biz_${i}`, i],
      );
    }
    const list = await listBusinessSummaries(sql, "user-a");
    expect(list).toHaveLength(60);
    expect(list[0].id).toBe("biz_0");
    expect(list[59].id).toBe("biz_59");
    expect(list[0].updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it("reads the process count and the latest health score from the profile", async () => {
    const profile = {
      customProcesses: [{ id: "a" }, { id: "b" }],
      mapHealthHistory: [{ score: 40 }, { score: 72 }],
    };
    await saveBusinessRevision(sql, {
      ...input("user-a", "biz_1", null),
      profileJson: JSON.stringify(profile),
    });
    await saveBusinessRevision(sql, {
      ...input("user-a", "biz_2", null),
      profileJson: JSON.stringify({ customProcesses: "x", mapHealthHistory: [null] }),
    });
    const byId = new Map((await listBusinessSummaries(sql, "user-a")).map((b) => [b.id, b]));
    expect(byId.get("biz_1")).toMatchObject({
      processCount: 2,
      healthScore: 72,
      industry: "dental",
    });
    expect(byId.get("biz_2")).toMatchObject({ processCount: 0, healthScore: null });
  });

  it("never lists another user's businesses", async () => {
    await saveBusinessRevision(sql, input("user-b", "biz_1", null));
    expect(await listBusinessSummaries(sql, "user-a")).toEqual([]);
  });
});
