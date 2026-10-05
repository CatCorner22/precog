import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Sql } from "@/lib/db";
import { openTestDb, type TestDb } from "@/test/pglite";
import {
  BusinessLimitError,
  deleteBusinessRow,
  GRANTED_NOT_FIRMS_TO_DELETE,
  keepVersionBeforeRestore,
  listBusinessHistory,
  listBusinessSummaries,
  listDeletedBusinesses,
  loadActiveBusiness,
  loadBusinessHistoryVersion,
  purgeDeletedBusinesses,
  resolveBusinessOwner,
  restoreBusinessRow,
  saveBusinessRevision,
  setActiveBusiness,
} from "./business-store";
import { MAX_BUSINESSES_PER_ACCOUNT } from "./business-lifecycle";
import {
  HISTORY_RETENTION_DAYS,
  HISTORY_VERSION_WINDOW_MINUTES,
  MAX_HISTORY_PER_BUSINESS,
} from "./business-retention";
import { imageSweepNeeded } from "./procedures/image-store.server";
import { ENGAGEMENT_ENDED } from "./firm/engagement-row";
import { lockReportVersion } from "./firm/reports";
import { removeMember } from "./firm/store";

/**
 * Runs against an embedded Postgres with every file in migrations/ applied, so
 * the test exercises the real `businesses` schema (composite key, revision
 * column) rather than a hand-written stand-in.
 */

let db: TestDb;
let sql: Sql;

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
  sql = db.sql;
}, 60_000);

afterAll(() => db.close());

beforeEach(async () => {
  await db.clear("firm_members", "firms", "businesses", "business_profiles", '"user"');
  await db.seedUser("user-a");
  await db.seedUser("user-b");
});

describe("businesses schema", () => {
  it("is keyed by (user_id, id), not id alone", async () => {
    const rows = await db.pg.query<{ column_name: string }>(
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

  it("refuses a stale revision for a business that no longer exists", async () => {
    await expect(
      saveBusinessRevision(sql, input("user-a", "gone", 7, "recreated")),
    ).rejects.toThrow("no longer available");
    expect(await revisionOf("user-a", "gone")).toBeNull();
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
    // Genuine pre-portfolio data contains the full profile, not a modern pointer.
    await sql`insert into business_profiles (user_id, name, industry, profile)
      values ('user-a', 'legacy', 'dental', '{"businessId":"biz_default","staff":{}}'::jsonb)`;
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
    // Deletion advances the revision so an old client cannot write after restore.
    expect(await revisionOf("user-a", "biz_1")).toBe(2);
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
  it("keeps the replaced version when another account saves, with who saved it", async () => {
    await sql`insert into firms (user_id, name) values ('user-a', 'Firm')`;
    await sql`insert into firm_members (firm_user_id, member_user_id) values ('user-a', 'user-b')`;
    await saveBusinessRevision(sql, {
      ...input("user-a", "biz_1", null, "v1"),
      firmUserId: "user-a",
    });
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

  it("writes nothing for a save that changes nothing, so browsing never pushes real versions out", async () => {
    await saveBusinessRevision(sql, input("user-a", "biz_1", null, "v1"));
    const again = await saveBusinessRevision(sql, input("user-a", "biz_1", 1, "v1"));
    expect(again).toMatchObject({ ok: true, revision: 1 });
    expect(await revisionOf("user-a", "biz_1")).toBe(1);
    expect(await listBusinessHistory(sql, "user-a", "biz_1")).toEqual([]);
    // A real change after it still builds on revision 1.
    expect((await saveBusinessRevision(sql, input("user-a", "biz_1", 1, "v2"))).ok).toBe(true);
    expect(await revisionOf("user-a", "biz_1")).toBe(2);
  });

  it("records nothing for a save the revision check refuses", async () => {
    await saveBusinessRevision(sql, input("user-a", "biz_1", null, "v1"));
    const stale = await saveBusinessRevision(sql, input("user-a", "biz_1", 7, "stale"));
    expect(stale.ok).toBe(false);
    expect(await listBusinessHistory(sql, "user-a", "biz_1")).toEqual([]);
  });
});

describe("history kept by time", () => {
  /** Kept revisions of biz_1, newest first. */
  async function kept(): Promise<number[]> {
    return (await listBusinessHistory(sql, "user-a", "biz_1", 1000)).map((h) => h.revision);
  }

  /** Moves every kept version of biz_1, and the row itself, `minutes` into the past. */
  async function age(minutes: number) {
    await sql`update business_history set saved_at = saved_at - make_interval(mins => ${minutes})
      where user_id = 'user-a' and business_id = 'biz_1'`;
    await sql`update businesses set updated_at = updated_at - make_interval(mins => ${minutes})
      where user_id = 'user-a' and id = 'biz_1'`;
  }

  /** Saves biz_1 `count` times in a row, each with a new name; returns the last revision. */
  async function saveRepeatedly(from: number, count: number, savedBy = "user-a") {
    let revision = from;
    for (let i = 0; i < count; i += 1) {
      const saved = await saveBusinessRevision(sql, {
        ...input("user-a", "biz_1", revision, `v${revision + 1}`),
        savedBy,
      });
      if (!saved.ok) throw new Error("conflict");
      revision = saved.revision;
    }
    return revision;
  }

  beforeEach(async () => {
    await sql`insert into firms (user_id, name) values ('user-a', 'Firm')`;
    await sql`insert into firm_members (firm_user_id, member_user_id) values ('user-a', 'user-b')`;
    await saveBusinessRevision(sql, {
      ...input("user-a", "biz_1", null, "v1"),
      firmUserId: "user-a",
    });
  });

  it("keeps one version for ten saves inside a minute by one account", async () => {
    await saveRepeatedly(1, 10);
    expect(await revisionOf("user-a", "biz_1")).toBe(11);
    // The version from before the burst.
    expect(await kept()).toEqual([1]);
  });

  it("keeps another version when a second account saves", async () => {
    const last = await saveRepeatedly(1, 10);
    await saveRepeatedly(last, 1, "user-b");
    // The first account's last state, as the second account found it.
    expect(await kept()).toEqual([11, 1]);
    const handedOver = await loadBusinessHistoryVersion<{ practiceName: string }>(
      sql,
      "user-a",
      "biz_1",
      11,
    );
    expect(handedOver?.profile.practiceName).toBe("v11");
  });

  it("keeps another version once the newest kept one is older than the window", async () => {
    const last = await saveRepeatedly(1, 10);
    await age(HISTORY_VERSION_WINDOW_MINUTES - 1);
    await saveRepeatedly(last, 1);
    expect(await kept()).toEqual([1]);
    await age(2);
    await saveRepeatedly(last + 1, 1);
    expect(await kept()).toEqual([12, 1]);
  });

  it("drops versions older than the retention period", async () => {
    let last = await saveRepeatedly(1, 1);
    await age(HISTORY_VERSION_WINDOW_MINUTES + 1);
    last = await saveRepeatedly(last, 1);
    expect(await kept()).toEqual([2, 1]);
    // Revision 1 was replaced no later than revision 2 was saved, past the period.
    await sql`update business_history set saved_at = now() - make_interval(days => ${HISTORY_RETENTION_DAYS + 2})
      where user_id = 'user-a' and business_id = 'biz_1' and revision = 1`;
    await sql`update business_history set saved_at = now() - make_interval(days => ${HISTORY_RETENTION_DAYS + 1})
      where user_id = 'user-a' and business_id = 'biz_1' and revision = 2`;
    await saveRepeatedly(last, 1);
    // Revision 3 is kept too, and revision 2 stays: revision 3 replaced it just now.
    expect(await kept()).toEqual([3, 2]);
  });

  it("keeps the state from before a session that follows months without edits", async () => {
    await age(100 * 24 * 60);
    await saveRepeatedly(1, 2);
    // Revision 1 was saved 100 days ago but replaced only now.
    expect(await kept()).toEqual([2, 1]);
    await saveRepeatedly(3, 1);
    expect(await kept()).toEqual([2, 1]);
  });

  it("counts a version's age from when the next kept version was saved", async () => {
    let last = await saveRepeatedly(1, 1);
    await age(HISTORY_VERSION_WINDOW_MINUTES + 1);
    last = await saveRepeatedly(last, 1);
    await age(HISTORY_VERSION_WINDOW_MINUTES + 1);
    last = await saveRepeatedly(last, 1);
    expect(await kept()).toEqual([3, 2, 1]);
    // Revision 2 was saved, so revision 1 replaced, past the period; revision 3 is recent.
    await sql`update business_history set saved_at = now() - make_interval(days => ${HISTORY_RETENTION_DAYS + 1})
      where user_id = 'user-a' and business_id = 'biz_1' and revision in (1, 2)`;
    await saveRepeatedly(last, 1);
    expect(await kept()).toEqual([4, 3, 2]);
  });

  it("keeps the newest version however old it is", async () => {
    await age(HISTORY_RETENTION_DAYS * 24 * 60 + 60);
    // A restore keeps the current state first, saved long before the retention period.
    await keepVersionBeforeRestore(sql, "user-a", "biz_1", "user-a");
    await saveRepeatedly(1, 1);
    expect(await kept()).toEqual([1]);
  });

  it("never keeps more than the ceiling", async () => {
    await sql`update businesses set revision = 1000 where user_id = 'user-a' and id = 'biz_1'`;
    await sql`insert into business_history (user_id, business_id, revision, name, industry, profile, saved_by)
      select 'user-a', 'biz_1', g, 'old', 'dental', '{}'::jsonb, 'user-a'
      from generate_series(1, ${MAX_HISTORY_PER_BUSINESS + 5}) g`;
    await saveRepeatedly(1000, 1);
    const revisions = await kept();
    expect(revisions).toHaveLength(MAX_HISTORY_PER_BUSINESS);
    expect(revisions.at(-1)).toBe(6);
  });

  it("keeps the state a restore replaces, even inside the window", async () => {
    const last = await saveRepeatedly(1, 3);
    expect(await kept()).toEqual([1]);
    await keepVersionBeforeRestore(sql, "user-a", "biz_1", "user-a");
    await saveRepeatedly(last, 1);
    expect(await kept()).toEqual([4, 1]);
  });
});

describe("skipping the picture sweep", () => {
  const picture = { procedures: [{ id: "p1", steps: [{ imageIds: ["img_1"] }] }] };
  const noPicture = { procedures: [{ id: "p1", steps: [{ text: "Count the till" }] }] };

  async function save(baseRevision: number | null, profile: object) {
    const saved = await saveBusinessRevision(sql, {
      ...input("user-a", "biz_img", baseRevision),
      profileJson: JSON.stringify(profile),
    });
    if (!saved.ok) throw new Error("conflict");
    return saved;
  }

  it("skips it when neither the old nor the new procedures name a picture", async () => {
    await save(null, noPicture);
    const saved = await save(1, { ...noPicture, practiceName: "Renamed" });
    expect(imageSweepNeeded(saved, { ...noPicture, practiceName: "Renamed" })).toBe(false);
  });

  it("runs it when the new procedures name a picture", async () => {
    await save(null, noPicture);
    const saved = await save(1, picture);
    expect(imageSweepNeeded(saved, picture)).toBe(true);
  });

  it("runs it when the replaced procedures named a picture the new ones drop", async () => {
    await save(null, picture);
    const saved = await save(1, noPicture);
    expect(saved.previousProcedures).toEqual(picture.procedures);
    expect(imageSweepNeeded(saved, noPicture)).toBe(true);
  });

  it("runs it when the business holds a picture still counted as named", async () => {
    await save(null, noPicture);
    await sql`insert into procedure_images
      (id, user_id, business_id, content_type, bytes, byte_size, width, height, sha256)
      values ('img_1', 'user-a', 'biz_img', 'image/png', '\\x00'::bytea, 1, 1, 1, 'x')`;
    const saved = await save(1, { ...noPicture, practiceName: "Renamed" });
    expect(saved.heldNamedImages).toBe(true);
    expect(imageSweepNeeded(saved, noPicture)).toBe(true);
  });
});

describe("migrations", () => {
  it("index businesses by id for the owner lookup", async () => {
    const rows = await sql<{ indexdef: string }>`
      select indexdef from pg_indexes where indexname = 'businesses_id_idx'`;
    expect(rows[0]?.indexdef).toMatch(/ON public\.businesses USING btree \(id\)/);
  });
});

describe("firm access", () => {
  beforeEach(async () => {
    await db.clear("firm_members", "firms");
    await sql`insert into firms (user_id, name) values ('user-a', 'A & Co')`;
    await sql`insert into firm_members (firm_user_id, member_user_id, role) values ('user-a', 'user-a', 'owner')`;
    await sql`insert into firm_members (firm_user_id, member_user_id, role) values ('user-a', 'user-b', 'reviewer')`;
  });

  it("a member reaches a colleague's business through the firm, an outsider does not", async () => {
    await db.seedUser("user-c");
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
    // A firm client is flagged for whoever lists it; a solo business is not.
    const own = await listBusinessSummaries(sql, "user-a");
    expect(own.map((b) => [b.id, b.firmClient]).sort()).toEqual([
      ["biz_1", true],
      ["biz_private", false],
    ]);
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

  it("refuses a firm member's change to a client whose engagement has ended", async () => {
    await saveBusinessRevision(sql, {
      ...input("user-a", "biz_1", null, "Client"),
      firmUserId: "user-a",
    });
    await sql`insert into engagement_marks (user_id, business_id, status, ended_at)
      values ('user-a', 'biz_1', 'ended', now())`;
    const ended = { status: 409, message: ENGAGEMENT_ENDED };
    await expect(
      saveBusinessRevision(sql, { ...input("user-a", "biz_1", 1, "Client v2"), savedBy: "user-b" }),
    ).rejects.toMatchObject(ended);
    // The firm owner is a member too; the same save unchanged still goes through.
    await expect(
      saveBusinessRevision(sql, input("user-a", "biz_1", 1, "Client v2")),
    ).rejects.toMatchObject(ended);
    expect(
      (
        await saveBusinessRevision(sql, {
          ...input("user-a", "biz_1", 1, "Client"),
          activate: true,
        })
      ).ok,
    ).toBe(true);
    // Reopened, the member's save lands.
    await sql`update engagement_marks set status = 'active', ended_at = null`;
    const saved = await saveBusinessRevision(sql, {
      ...input("user-a", "biz_1", 1, "Client v2"),
      savedBy: "user-b",
    });
    expect(saved.ok).toBe(true);
  });

  it("refuses a firm member's restore on an ended client before the history changes", async () => {
    await saveBusinessRevision(sql, {
      ...input("user-a", "biz_1", null, "Client"),
      firmUserId: "user-a",
    });
    await sql`insert into engagement_marks (user_id, business_id, status, ended_at)
      values ('user-a', 'biz_1', 'ended', now())`;
    const history = async () =>
      (
        await sql<{ revision: number | string }>`
          select revision from business_history
          where user_id = 'user-a' and business_id = 'biz_1' order by revision`
      ).map((r) => Number(r.revision));
    const before = await history();
    const ended = { status: 409, message: ENGAGEMENT_ENDED };
    await expect(keepVersionBeforeRestore(sql, "user-a", "biz_1", "user-b")).rejects.toMatchObject(
      ended,
    );
    await expect(keepVersionBeforeRestore(sql, "user-a", "biz_1", "user-a")).rejects.toMatchObject(
      ended,
    );
    expect(await history()).toEqual(before);
    // Reopened, the restore keeps the current state first.
    await sql`update engagement_marks set status = 'active', ended_at = null`;
    await keepVersionBeforeRestore(sql, "user-a", "biz_1", "user-b");
    expect(await history()).toEqual([...before, 1]);
  });

  it("an ended engagement leaves a business with no firm alone", async () => {
    await saveBusinessRevision(sql, input("user-a", "biz_private", null, "Own"));
    await sql`insert into engagement_marks (user_id, business_id, status)
      values ('user-a', 'biz_private', 'ended')`;
    expect((await saveBusinessRevision(sql, input("user-a", "biz_private", 1, "Own v2"))).ok).toBe(
      true,
    );
  });

  describe("retention of a deleted firm client", () => {
    async function deletedClient(id: string, withVersion: boolean, firm: string | null = "user-a") {
      await saveBusinessRevision(sql, { ...input("user-a", id, null, id), firmUserId: firm });
      if (firm === null) await sql`update businesses set firm_user_id = null where id = ${id}`;
      if (withVersion) {
        await lockReportVersion(sql, {
          ownerUserId: "user-a",
          businessId: id,
          preparedBy: "user-a",
          scopeNote: "",
          id: `rv_${id}`,
        });
      }
      await deleteBusinessRow(sql, "user-a", id);
    }

    async function ageDeletion(id: string, interval: string) {
      await sql.query(
        `update businesses set deleted_at = now() - $2::interval where user_id = 'user-a' and id = $1`,
        [id, interval],
      );
    }

    it("keeps a client with a locked version past the grace period, until the retention runs out", async () => {
      await deletedClient("biz_kept", true);
      await ageDeletion("biz_kept", "31 days");
      expect(await purgeDeletedBusinesses(sql, 30)).toBe(0);
      expect(await revisionOf("user-a", "biz_kept")).not.toBeNull();
      // Unseen and not restorable after the grace period, as before.
      expect(await listDeletedBusinesses(sql, "user-a", "user-a")).toEqual([]);
      expect(await restoreBusinessRow(sql, "user-a", "biz_kept")).toBe(false);
      const versions = await sql`select 1 from report_versions where business_id = 'biz_kept'`;
      expect(versions.length).toBe(1);
      const markers =
        await sql`select 1 from business_deletion_markers where business_id = 'biz_kept'`;
      expect(markers.length).toBe(1); // the delete's own marker, nothing more
      await ageDeletion("biz_kept", "8 years");
      expect(await purgeDeletedBusinesses(sql, 30)).toBe(1);
      expect(await revisionOf("user-a", "biz_kept")).toBeNull();
    });

    it("follows the firm's retention period", async () => {
      await sql`update firms set retention_years = 10 where user_id = 'user-a'`;
      await deletedClient("biz_ten", true);
      await ageDeletion("biz_ten", "8 years");
      expect(await purgeDeletedBusinesses(sql, 30)).toBe(0);
      await ageDeletion("biz_ten", "10 years 1 day");
      expect(await purgeDeletedBusinesses(sql, 30)).toBe(1);
    });

    it("purges a firm client with no version and a solo business at day 31, as before", async () => {
      await deletedClient("biz_plain", false);
      await deletedClient("biz_solo", true, null);
      await ageDeletion("biz_plain", "31 days");
      await ageDeletion("biz_solo", "31 days");
      expect(await purgeDeletedBusinesses(sql, 30)).toBe(2);
      expect(await revisionOf("user-a", "biz_plain")).toBeNull();
      expect(await revisionOf("user-a", "biz_solo")).toBeNull();
    });
  });

  it("lets only the firm owner delete and restore a colleague's client", async () => {
    await db.seedUser("user-c");
    await sql`insert into firm_members (firm_user_id, member_user_id, role) values ('user-a', 'user-c', 'preparer')`;
    await saveBusinessRevision(sql, {
      ...input("user-c", "biz_c", null, "Client of C"),
      savedBy: "user-c",
      firmUserId: "user-a",
    });
    const refused = { status: 403, message: "Only the firm owner can delete or restore a client." };
    await expect(deleteBusinessRow(sql, "user-c", "biz_c", "user-b")).rejects.toMatchObject(
      refused,
    );
    // The owner deletes and restores; the member who set the client up may not.
    await deleteBusinessRow(sql, "user-c", "biz_c", "user-a");
    expect(await resolveBusinessOwner(sql, "user-a", "biz_c")).toBeNull();
    await expect(restoreBusinessRow(sql, "user-c", "biz_c", "user-b")).rejects.toMatchObject(
      refused,
    );
    await expect(restoreBusinessRow(sql, "user-c", "biz_c", "user-c")).rejects.toMatchObject(
      refused,
    );
    expect(await restoreBusinessRow(sql, "user-c", "biz_c", "user-a")).toBe(true);
    await expect(deleteBusinessRow(sql, "user-c", "biz_c", "user-c")).rejects.toMatchObject(
      refused,
    );
    expect(await resolveBusinessOwner(sql, "user-b", "biz_c")).toBe("user-c");
    // A business the member kept outside the firm stays theirs to delete and restore.
    await saveBusinessRevision(sql, input("user-c", "biz_own", null, "Own"));
    await deleteBusinessRow(sql, "user-c", "biz_own", "user-c");
    expect(await restoreBusinessRow(sql, "user-c", "biz_own", "user-c")).toBe(true);
  });

  describe("a business its owner shared with the firm", () => {
    /** `user-c`, outside the firm, owns biz_g and shared it with A & Co. */
    beforeEach(async () => {
      await db.seedUser("user-c");
      await saveBusinessRevision(sql, input("user-c", "biz_g", null, "Granted"));
      await sql`update businesses set firm_user_id = 'user-a', granted_at = now()
        where user_id = 'user-c' and id = 'biz_g'`;
    });

    it("is never the firm's to delete or restore; its owner does both", async () => {
      expect(GRANTED_NOT_FIRMS_TO_DELETE).toBe(
        "This business belongs to its owner, who shared it with the firm. Hand it back on its Engagement block instead of deleting it.",
      );
      const refused = { status: 403, message: GRANTED_NOT_FIRMS_TO_DELETE };
      for (const actor of ["user-a", "user-b"]) {
        await expect(deleteBusinessRow(sql, "user-c", "biz_g", actor)).rejects.toMatchObject(
          refused,
        );
      }
      await deleteBusinessRow(sql, "user-c", "biz_g", "user-c");
      // The firm's deleted list leaves it out; the owner's keeps it.
      expect(await listDeletedBusinesses(sql, "user-a", "user-a")).toEqual([]);
      expect((await listDeletedBusinesses(sql, "user-c")).map((b) => b.id)).toEqual(["biz_g"]);
      await expect(restoreBusinessRow(sql, "user-c", "biz_g", "user-a")).rejects.toMatchObject(
        refused,
      );
      expect(await restoreBusinessRow(sql, "user-c", "biz_g", "user-c")).toBe(true);
    });

    it("is purged at day 31 even with a locked version: it is the owner's, not kept for the firm", async () => {
      await lockReportVersion(sql, {
        ownerUserId: "user-c",
        businessId: "biz_g",
        preparedBy: "user-b",
        scopeNote: "",
        id: "rv_g",
      });
      await deleteBusinessRow(sql, "user-c", "biz_g", "user-c");
      await sql`update businesses set deleted_at = now() - interval '31 days'
        where user_id = 'user-c' and id = 'biz_g'`;
      expect(await purgeDeletedBusinesses(sql, 30)).toBe(1);
      expect(await revisionOf("user-c", "biz_g")).toBeNull();
    });

    it("stays with a member who shared it when they leave, still shared with the firm", async () => {
      await sql`insert into firm_members (firm_user_id, member_user_id, role)
        values ('user-a', 'user-c', 'preparer')`;
      await saveBusinessRevision(sql, {
        ...input("user-c", "biz_set_up", null, "Set up for the firm"),
        savedBy: "user-c",
        firmUserId: "user-a",
      });
      const moved = await removeMember(sql, "user-a", "user-c");
      expect(moved?.map((m) => m.from)).toEqual(["biz_set_up"]);
      const rows = await sql<{ user_id: string; firm_user_id: string | null; granted: boolean }>`
        select user_id, firm_user_id, granted_at is not null as granted from businesses
        where id = 'biz_g'`;
      expect(rows).toEqual([{ user_id: "user-c", firm_user_id: "user-a", granted: true }]);
    });
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

    await sql`insert into business_profiles (user_id, name, industry, profile)
      values ('user-b', 'legacy', 'dental', '{"businessId":"biz_default","staff":{}}'::jsonb)`;
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

  it("defaults to MAX_BUSINESSES_PER_ACCOUNT", async () => {
    for (let i = 0; i < MAX_BUSINESSES_PER_ACCOUNT; i += 1) {
      await saveBusinessRevision(sql, input("user-a", `biz_${i}`, null));
    }
    await expect(saveBusinessRevision(sql, input("user-a", "one_too_many", null))).rejects.toThrow(
      `${MAX_BUSINESSES_PER_ACCOUNT} businesses`,
    );
  });
});

describe("listBusinessSummaries", () => {
  it("lists every business the account holds, beyond the old limit of 50", async () => {
    // Rows written before the limit existed must stay reachable.
    for (let i = 0; i < 60; i += 1) {
      await db.pg.query(
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

  it("reads the process count and the latest map completeness from the profile", async () => {
    const profile = {
      customProcesses: [{ id: "a" }, { id: "b" }],
      mapHealthHistory: [{ score: 40 }, { score: 61 }],
      mapCompletenessHistory: [{ score: 40 }, { score: 72 }],
    };
    await saveBusinessRevision(sql, {
      ...input("user-a", "biz_1", null),
      profileJson: JSON.stringify(profile),
    });
    await saveBusinessRevision(sql, {
      ...input("user-a", "biz_2", null),
      profileJson: JSON.stringify({ customProcesses: "x", mapCompletenessHistory: [null] }),
    });
    // The retired map health series is never read as completeness.
    await saveBusinessRevision(sql, {
      ...input("user-a", "biz_3", null),
      profileJson: JSON.stringify({ mapHealthHistory: [{ score: 55 }] }),
    });
    const byId = new Map((await listBusinessSummaries(sql, "user-a")).map((b) => [b.id, b]));
    expect(byId.get("biz_1")).toMatchObject({
      processCount: 2,
      healthScore: 72,
      industry: "dental",
    });
    expect(byId.get("biz_2")).toMatchObject({ processCount: 0, healthScore: null });
    expect(byId.get("biz_3")).toMatchObject({ healthScore: null });
  });

  it("never lists another user's businesses", async () => {
    await saveBusinessRevision(sql, input("user-b", "biz_1", null));
    expect(await listBusinessSummaries(sql, "user-a")).toEqual([]);
  });
});

describe("checking a write against the stored profile", () => {
  it("hands the check the stored procedures, or null for a new business", async () => {
    const seen: unknown[] = [];
    const checkWrite = (previous: unknown) => {
      seen.push(previous);
    };
    const procedures = [{ id: "proc_1", steps: [{ text: "Count the till" }] }];
    await saveBusinessRevision(sql, {
      ...input("user-a", "biz_check", null, "First"),
      profileJson: JSON.stringify({ practiceName: "First", procedures }),
      checkWrite,
    });
    await saveBusinessRevision(sql, { ...input("user-a", "biz_check", 1, "Second"), checkWrite });
    await saveBusinessRevision(sql, { ...input("user-a", "biz_check", 2, "Third"), checkWrite });
    // A stored profile without procedures reads as one with none.
    expect(seen).toEqual([null, { procedures }, {}]);
  });

  it("still returns the whole stored profile on a conflict", async () => {
    await saveBusinessRevision(sql, input("user-a", "biz_check", null, "First"));
    const stale = await saveBusinessRevision(sql, input("user-a", "biz_check", 5, "Stale"));
    expect(stale).toMatchObject({
      ok: false,
      existing: { profile: { practiceName: "First", businessId: "biz_check" } },
    });
  });

  it("writes nothing, and keeps no history, when the check refuses", async () => {
    await saveBusinessRevision(sql, input("user-a", "biz_refused", null, "Kept"));
    const refuse = () => {
      throw new Error("refused");
    };
    await expect(
      saveBusinessRevision(sql, {
        ...input("user-a", "biz_refused", 1, "Replaced"),
        checkWrite: refuse,
      }),
    ).rejects.toThrow("refused");
    await expect(
      saveBusinessRevision(sql, { ...input("user-a", "biz_new", null), checkWrite: refuse }),
    ).rejects.toThrow("refused");
    expect(await revisionOf("user-a", "biz_refused")).toBe(1);
    expect(await revisionOf("user-a", "biz_new")).toBeNull();
    const rows = await sql<{ name: string }>`
      select name from businesses where user_id = 'user-a' and id = 'biz_refused'`;
    expect(rows[0].name).toBe("Kept");
    expect(await listBusinessHistory(sql, "user-a", "biz_refused")).toEqual([]);
  });
});
