import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { openSafetyDb, type SafetyDb } from "@/test/safety-db";
import { inTransaction } from "@/lib/sql-transaction";
import {
  BusinessUnavailableError,
  saveBusinessRevision,
  deleteBusinessRow,
  restoreBusinessRow,
  purgeDeletedBusinesses,
  loadActiveBusiness,
  resolveBusinessOwner,
} from "./business-store";

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
  await db.pg.exec('drop trigger if exists fail_pointer on business_profiles; delete from "user";');
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
    expect(await saveBusinessRevision(db.sql, input("one", 3))).toMatchObject({
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
    await db.sql`insert into firm_members (firm_user_id, member_user_id) values ('a', 'b')`;
    await saveBusinessRevision(db.sql, { ...input("one", null), firmUserId: "a" });
    await saveBusinessRevision(db.sql, { ...input("one", 1), savedBy: "b" });
    expect((await counts()).pointers).toBe(2);
    await deleteBusinessRow(db.sql, "a", "one", "b");
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
