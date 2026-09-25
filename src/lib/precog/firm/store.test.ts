import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { openTestDb, type TestDb } from "@/test/pglite";
import {
  acceptInvite,
  createInvite,
  FirmMembershipError,
  insertReviewEvent,
  leaveFirm,
  listClientEngagements,
  listInvites,
  listMembers,
  listReviewEvents,
  loadFirmFor,
  peekInvite,
  removeMember,
  saveFirm,
  setMemberRole,
} from "./store";

let db: TestDb;

beforeAll(async () => {
  db = await openTestDb();
}, 60_000);

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.clear(
    "review_events",
    "engagement_marks",
    "firm_invites",
    "firm_members",
    "firms",
    "businesses",
    '"user"',
  );
  for (const id of ["ua", "ub", "uc"]) {
    await db.seedUser(id);
    await db.pg.query(
      `insert into businesses (id, user_id, name, industry, profile, revision)
       values ('biz_1', $1, $2, 'general', '{}'::jsonb, 1)`,
      [id, `Client ${id.toUpperCase()}`],
    );
  }
});

describe("firm client isolation", () => {
  it("lists only the signed-in account's clients and review log", async () => {
    await saveFirm(db.sql, "ua", "North Advisors", "assessment");
    await insertReviewEvent(
      db.sql,
      "ua",
      {
        businessId: "biz_1",
        period: "2026-09",
        itemKey: "bank_statement",
        ownerName: "Ada",
        dueOn: "2026-10-10",
        result: "done",
        notes: "Statement opened",
      },
      "ua",
    );
    await insertReviewEvent(
      db.sql,
      "ub",
      {
        businessId: "biz_1",
        period: "2026-09",
        itemKey: "new_vendors",
        ownerName: "Bea",
        dueOn: "2026-10-10",
        result: "exception",
        notes: "Other firm",
      },
      "ub",
    );
    const clients = await listClientEngagements(db.sql, "ua", "ua");
    expect(clients.map((c) => c.name)).toEqual(["Client UA"]);
    expect(clients[0].lastReviewAt).toBeTruthy();
    const events = await listReviewEvents(db.sql, "ua", "biz_1");
    expect(events.map((e) => [e.notes, e.recordedByName])).toEqual([["Statement opened", "ua"]]);
    expect((await listReviewEvents(db.sql, "ub", "biz_1")).map((e) => e.notes)).toEqual([
      "Other firm",
    ]);
  });
});

describe("firm membership", () => {
  it("the owner's businesses become the firm's clients and the owner is a member", async () => {
    const firm = await saveFirm(db.sql, "ua", "North Advisors", "assessment");
    expect(firm.role).toBe("owner");
    expect((await listMembers(db.sql, "ua")).map((m) => [m.userId, m.role])).toEqual([
      ["ua", "owner"],
    ]);
    const rows = await db.sql<{ firm_user_id: string }>`
      select firm_user_id from businesses where user_id = 'ua'
    `;
    expect(rows[0].firm_user_id).toBe("ua");
  });

  it("an invitation admits a member with the given role, once, and shares the clients", async () => {
    await saveFirm(db.sql, "ua", "North Advisors", "assessment");
    const invite = await createInvite(db.sql, {
      firmUserId: "ua",
      email: "Bea@Example.test",
      role: "reviewer",
      token: "tok_1",
    });
    expect(invite.email).toBe("bea@example.test");
    expect((await listInvites(db.sql, "ua")).map((i) => i.token)).toEqual(["tok_1"]);
    expect(await peekInvite(db.sql, "tok_1")).toEqual({
      firmName: "North Advisors",
      role: "reviewer",
      email: "bea@example.test",
    });

    const joined = await acceptInvite(db.sql, "tok_1", "ub");
    expect([joined.firmUserId, joined.role]).toEqual(["ua", "reviewer"]);
    expect(await listInvites(db.sql, "ua")).toEqual([]);
    await expect(acceptInvite(db.sql, "tok_1", "uc")).rejects.toBeInstanceOf(FirmMembershipError);

    const clients = await listClientEngagements(db.sql, "ub", "ua");
    expect(clients.map((c) => [c.name, c.shared])).toEqual([
      ["Client UB", false],
      ["Client UA", true],
    ]);
  });

  it("one account belongs to one firm at a time", async () => {
    await saveFirm(db.sql, "ua", "North", "assessment");
    await saveFirm(db.sql, "uc", "South", "assessment");
    await createInvite(db.sql, {
      firmUserId: "ua",
      email: "b@x.test",
      role: "preparer",
      token: "t1",
    });
    await createInvite(db.sql, {
      firmUserId: "uc",
      email: "b@x.test",
      role: "preparer",
      token: "t2",
    });
    await acceptInvite(db.sql, "t1", "ub");
    await expect(acceptInvite(db.sql, "t2", "ub")).rejects.toBeInstanceOf(FirmMembershipError);
    await expect(saveFirm(db.sql, "ub", "Mine", "assessment")).rejects.toBeInstanceOf(
      FirmMembershipError,
    );
    expect((await loadFirmFor(db.sql, "ub"))?.name).toBe("North");
  });

  it("roles change, members leave or are removed, the owner stays", async () => {
    await saveFirm(db.sql, "ua", "North", "assessment");
    await createInvite(db.sql, {
      firmUserId: "ua",
      email: "b@x.test",
      role: "preparer",
      token: "t1",
    });
    await acceptInvite(db.sql, "t1", "ub");
    await setMemberRole(db.sql, "ua", "ub", "reviewer");
    expect((await loadFirmFor(db.sql, "ub"))?.role).toBe("reviewer");
    await expect(removeMember(db.sql, "ua", "ua")).rejects.toBeInstanceOf(FirmMembershipError);
    await expect(leaveFirm(db.sql, "ua", "ua")).rejects.toBeInstanceOf(FirmMembershipError);
    await removeMember(db.sql, "ua", "ub");
    expect(await loadFirmFor(db.sql, "ub")).toBeNull();
    expect((await listMembers(db.sql, "ua")).map((m) => m.userId)).toEqual(["ua"]);
  });
});
