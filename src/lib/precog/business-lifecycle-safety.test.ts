import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Sql } from "@/lib/db";
import { openSafetyDb, type SafetyDb } from "@/test/safety-db";
import { AUDIT_BYPASS_SQL } from "@/test/pglite";
import { inTransaction, toSql } from "@/lib/sql-transaction";
import {
  BusinessUnavailableError,
  saveBusinessRevision,
  deleteBusinessRow,
  restoreBusinessRow,
  purgeDeletedBusinesses,
  loadActiveBusiness,
  resolveBusinessOwner,
} from "./business-store";
import { deleteAccountRows } from "./account-store";
import { saveEngagement, setEngagementStatus } from "./firm/engagement-store";
import { lockReportVersion } from "./firm/reports";
import { removeMember } from "./firm/store";

let db: SafetyDb;
const input = (businessId: string, baseRevision: number | null, name = "Practice") => ({
  userId: "a",
  businessId,
  baseRevision,
  name,
  industry: "dental",
  profileJson: JSON.stringify({ businessId, practiceName: name, staff: {} }),
  activate: true,
});
beforeAll(async () => {
  db = await openSafetyDb();
}, 60_000);
afterAll(() => db.close());
beforeEach(async () => {
  // Under the audit bypass, on PGlite and on real Postgres: a firm owner's
  // user row cascades into the activity log.
  await db.pg.exec(
    `begin; ${AUDIT_BYPASS_SQL} drop trigger if exists fail_pointer on business_profiles; delete from "user"; commit;`,
  );
  await db.seedUser("a");
  await db.seedUser("b");
});
async function counts() {
  return (
    await db.sql<{ businesses: number; history: number; markers: number; pointers: number }>`
    select (select count(*)::int from businesses) businesses,
      (select count(*)::int from business_history) history,
      (select count(*)::int from business_deletion_markers) markers,
      (select count(*)::int from business_profiles) pointers`
  )[0];
}
async function breakPointer(operation: "insert or update" | "delete") {
  await db.pg
    .exec(`create or replace function fail_pointer_write() returns trigger language plpgsql as $$
    begin raise exception 'injected pointer failure'; end; $$;
    create trigger fail_pointer before ${operation} on business_profiles
    for each row execute function fail_pointer_write();`);
}
describe("transactional business safety", () => {
  it("never creates a missing row from a stale revision", async () => {
    await expect(saveBusinessRevision(db.sql, input("gone", 7))).rejects.toBeInstanceOf(
      BusinessUnavailableError,
    );
    expect(await counts()).toEqual({ businesses: 0, history: 0, markers: 0, pointers: 0 });
  });
  it("rolls back a first save when its pointer cannot be written", async () => {
    await breakPointer("insert or update");
    await expect(saveBusinessRevision(db.sql, input("first", null))).rejects.toThrow(
      "injected pointer failure",
    );
    expect(await counts()).toEqual({ businesses: 0, history: 0, markers: 0, pointers: 0 });
  });
  it("rolls back the profile, revision and history when an update's pointer fails", async () => {
    await saveBusinessRevision(db.sql, input("one", null, "original"));
    await breakPointer("insert or update");
    await expect(saveBusinessRevision(db.sql, input("one", 1, "changed"))).rejects.toThrow();
    expect(await loadActiveBusiness(db.sql, "a")).toMatchObject({ name: "original", revision: 1 });
    expect((await counts()).history).toBe(0);
  });
  it("rolls back deletion and its marker when pointer removal fails", async () => {
    await saveBusinessRevision(db.sql, input("one", null));
    await breakPointer("delete");
    await expect(deleteBusinessRow(db.sql, "a", "one")).rejects.toThrow();
    expect(await loadActiveBusiness(db.sql, "a")).toMatchObject({ revision: 1 });
    expect((await counts()).markers).toBe(0);
  });
  it("rejects stale AND null-revision saves while deleted and after content is purged", async () => {
    await saveBusinessRevision(db.sql, input("one", null));
    await deleteBusinessRow(db.sql, "a", "one");
    for (const revision of [1, null])
      await expect(saveBusinessRevision(db.sql, input("one", revision))).rejects.toThrow();
    await db.sql`update businesses set deleted_at = now() - interval '31 days'`;
    expect(await purgeDeletedBusinesses(db.sql)).toBe(1);
    for (const revision of [1, null])
      await expect(saveBusinessRevision(db.sql, input("one", revision))).rejects.toThrow();
    expect(await counts()).toEqual({ businesses: 0, history: 0, markers: 1, pointers: 0 });
    expect(await loadActiveBusiness(db.sql, "a")).toBeNull();
  });
  it("invalidates pre-delete revisions even after explicit restoration", async () => {
    await saveBusinessRevision(db.sql, input("one", null));
    await deleteBusinessRow(db.sql, "a", "one");
    expect(await restoreBusinessRow(db.sql, "a", "one")).toBe(true);
    expect((await counts()).markers).toBe(0);
    expect(await saveBusinessRevision(db.sql, input("one", 1))).toMatchObject({
      ok: false,
      existing: { revision: 3 },
    });
    expect(await saveBusinessRevision(db.sql, input("one", 3, "After restore"))).toMatchObject({
      ok: true,
      revision: 4,
    });
  });
  it("makes repeated deletes harmless and does not reset the retention date", async () => {
    await saveBusinessRevision(db.sql, input("one", null));
    await deleteBusinessRow(db.sql, "a", "one");
    const before = await db.sql`select deleted_at, revision from businesses`;
    await deleteBusinessRow(db.sql, "a", "one");
    expect(await db.sql`select deleted_at, revision from businesses`).toEqual(before);
  });
  it("keeps deletion markers scoped to the account and removes them with account deletion", async () => {
    await saveBusinessRevision(db.sql, input("one", null));
    await deleteBusinessRow(db.sql, "a", "one");
    expect((await saveBusinessRevision(db.sql, { ...input("one", null), userId: "b" })).ok).toBe(
      true,
    );
    await db.sql`delete from "user" where id = 'a'`;
    expect((await counts()).markers).toBe(0);
    expect((await counts()).businesses).toBe(1);
  });
  it("cannot create a new record under a colleague's ownership", async () => {
    await expect(
      saveBusinessRevision(db.sql, { ...input("one", null), savedBy: "b" }),
    ).rejects.toThrow();
  });
  it("rechecks firm membership rather than trusting a previously resolved owner", async () => {
    await db.sql`insert into firms (user_id, name) values ('a', 'Firm')`;
    await db.sql`insert into firm_members (firm_user_id, member_user_id) values ('a', 'b')`;
    await saveBusinessRevision(db.sql, { ...input("one", null), firmUserId: "a" });
    expect(await resolveBusinessOwner(db.sql, "b", "one")).toBe("a");
    await db.sql`delete from firm_members where member_user_id = 'b'`;
    await expect(
      saveBusinessRevision(db.sql, { ...input("one", 1), savedBy: "b" }),
    ).rejects.toThrow();
    await expect(deleteBusinessRow(db.sql, "a", "one", "b")).rejects.toThrow();
  });
  it("removes colleagues' exact active pointers together with a shared business", async () => {
    await db.sql`insert into firms (user_id, name) values ('a', 'Firm')`;
    await db.sql`insert into firm_members (firm_user_id, member_user_id, role) values ('a', 'b', 'reviewer')`;
    await saveBusinessRevision(db.sql, { ...input("one", null), firmUserId: "a" });
    await saveBusinessRevision(db.sql, { ...input("one", 1), savedBy: "b" });
    expect((await counts()).pointers).toBe(2);
    // A reviewer cannot delete a client; the owner can, and the reviewer's pointer goes too.
    await expect(deleteBusinessRow(db.sql, "a", "one", "b")).rejects.toMatchObject({
      status: 403,
      message: "Only the firm owner can delete or restore a client.",
    });
    expect((await counts()).pointers).toBe(2);
    await deleteBusinessRow(db.sql, "a", "one", "a");
    expect((await counts()).pointers).toBe(0);
    expect(await resolveBusinessOwner(db.sql, "b", "one", true)).toBe("a");
  });
  it("does not treat a modern empty pointer as a legacy full profile", async () => {
    await saveBusinessRevision(db.sql, input("one", null));
    await db.sql`delete from businesses`;
    expect(await loadActiveBusiness(db.sql, "a")).toBeNull();
  });
  it("admits exactly one of 32 simultaneous edits from the same revision", async () => {
    await saveBusinessRevision(db.sql, input("race", null));
    const results = await Promise.all(
      Array.from({ length: 32 }, (_, i) =>
        saveBusinessRevision(db.sql, input("race", 1, `Writer ${i}`)),
      ),
    );
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect((await counts()).history).toBe(1);
    expect(await loadActiveBusiness(db.sql, "a")).toMatchObject({ revision: 2 });
  });
  it("a concurrent save cannot undo deletion", async () => {
    await saveBusinessRevision(db.sql, input("race", null));
    await Promise.allSettled([
      saveBusinessRevision(db.sql, input("race", 1, "changed")),
      deleteBusinessRow(db.sql, "a", "race"),
    ]);
    expect(await resolveBusinessOwner(db.sql, "a", "race")).toBeNull();
    expect((await counts()).markers).toBe(1);
  });
  it("enforces the creation cap under simultaneous requests", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) => saveBusinessRevision(db.sql, input(`one${i}`, null), 3)),
    );
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(3);
    expect((await counts()).businesses).toBe(3);
  });
  it("restoration respects the business limit", async () => {
    await saveBusinessRevision(db.sql, input("one", null));
    await deleteBusinessRow(db.sql, "a", "one");
    await saveBusinessRevision(db.sql, input("two", null));
    await expect(restoreBusinessRow(db.sql, "a", "one", "a", 1)).rejects.toThrow("1 businesses");
    expect((await counts()).markers).toBe(1);
  });
  it("rejects invalid revision numbers before attempting any mutation", async () => {
    for (const value of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
      await expect(saveBusinessRevision(db.sql, input("one", value))).rejects.toThrow("revision");
    expect((await counts()).businesses).toBe(0);
  });
  it("nested operations cannot commit when an inner failure was caught", async () => {
    await expect(
      inTransaction(db.sql, async (tx) => {
        await saveBusinessRevision(tx, input("one", null));
        try {
          await inTransaction(tx, async () => {
            throw new Error("inner failure");
          });
        } catch {
          /* deliberate */
        }
      }),
    ).rejects.toThrow("Transaction aborted");
    expect((await counts()).businesses).toBe(0);
  });
  it("does not restore expired content merely because the purge has not run", async () => {
    await saveBusinessRevision(db.sql, input("one", null));
    await deleteBusinessRow(db.sql, "a", "one");
    await db.sql`update businesses set deleted_at = now() - interval '31 days'`;
    expect(await restoreBusinessRow(db.sql, "a", "one")).toBe(false);
    expect((await counts()).markers).toBe(1);
  });
  it("rechecks firm membership when creating a business after membership was removed", async () => {
    await db.sql`insert into firms (user_id, name) values ('a', 'Firm')`;
    await expect(
      saveBusinessRevision(db.sql, { ...input("one", null), userId: "b", firmUserId: "a" }),
    ).rejects.toThrow();
    expect((await counts()).businesses).toBe(0);
  });
});
describe("the activity log and locked versions on the database (migration 0048)", () => {
  it("lets a firm owner whose firm has activity-log rows delete their account", async () => {
    await db.pg.exec(`
      insert into firms (user_id, name) values ('a', 'Firm');
      insert into firm_members (firm_user_id, member_user_id, role) values ('a', 'a', 'owner');
      insert into firm_audit_log (firm_user_id, actor_user_id, event)
        values ('a', 'a', 'letterhead_changed'), ('a', 'b', 'member_left');
    `);
    await deleteAccountRows(db.sql, "a");
    const left = await db.sql<{ n: number }>`select count(*)::int as n from firm_audit_log`;
    expect(left[0].n).toBe(0);
  });
  it("hands a departing member's client with a locked version to the owner through the frozen trigger", async () => {
    await db.pg.exec(`
      insert into firms (user_id, name) values ('a', 'Firm');
      insert into firm_members (firm_user_id, member_user_id, role)
        values ('a', 'a', 'owner'), ('a', 'b', 'preparer');
    `);
    await saveBusinessRevision(db.sql, { ...input("client", null), userId: "b", firmUserId: "a" });
    await lockReportVersion(db.sql, {
      ownerUserId: "b",
      businessId: "client",
      preparedBy: "b",
      scopeNote: "Year end",
      id: "rv_1",
    });
    await removeMember(db.sql, "a", "b");
    const versions = await db.sql<{ user_id: string; business_id: string; scope_note: string }>`
      select user_id, business_id, scope_note from report_versions
    `;
    expect(versions).toEqual([{ user_id: "a", business_id: "client", scope_note: "Year end" }]);
    await expect(
      db.sql`update report_versions set scope_note = 'Changed' where id = 'rv_1'`,
    ).rejects.toThrow("a locked report version keeps what it printed");
  });
});

// Real connections only: the embedded database runs one statement at a time,
// so neither side could wait on the other. CI runs this block on PostgreSQL.
describe.runIf(process.env.PRECOG_LIFECYCLE_POSTGRES === "1")(
  "a member's departure while the firm owner changes a client that member set up",
  () => {
    function signal() {
      let resolve!: () => void;
      const promise = new Promise<void>((done) => {
        resolve = done;
      });
      return { promise, resolve };
    }
    /** Marks every statement, so the test can see this request wait on a lock. */
    function taggedSql(sql: Sql, tag: string): Sql {
      const wrapped = toSql(<T>(text: string, params: unknown[]) =>
        sql.query<T>(`/* ${tag} */ ${text}`, params),
      );
      wrapped.transaction = (work) => inTransaction(sql, (tx) => work(taggedSql(tx, tag)));
      return wrapped;
    }
    /** Holds each transaction just after it locks a business row, until `release`. */
    function pausedAfterBusinessLock(sql: Sql, locked: () => void, release: Promise<void>): Sql {
      const wrapped = toSql(async <T>(text: string, params: unknown[]) => {
        const rows = await sql.query<T>(text, params);
        if (/from businesses\b[\s\S]*for update/i.test(text)) {
          locked();
          await release;
        }
        return rows;
      });
      wrapped.transaction = (work) =>
        inTransaction(sql, (tx) => work(pausedAfterBusinessLock(tx, locked, release)));
      return wrapped;
    }

    beforeEach(async () => {
      await db.pg.exec(`
        insert into firms (user_id, name) values ('a', 'Firm');
        insert into firm_members (firm_user_id, member_user_id, role)
          values ('a', 'a', 'owner'), ('a', 'b', 'preparer');
        insert into businesses (id, user_id, name, industry, profile, revision, firm_user_id)
          values ('client', 'b', 'Client', 'general', '{}'::jsonb, 1, 'a');
      `);
    });

    for (const write of ["end", "save"] as const) {
      for (const first of [false, true]) {
        it(`${write === "end" ? "ending" : "saving"} the engagement${first ? " for the first time" : ""} and the removal both finish`, async () => {
          if (!first)
            await db.sql`insert into engagement_marks (user_id, business_id) values ('b', 'client')`;
          const locked = signal();
          const release = signal();
          const paused = pausedAfterBusinessLock(db.sql, locked.resolve, release.promise);
          const writing = (
            write === "end"
              ? setEngagementStatus(paused, "b", "client", "ended", "a")
              : saveEngagement(paused, {
                  ownerUserId: "b",
                  businessId: "client",
                  actorUserId: "a",
                  scope: "Year end",
                  periodStart: null,
                  periodEnd: null,
                  preparerUserId: null,
                  reviewerUserId: null,
                })
          ).then(
            () => null,
            (error: unknown) => error,
          );
          await locked.promise;
          const tag = `departure_${randomUUID().replaceAll("-", "")}`;
          const removal = removeMember(taggedSql(db.sql, tag), "a", "b").then(
            (moved) => ({ moved, error: null }),
            (error: unknown) => ({ moved: null, error }),
          );
          try {
            await expect
              .poll(
                async () => {
                  const [row] = await db.sql<{ n: number }>`select count(*)::int as n
                    from pg_stat_activity
                    where query like ${`/* ${tag} */%`} and wait_event_type = 'Lock'`;
                  return row.n;
                },
                { timeout: 5_000, interval: 20 },
              )
              .toBeGreaterThan(0);
          } finally {
            release.resolve();
          }
          // Before the fix one of the two died with 40P01 (deadlock detected).
          expect(await writing).toBeNull();
          expect(await removal).toEqual({
            moved: [{ from: "client", to: "client", name: "Client" }],
            error: null,
          });
          const marks = await db.sql<{ user_id: string; status: string; scope: string }>`
            select user_id, status, scope from engagement_marks where business_id = 'client'
          `;
          expect(marks).toEqual([
            {
              user_id: "a",
              status: write === "end" ? "ended" : "active",
              scope: write === "save" ? "Year end" : "",
            },
          ]);
        });
      }
    }
  },
);
