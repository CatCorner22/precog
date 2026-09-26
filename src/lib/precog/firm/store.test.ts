import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { openTestDb, type TestDb } from "@/test/pglite";
import { resolveBusinessOwner } from "../business-store";
import {
  acceptInvite,
  createInvite,
  FirmMembershipError,
  insertReviewEvent,
  leaveFirm,
  listClientEngagements,
  listInvites,
  listMembers,
  loadFirmFor,
  peekInvite,
  removeMember,
  saveFirm,
  setMemberRole,
  setOwnerEmail,
  upsertEngagementMark,
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
    const events = await db.pg.query<{ user_id: string; notes: string; recorded_by: string }>(
      "select user_id, notes, recorded_by from review_events order by user_id",
    );
    expect(events.rows.map((e) => [e.user_id, e.notes, e.recorded_by])).toEqual([
      ["ua", "Statement opened", "ua"],
      ["ub", "Other firm", "ub"],
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

describe("firm membership edge cases", () => {
  async function invite(
    token: string,
    email = "b@x.test",
    role: "preparer" | "reviewer" = "preparer",
  ) {
    return createInvite(db.sql, { firmUserId: "ua", email, role, token });
  }

  it("a removed or departed member takes their own businesses out of the firm", async () => {
    await saveFirm(db.sql, "ua", "North", "assessment");
    await invite("t1");
    await acceptInvite(db.sql, "t1", "ub");
    await db.pg.query("update businesses set firm_user_id = 'ua' where user_id = 'ub'");
    expect(await resolveBusinessOwner(db.sql, "ua", "biz_1")).toBe("ua");
    await db.pg.query("delete from businesses where user_id = 'ua'");
    expect(await resolveBusinessOwner(db.sql, "ua", "biz_1")).toBe("ub");

    await removeMember(db.sql, "ua", "ub");
    expect(await resolveBusinessOwner(db.sql, "ua", "biz_1")).toBeNull();
    const rows = await db.pg.query<{ firm_user_id: string | null }>(
      "select firm_user_id from businesses where user_id = 'ub'",
    );
    expect(rows.rows[0].firm_user_id).toBeNull();

    await invite("t2", "c@x.test");
    await acceptInvite(db.sql, "t2", "uc");
    await db.pg.query("update businesses set firm_user_id = 'ua' where user_id = 'uc'");
    await leaveFirm(db.sql, "ua", "uc");
    expect(await resolveBusinessOwner(db.sql, "ua", "biz_1")).toBeNull();
  }, 60_000);

  it("the owner who opens an invitation to their own firm stays the owner", async () => {
    await saveFirm(db.sql, "ua", "North", "assessment");
    await invite("t1");
    await expect(acceptInvite(db.sql, "t1", "ua")).rejects.toBeInstanceOf(FirmMembershipError);
    expect((await loadFirmFor(db.sql, "ua"))?.role).toBe("owner");
    // A stray membership row is healed on the next save.
    await db.pg.query("update firm_members set role = 'preparer' where member_user_id = 'ua'");
    await saveFirm(db.sql, "ua", "North", null);
    expect((await loadFirmFor(db.sql, "ua"))?.role).toBe("owner");
  });

  it("a second invitation to the same address returns the open one, and a new role replaces it", async () => {
    await saveFirm(db.sql, "ua", "North", "assessment");
    const first = await invite("t1", "Bea@Firm.test");
    const again = await invite("t2", "bea@firm.test");
    expect(again.token).toBe(first.token);
    const reviewer = await invite("t3", "bea@firm.test", "reviewer");
    expect((await listInvites(db.sql, "ua")).map((i) => [i.token, i.role])).toEqual([
      [reviewer.token, "reviewer"],
    ]);
  });

  it("open invitations count toward the member limit, and acceptance re-checks it", async () => {
    await saveFirm(db.sql, "ua", "North", "assessment");
    for (let i = 0; i < 24; i += 1) await invite(`t${i}`, `p${i}@x.test`);
    await expect(invite("t_over", "over@x.test")).rejects.toBeInstanceOf(FirmMembershipError);

    await db.pg.query("delete from firm_invites");
    for (let i = 0; i < 24; i += 1) {
      await db.seedUser(`m${i}`);
      await db.pg.query(
        "insert into firm_members (firm_user_id, member_user_id, role) values ('ua', $1, 'preparer')",
        [`m${i}`],
      );
    }
    await db.pg.query(
      `insert into firm_invites (token, firm_user_id, email, role, expires_at)
       values ('late', 'ua', 'late@x.test', 'preparer', now() + interval '1 day')`,
    );
    await expect(acceptInvite(db.sql, "late", "ub")).rejects.toBeInstanceOf(FirmMembershipError);
    expect(await loadFirmFor(db.sql, "ub")).toBeNull();
  });

  it("a saved plan stays when the caller passes none", async () => {
    await saveFirm(db.sql, "ua", "North", "monthly");
    expect((await saveFirm(db.sql, "ua", "North Advisors", null)).plan).toBe("monthly");
    expect((await saveFirm(db.sql, "ub", "South", null)).plan).toBe("assessment");
  });
});

describe("client engagement figures", () => {
  it("a client nobody has counted shows no conflict figure instead of zero", async () => {
    await saveFirm(db.sql, "ua", "North", "assessment");
    expect((await listClientEngagements(db.sql, "ua", "ua"))[0].openFindings).toBeNull();
    await setOwnerEmail(db.sql, "ua", "biz_1", "owner@client.test");
    expect((await listClientEngagements(db.sql, "ua", "ua"))[0].openFindings).toBeNull();
    await upsertEngagementMark(db.sql, "ua", {
      businessId: "biz_1",
      openFindings: 0,
      acceptedFindings: 2,
    });
    const [row] = await listClientEngagements(db.sql, "ua", "ua");
    expect([row.openFindings, row.ownerEmail]).toEqual([0, "owner@client.test"]);
  });
});
