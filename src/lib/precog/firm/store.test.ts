import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { openTestDb, type TestDb } from "@/test/pglite";
import { resolveBusinessOwner } from "../business-store";
import {
  acceptInvite,
  createInvite,
  digestAddressProblem,
  FirmMembershipError,
  insertReviewEvent,
  inviteFit,
  leaveFirm,
  listClientEngagements,
  listInvites,
  listMembers,
  loadFirmFor,
  maskEmail,
  MAX_OWNER_EMAIL_REQUESTS_PER_DAY,
  peekInvite,
  removeMember,
  saveFirm,
  saveFirmLetterhead,
  setMemberRole,
  setOwnerEmail,
  transferFirmOwnership,
  upsertEngagementMark,
} from "./store";
import {
  confirmOwnerEmail,
  findOwnerConsent,
  isOwnerConsentToken,
  stopOwnerEmail,
} from "../reminders/owner-consent";

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
    "business_profiles",
    "billing_accounts",
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
    const clients = await listClientEngagements(db.sql, "ua", "ua", "2026-09-20");
    expect(clients.map((c) => c.name)).toEqual(["Client UA"]);
    expect(clients[0].lastReviewAt).toBeTruthy();
    expect(clients[0]).toMatchObject({
      status: "active",
      endedAt: null,
      granted: false,
      period: "2026-09",
      thisMonthRecorded: 1,
      awaitingReview: 0,
    });
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
      email: "UB@Example.test",
      role: "reviewer",
      token: "tok_1",
    });
    expect(invite.email).toBe("ub@example.test");
    expect((await listInvites(db.sql, "ua")).map((i) => i.token)).toEqual(["tok_1"]);
    expect(await peekInvite(db.sql, "tok_1")).toEqual({
      firmName: "North Advisors",
      role: "reviewer",
      email: "u***@example.test",
    });

    const joined = await acceptInvite(db.sql, "tok_1", "ub");
    expect([joined.firm.firmUserId, joined.firm.role]).toEqual(["ua", "reviewer"]);
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
      email: "ub@example.test",
      role: "preparer",
      token: "t1",
    });
    await createInvite(db.sql, {
      firmUserId: "uc",
      email: "ub@example.test",
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
      email: "ub@example.test",
      role: "preparer",
      token: "t1",
    });
    await acceptInvite(db.sql, "t1", "ub");
    // The role held before comes back, for the activity log; nobody changed, null.
    expect(await setMemberRole(db.sql, "ua", "ub", "reviewer")).toBe("preparer");
    expect(await setMemberRole(db.sql, "ua", "uc", "reviewer")).toBeNull();
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
    email = "ub@example.test",
    role: "preparer" | "reviewer" = "preparer",
  ) {
    return createInvite(db.sql, { firmUserId: "ua", email, role, token });
  }

  const MOVED_ID = /^biz_1-[0-9a-f]{8}$/;

  it("a removed or departed member's firm clients stay with the firm under the owner", async () => {
    await saveFirm(db.sql, "ua", "North", "assessment");
    await invite("t1");
    await acceptInvite(db.sql, "t1", "ub");
    await db.pg.query("update businesses set firm_user_id = 'ua' where user_id = 'ub'");
    // A private business the member had before joining stays theirs.
    await db.pg.query(
      `insert into businesses (id, user_id, name, industry, profile, revision)
       values ('biz_private', 'ub', 'Private', 'general', '{}'::jsonb, 1)`,
    );
    // Child rows and a colleague's pointer, which follow the business.
    await db.pg.query(
      `insert into business_history (user_id, business_id, revision, name, industry, profile)
       values ('ub', 'biz_1', 1, 'Client UB', 'general', '{}'::jsonb)`,
    );
    await insertReviewEvent(
      db.sql,
      "ub",
      {
        businessId: "biz_1",
        period: "2026-09",
        itemKey: "bank_statement",
        ownerName: "Bea",
        dueOn: null,
        result: "done",
        notes: "",
      },
      "ua",
    );
    await db.pg.query(
      `insert into business_profiles (user_id, profile)
       values ('ua', '{"businessId":"biz_1","ownerUserId":"ub","pointerVersion":2}'::jsonb),
              ('ub', '{"businessId":"biz_1","ownerUserId":"ub","pointerVersion":2}'::jsonb)`,
    );
    expect(await resolveBusinessOwner(db.sql, "ua", "biz_1")).toBe("ua");

    const moved = await removeMember(db.sql, "ua", "ub");
    expect(moved).toEqual([
      { from: "biz_1", to: expect.stringMatching(MOVED_ID), name: "Client UB" },
    ]);
    const to = moved[0].to;
    // The owner's own biz_1 holds the id, so the moved one took a new address.
    expect(await resolveBusinessOwner(db.sql, "ua", "biz_1")).toBe("ua");
    expect(await resolveBusinessOwner(db.sql, "ua", to)).toBe("ua");
    expect(await resolveBusinessOwner(db.sql, "ub", to)).toBeNull();
    const rows = await db.pg.query<{
      id: string;
      user_id: string;
      firm_user_id: string | null;
      saved_by: string | null;
      revision: number;
    }>("select id, user_id, firm_user_id, saved_by, revision from businesses order by user_id, id");
    expect(rows.rows).toEqual([
      { id: "biz_1", user_id: "ua", firm_user_id: "ua", saved_by: null, revision: 1 },
      { id: to, user_id: "ua", firm_user_id: "ua", saved_by: "ub", revision: 2 },
      { id: "biz_private", user_id: "ub", firm_user_id: null, saved_by: null, revision: 1 },
      { id: "biz_1", user_id: "uc", firm_user_id: null, saved_by: null, revision: 1 },
    ]);
    const children = await db.pg.query<{ t: string; user_id: string; business_id: string }>(
      `select 'history' as t, user_id, business_id from business_history
       union all select 'review', user_id, business_id from review_events
       order by 1`,
    );
    expect(children.rows).toEqual([
      { t: "history", user_id: "ua", business_id: to },
      { t: "review", user_id: "ua", business_id: to },
    ]);
    const pointers = await db.pg.query<{ user_id: string; profile: Record<string, unknown> }>(
      "select user_id, profile from business_profiles order by user_id",
    );
    expect(pointers.rows).toEqual([
      { user_id: "ua", profile: { businessId: to, ownerUserId: "ua", pointerVersion: 2 } },
    ]);

    await invite("t2", "uc@example.test");
    await acceptInvite(db.sql, "t2", "uc");
    await db.pg.query("update businesses set firm_user_id = 'ua' where user_id = 'uc'");
    const left = await leaveFirm(db.sql, "ua", "uc");
    expect(left).toEqual([
      { from: "biz_1", to: expect.stringMatching(MOVED_ID), name: "Client UC" },
    ]);
    expect(await resolveBusinessOwner(db.sql, "ua", left[0].to)).toBe("ua");
    expect(await resolveBusinessOwner(db.sql, "uc", "biz_1")).toBeNull();
  }, 60_000);

  it("keeps the client's id when the owner holds nothing by it, and renames it over a deletion marker", async () => {
    await saveFirm(db.sql, "ua", "North", "assessment");
    await invite("t1");
    await acceptInvite(db.sql, "t1", "ub");
    await db.pg.query("update businesses set firm_user_id = 'ua' where user_id = 'ub'");
    await db.pg.query("delete from businesses where user_id = 'ua'");
    expect(await removeMember(db.sql, "ua", "ub")).toEqual([
      { from: "biz_1", to: "biz_1", name: "Client UB" },
    ]);
    expect(await resolveBusinessOwner(db.sql, "ua", "biz_1")).toBe("ua");

    // The owner holds only a deletion marker for biz_1 (a purged business):
    // the marker shares the key and outlives the purge, so the moved row is renamed.
    await db.pg.query("delete from businesses where user_id = 'ua'");
    await db.pg.query(
      "insert into business_deletion_markers (user_id, business_id) values ('ua', 'biz_1')",
    );
    await invite("t2", "uc@example.test");
    await acceptInvite(db.sql, "t2", "uc");
    await db.pg.query("update businesses set firm_user_id = 'ua' where user_id = 'uc'");
    const moved = await leaveFirm(db.sql, "ua", "uc");
    expect(moved[0].to).toMatch(MOVED_ID);
    expect(await resolveBusinessOwner(db.sql, "ua", moved[0].to)).toBe("ua");
    expect(await resolveBusinessOwner(db.sql, "ua", "biz_1")).toBeNull();
  }, 60_000);

  it("moves a deleted client and the markers of purged ones with the member's departure", async () => {
    await saveFirm(db.sql, "ua", "North", "assessment");
    await invite("t1");
    await acceptInvite(db.sql, "t1", "ub");
    await db.pg.query("delete from businesses where user_id = 'ua'");
    await db.pg.query(
      "update businesses set firm_user_id = 'ua', deleted_at = now() where user_id = 'ub'",
    );
    await db.pg.query(
      `insert into business_deletion_markers (user_id, business_id, firm_user_id)
       values ('ub', 'biz_1', 'ua'), ('ub', 'biz_purged', 'ua'), ('ub', 'biz_mine', null)`,
    );
    await removeMember(db.sql, "ua", "ub");
    const markers = await db.pg.query<{ user_id: string; business_id: string }>(
      "select user_id, business_id from business_deletion_markers order by 1, 2",
    );
    expect(markers.rows).toEqual([
      { user_id: "ua", business_id: "biz_1" },
      { user_id: "ua", business_id: "biz_purged" },
      { user_id: "ub", business_id: "biz_mine" },
    ]);
    expect(await resolveBusinessOwner(db.sql, "ua", "biz_1", true)).toBe("ua");
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
       values ('late', 'ua', 'ub@example.test', 'preparer', now() + interval '1 day')`,
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

describe("firm ownership transfer", () => {
  beforeEach(async () => {
    await saveFirm(db.sql, "ua", "North", "monthly");
    await createInvite(db.sql, {
      firmUserId: "ua",
      email: "ub@example.test",
      role: "preparer",
      token: "t1",
    });
    await acceptInvite(db.sql, "t1", "ub");
    await createInvite(db.sql, {
      firmUserId: "ua",
      email: "new@example.test",
      role: "reviewer",
      token: "open",
    });
    await db.pg.query("update businesses set firm_user_id = 'ua' where user_id in ('ua', 'ub')");
    await db.pg.query(
      "insert into business_deletion_markers (user_id, business_id, firm_user_id) values ('ub', 'biz_gone', 'ua')",
    );
    await db.pg.query(
      `insert into billing_accounts (user_id, stripe_customer_id, subscription_id, subscription_status)
       values ('ua', 'cus_1', 'sub_1', 'active')`,
    );
  });

  it("moves members, invitations, clients, markers and billing, and swaps the roles", async () => {
    await transferFirmOwnership(db.sql, "ua", "ub");
    expect(await loadFirmFor(db.sql, "ua")).toEqual({
      firmUserId: "ub",
      name: "North",
      plan: "monthly",
      role: "reviewer",
      letterhead: "",
      logoDataUrl: null,
      coverPage: true,
    });
    expect((await loadFirmFor(db.sql, "ub"))?.role).toBe("owner");
    expect((await listMembers(db.sql, "ub")).map((m) => [m.userId, m.role])).toEqual([
      ["ub", "owner"],
      ["ua", "reviewer"],
    ]);
    expect((await listInvites(db.sql, "ub")).map((i) => i.token)).toEqual(["open"]);
    const firms = await db.pg.query<{ user_id: string }>("select user_id from firms");
    expect(firms.rows).toEqual([{ user_id: "ub" }]);
    const clients = await db.pg.query<{ user_id: string; firm_user_id: string | null }>(
      "select user_id, firm_user_id from businesses order by user_id",
    );
    expect(clients.rows).toEqual([
      { user_id: "ua", firm_user_id: "ub" },
      { user_id: "ub", firm_user_id: "ub" },
      { user_id: "uc", firm_user_id: null },
    ]);
    const markers = await db.pg.query<{ firm_user_id: string | null }>(
      "select firm_user_id from business_deletion_markers",
    );
    expect(markers.rows).toEqual([{ firm_user_id: "ub" }]);
    const billing = await db.pg.query<{ user_id: string; stripe_customer_id: string }>(
      "select user_id, stripe_customer_id from billing_accounts",
    );
    expect(billing.rows).toEqual([{ user_id: "ub", stripe_customer_id: "cus_1" }]);
    // The old owner's own business is a firm client they hold as a member now.
    expect(await resolveBusinessOwner(db.sql, "ub", "biz_1")).toBe("ub");
    expect(
      (await listClientEngagements(db.sql, "ub", "ub")).map((c) => c.ownerUserId).sort(),
    ).toEqual(["ua", "ub"]);
  });

  it("carries the letterhead, logo and cover-page switch to the new owner's firm row", async () => {
    await saveFirmLetterhead(db.sql, "ua", {
      letterhead: "12 Elm St",
      logoDataUrl: "data:image/png;base64,iVBORw0KGgo=",
      coverPage: false,
    });
    await transferFirmOwnership(db.sql, "ua", "ub");
    expect(await loadFirmFor(db.sql, "ub")).toMatchObject({
      firmUserId: "ub",
      role: "owner",
      letterhead: "12 Elm St",
      logoDataUrl: "data:image/png;base64,iVBORw0KGgo=",
      coverPage: false,
    });
  });

  it("keeps the retention period and repoints client invitations and locked versions", async () => {
    await db.pg.exec(`
      update firms set retention_years = 10 where user_id = 'ua';
      update businesses set firm_user_id = 'ua', granted_at = now() where user_id = 'uc';
      insert into business_firm_grants (token, business_owner_id, business_id, invited_email,
          firm_user_id, expires_at, accepted_by, accepted_at)
        values ('g1', 'uc', 'biz_1', 'ua@example.test', 'ua', now() + interval '1 day', 'ua', now());
      insert into report_versions (id, user_id, business_id, version_no, profile, firm_user_id)
        values ('rv_1', 'uc', 'biz_1', 1, '{}'::jsonb, 'ua'),
          ('rv_2', 'ub', 'biz_1', 1, '{}'::jsonb, 'elsewhere');
    `);
    await transferFirmOwnership(db.sql, "ua", "ub");
    const firm = await db.pg.query<{ retention_years: number }>(
      "select retention_years from firms where user_id = 'ub'",
    );
    expect(firm.rows).toEqual([{ retention_years: 10 }]);
    const grants = await db.pg.query<{ firm_user_id: string | null }>(
      "select firm_user_id from business_firm_grants",
    );
    expect(grants.rows).toEqual([{ firm_user_id: "ub" }]);
    const versions = await db.pg.query<{ id: string; firm_user_id: string | null }>(
      "select id, firm_user_id from report_versions order by id",
    );
    expect(versions.rows).toEqual([
      { id: "rv_1", firm_user_id: "ub" },
      { id: "rv_2", firm_user_id: "elsewhere" },
    ]);
  });

  it("moves the firm's activity log with it, and leaves it when the transfer is refused", async () => {
    await db.pg.exec(`
      insert into firm_audit_log (firm_user_id, actor_user_id, actor_name, event)
        values ('ua', 'ua', 'ua', 'letterhead_changed'), ('ua', 'ub', 'ub', 'version_locked');
    `);
    await db.pg.query("update billing_accounts set subscription_status = 'past_due'");
    await expect(transferFirmOwnership(db.sql, "ua", "ub")).rejects.toThrow(/overdue/);
    const kept = await db.pg.query<{ firm_user_id: string }>(
      "select firm_user_id from firm_audit_log order by id",
    );
    expect(kept.rows).toEqual([{ firm_user_id: "ua" }, { firm_user_id: "ua" }]);
    await db.pg.query("update billing_accounts set subscription_status = 'active'");
    await transferFirmOwnership(db.sql, "ua", "ub");
    const moved = await db.pg.query<{ firm_user_id: string; event: string }>(
      "select firm_user_id, event from firm_audit_log order by id",
    );
    expect(moved.rows).toEqual([
      { firm_user_id: "ub", event: "letterhead_changed" },
      { firm_user_id: "ub", event: "version_locked" },
    ]);
    // Outside the transfer the log still refuses a change.
    await expect(
      db.pg.query("update firm_audit_log set firm_user_id = 'ua'"),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("refuses a non-member, a firm owner, and the owner themselves", async () => {
    await expect(transferFirmOwnership(db.sql, "ua", "uc")).rejects.toThrow(
      "uc is not a member of North.",
    );
    await db.pg.query("insert into firms (user_id, name) values ('uc', 'South')");
    await db.pg.query(
      "insert into firm_members (firm_user_id, member_user_id, role) values ('ua', 'uc', 'preparer')",
    );
    await expect(transferFirmOwnership(db.sql, "ua", "uc")).rejects.toThrow(
      "uc already owns a firm.",
    );
    await expect(transferFirmOwnership(db.sql, "ua", "ua")).rejects.toBeInstanceOf(
      FirmMembershipError,
    );
    expect((await loadFirmFor(db.sql, "ua"))?.role).toBe("owner");
  });

  it("refuses while the payment is overdue or disputed, or the member has a billing record", async () => {
    await db.pg.query("update billing_accounts set subscription_status = 'past_due'");
    await expect(transferFirmOwnership(db.sql, "ua", "ub")).rejects.toThrow(
      "The firm cannot change owner while its payment is overdue or a payment is disputed. Fix that in Manage billing first, or write to [SUPPORT EMAIL].",
    );
    await db.pg.query(
      "update billing_accounts set subscription_status = 'active', assessment_disputed_at = now()",
    );
    await expect(transferFirmOwnership(db.sql, "ua", "ub")).rejects.toThrow(/payment is disputed/);
    await db.pg.query("update billing_accounts set assessment_disputed_at = null");
    await db.pg.query("insert into billing_accounts (user_id) values ('ub')");
    await expect(transferFirmOwnership(db.sql, "ua", "ub")).rejects.toThrow(
      "ub already has a billing record, so Precog cannot move the firm's billing to them. Write to [SUPPORT EMAIL].",
    );
    expect((await loadFirmFor(db.sql, "ua"))?.role).toBe("owner");
    expect((await listMembers(db.sql, "ua")).map((m) => m.userId)).toEqual(["ua", "ub"]);
  });
});

describe("firm letterhead", () => {
  it("is empty with a cover page on a new firm, and the owner alone sets it", async () => {
    await saveFirm(db.sql, "ua", "North", "assessment");
    expect(await loadFirmFor(db.sql, "ua")).toMatchObject({
      letterhead: "",
      logoDataUrl: null,
      coverPage: true,
    });
    const saved = await saveFirmLetterhead(db.sql, "ua", {
      letterhead: "12 Elm St\n555-0100",
      logoDataUrl: "data:image/jpeg;base64,/9j/4AAQ",
      coverPage: false,
    });
    expect(saved).toMatchObject({
      firmUserId: "ua",
      role: "owner",
      letterhead: "12 Elm St\n555-0100",
      logoDataUrl: "data:image/jpeg;base64,/9j/4AAQ",
      coverPage: false,
    });
    // A member reads it; renaming the firm keeps it; a member or an account
    // with no firm cannot set one.
    await createInvite(db.sql, {
      firmUserId: "ua",
      email: "ub@example.test",
      role: "preparer",
      token: "t1",
    });
    await acceptInvite(db.sql, "t1", "ub");
    expect((await loadFirmFor(db.sql, "ub"))?.letterhead).toBe("12 Elm St\n555-0100");
    expect((await saveFirm(db.sql, "ua", "North Advisors", null)).letterhead).toBe(
      "12 Elm St\n555-0100",
    );
    await expect(
      saveFirmLetterhead(db.sql, "ub", { letterhead: "x", logoDataUrl: null, coverPage: true }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      saveFirmLetterhead(db.sql, "uc", { letterhead: "x", logoDataUrl: null, coverPage: true }),
    ).rejects.toMatchObject({ status: 404 });
    expect((await loadFirmFor(db.sql, "ua"))?.letterhead).toBe("12 Elm St\n555-0100");
  });
});

describe("client engagement figures", () => {
  it("a client nobody has counted shows no conflict figure instead of zero", async () => {
    await saveFirm(db.sql, "ua", "North", "assessment");
    expect((await listClientEngagements(db.sql, "ua", "ua"))[0].openFindings).toBeNull();
    await setOwnerEmail(db.sql, "ua", "biz_1", "owner@client.test", "ua");
    expect((await listClientEngagements(db.sql, "ua", "ua"))[0].openFindings).toBeNull();
    await upsertEngagementMark(db.sql, "ua", {
      businessId: "biz_1",
      openFindings: 0,
      acceptedFindings: 2,
    });
    const [row] = await listClientEngagements(db.sql, "ua", "ua");
    expect([row.openFindings, row.ownerEmail]).toEqual([0, "owner@client.test"]);
  });

  async function review(owner: string, period: string, itemKey: string) {
    await db.pg.query(
      `insert into review_events (user_id, business_id, period, item_key, owner_name, result, recorded_by)
       values ($1, 'biz_1', $2, $3, 'Ada', 'done', $1)`,
      [owner, period, itemKey],
    );
  }

  it("counts the month's checks recorded, each check once, for the server's month only", async () => {
    await saveFirm(db.sql, "ua", "North", "assessment");
    await review("ua", "2026-10", "bank_statement");
    await review("ua", "2026-10", "bank_statement");
    await review("ua", "2026-10", "cleared_checks");
    await review("ua", "2026-10", "new_vendors");
    await review("ua", "2026-09", "payroll_headcount");
    const [row] = await listClientEngagements(db.sql, "ua", "ua", "2026-10-12");
    expect([row.period, row.thisMonthRecorded]).toEqual(["2026-10", 3]);
    const [next] = await listClientEngagements(db.sql, "ua", "ua", "2026-11-02");
    expect([next.period, next.thisMonthRecorded]).toEqual(["2026-11", 0]);
  });

  it("says when an engagement ended and when the business is its owner's", async () => {
    await saveFirm(db.sql, "ua", "North", "assessment");
    await db.pg.query(
      `insert into engagement_marks (user_id, business_id, status, ended_at)
       values ('ua', 'biz_1', 'ended', '2026-09-30T12:00:00Z')`,
    );
    await db.pg.query(
      "update businesses set firm_user_id = 'ua', granted_at = now() where user_id = 'uc'",
    );
    const rows = await listClientEngagements(db.sql, "ua", "ua");
    const own = rows.find((r) => r.ownerUserId === "ua")!;
    const client = rows.find((r) => r.ownerUserId === "uc")!;
    expect([own.status, own.endedAt, own.granted]).toEqual([
      "ended",
      "2026-09-30T12:00:00.000Z",
      false,
    ]);
    expect([client.status, client.endedAt, client.granted, client.shared]).toEqual([
      "active",
      null,
      true,
      true,
    ]);
  });

  it("counts versions awaiting review: requested, neither reviewed nor returned, this firm's only", async () => {
    await saveFirm(db.sql, "ua", "North", "assessment");
    await db.pg.query(
      "update businesses set firm_user_id = 'ua', granted_at = now() where user_id = 'uc'",
    );
    await db.pg.query(`
      insert into report_versions (id, user_id, business_id, version_no, profile, firm_user_id,
        review_requested_at, reviewed_at, returned_at)
      values
        ('a1', 'ua', 'biz_1', 1, '{}'::jsonb, 'ua', now(), null, null),
        ('a2', 'ua', 'biz_1', 2, '{}'::jsonb, null, now(), null, null),
        ('a3', 'ua', 'biz_1', 3, '{}'::jsonb, 'ua', now(), now(), null),
        ('a4', 'ua', 'biz_1', 4, '{}'::jsonb, 'ua', now(), null, now()),
        ('a5', 'ua', 'biz_1', 5, '{}'::jsonb, 'ua', null, null, null),
        ('c1', 'uc', 'biz_1', 1, '{}'::jsonb, 'ua', now(), null, null),
        ('c2', 'uc', 'biz_1', 2, '{}'::jsonb, 'elsewhere', now(), null, null),
        ('c3', 'uc', 'biz_1', 3, '{}'::jsonb, null, now(), null, null)
    `);
    const rows = await listClientEngagements(db.sql, "ua", "ua");
    // Own client: a1 and a2 (locked before versions named their firm). The
    // granted client: c1 only; c2 was locked for a previous firm and c3 for
    // no firm before the grant.
    expect(rows.find((r) => r.ownerUserId === "ua")!.awaitingReview).toBe(2);
    expect(rows.find((r) => r.ownerUserId === "uc")!.awaitingReview).toBe(1);
  });
});

describe("invitation and the accepting account's address", () => {
  beforeEach(async () => {
    await saveFirm(db.sql, "ua", "North", "assessment");
    await createInvite(db.sql, {
      firmUserId: "ua",
      email: "alice@cpa.test",
      role: "preparer",
      token: "t1",
    });
  });

  it("refuses an account whose confirmed address is another one and keeps the invitation open", async () => {
    expect(await inviteFit(db.sql, "t1", "ub")).toEqual({
      fit: "mismatch",
      accountEmail: "ub@example.test",
    });
    await expect(acceptInvite(db.sql, "t1", "ub")).rejects.toThrow(
      /sent this invitation to a\*\*\*@cpa\.test/,
    );
    await expect(acceptInvite(db.sql, "t1", "ub")).rejects.toBeInstanceOf(FirmMembershipError);
    expect(await peekInvite(db.sql, "t1")).not.toBeNull();
    expect(await loadFirmFor(db.sql, "ub")).toBeNull();
  });

  it("admits the invited address without asking", async () => {
    await db.pg.query(`update "user" set email = 'alice@cpa.test' where id = 'ub'`);
    expect((await inviteFit(db.sql, "t1", "ub"))?.fit).toBe("match");
    expect((await acceptInvite(db.sql, "t1", "ub")).firm.name).toBe("North");
  });

  it("refuses an address Precog cannot vouch for, and keeps the invitation open", async () => {
    await db.pg.query(`update "user" set "emailVerified" = false where id = 'ub'`);
    expect((await inviteFit(db.sql, "t1", "ub"))?.fit).toBe("confirm");
    await expect(acceptInvite(db.sql, "t1", "ub")).rejects.toThrow(/cannot vouch for this account/);
    await expect(acceptInvite(db.sql, "t1", "ub")).rejects.toThrow(
      "Precog cannot vouch for this account's address. Joining a firm needs a confirmed address that is the invited one: sign in with Google under a***@cpa.test, or with an email-and-password account you have confirmed, then open the invitation again.",
    );
    expect(await peekInvite(db.sql, "t1")).not.toBeNull();
    expect(await loadFirmFor(db.sql, "ub")).toBeNull();
  });

  it("treats an X-only account's address as one Precog cannot vouch for", async () => {
    await db.pg.query(
      `insert into account (id, "accountId", "providerId", "userId", "createdAt", "updatedAt")
       values ('acc_x', 'x-1', 'grok-x', 'ub', now(), now())`,
    );
    expect((await inviteFit(db.sql, "t1", "ub"))?.fit).toBe("confirm");
    expect(await digestAddressProblem(db.sql, "ub")).toBe("x_only");
  });

  it("says why the digest cannot reach an address: unconfirmed, X-only, or nothing wrong", async () => {
    expect(await digestAddressProblem(db.sql, "ub")).toBeNull();
    await db.pg.query(`update "user" set "emailVerified" = false where id = 'ub'`);
    expect(await digestAddressProblem(db.sql, "ub")).toBe("unconfirmed");
    await db.pg.query(
      `insert into account (id, "accountId", "providerId", "userId", "createdAt", "updatedAt")
       values ('acc_x', 'x-1', 'grok-x', 'ub', now(), now())`,
    );
    expect(await digestAddressProblem(db.sql, "ub")).toBe("x_only");
    await db.pg.query(
      `insert into account (id, "accountId", "providerId", "userId", "createdAt", "updatedAt")
       values ('acc_c', 'ub', 'credential', 'ub', now(), now())`,
    );
    expect(await digestAddressProblem(db.sql, "ub")).toBe("unconfirmed");
    expect(await digestAddressProblem(db.sql, "nobody")).toBeNull();
  });

  it("masks the invited address", () => {
    expect(maskEmail("alice@cpa.test")).toBe("a***@cpa.test");
    expect(maskEmail("nobody")).toBe("***");
  });
});

describe("client owner address consent", () => {
  async function status() {
    return (await listClientEngagements(db.sql, "ua", null))[0].ownerEmailStatus;
  }

  it("waits for the owner to confirm, stops on request, and asks again for a new address", async () => {
    const first = await setOwnerEmail(db.sql, "ua", "biz_1", "owner@client.test", "ua");
    expect(isOwnerConsentToken(first.confirmToken)).toBe(true);
    expect(await status()).toBe("waiting");
    expect(await findOwnerConsent(db.sql, first.confirmToken!)).toEqual({
      businessName: "Client UA",
      confirmed: false,
      stopped: false,
    });

    expect(await confirmOwnerEmail(db.sql, first.confirmToken!)).toBe(true);
    expect(await status()).toBe("confirmed");
    const again = await setOwnerEmail(db.sql, "ua", "biz_1", "owner@client.test", "ua");
    expect(again.confirmToken).toBeNull();
    expect(await status()).toBe("confirmed");

    expect(await stopOwnerEmail(db.sql, first.confirmToken!)).toBe(true);
    expect(await status()).toBe("stopped");

    const other = await setOwnerEmail(db.sql, "ua", "biz_1", "new@client.test", "ua");
    expect(other.confirmToken).not.toBe(first.confirmToken);
    expect(await status()).toBe("waiting");
    expect(await confirmOwnerEmail(db.sql, first.confirmToken!)).toBe(false);

    await setOwnerEmail(db.sql, "ua", "biz_1", null, "ua");
    expect(await status()).toBeNull();
  });

  it("never asks again an owner who stopped reminders, even after the address is cleared", async () => {
    const first = await setOwnerEmail(db.sql, "ua", "biz_1", "owner@client.test", "ua");
    expect(await stopOwnerEmail(db.sql, first.confirmToken!)).toBe(true);
    const same = await setOwnerEmail(db.sql, "ua", "biz_1", "owner@client.test", "ua");
    expect(same).toEqual({ confirmToken: null, stopped: true });
    expect(await status()).toBe("stopped");
    await setOwnerEmail(db.sql, "ua", "biz_1", null, "ua");
    const back = await setOwnerEmail(db.sql, "ua", "biz_1", "owner@client.test", "ua");
    expect(back).toEqual({ confirmToken: null, stopped: true });
    expect(await status()).toBe("stopped");
    // The owner's own link still turns the reminders back on.
    expect(await confirmOwnerEmail(db.sql, first.confirmToken!)).toBe(true);
    expect(await status()).toBe("confirmed");
  });

  it("says when an address saved before confirmation existed has had no link", async () => {
    await db.pg.query(
      `insert into engagement_marks (user_id, business_id, owner_email) values ('ua', 'biz_1', 'old@client.test')
       on conflict (user_id, business_id) do update set owner_email = excluded.owner_email`,
    );
    expect(await status()).toBe("unsent");
    const sent = await setOwnerEmail(db.sql, "ua", "biz_1", "old@client.test", "ua");
    expect(isOwnerConsentToken(sent.confirmToken)).toBe(true);
    expect(await status()).toBe("waiting");
  });

  it("limits the confirmation emails one account can cause in a day", async () => {
    for (let i = 0; i < MAX_OWNER_EMAIL_REQUESTS_PER_DAY; i += 1) {
      await setOwnerEmail(db.sql, "ua", "biz_1", `o${i}@client.test`, "ua");
    }
    await expect(
      setOwnerEmail(db.sql, "ua", "biz_1", "late@client.test", "ua"),
    ).rejects.toMatchObject({ status: 429 });
    expect((await listClientEngagements(db.sql, "ua", null))[0].ownerEmail).toBe(
      `o${MAX_OWNER_EMAIL_REQUESTS_PER_DAY - 1}@client.test`,
    );
    await setOwnerEmail(db.sql, "ub", "biz_1", "owner@client.test", "ub");
  });
});
