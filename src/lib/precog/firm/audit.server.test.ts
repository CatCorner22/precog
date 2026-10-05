import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inTransaction } from "@/lib/sql-transaction";
import { openTestDb, type TestDb } from "@/test/pglite";

const report = vi.hoisted(() => ({ error: vi.fn(async (_err: unknown, _at?: string) => {}) }));
vi.mock("@/lib/observability/report.server", () => ({ reportServerError: report.error }));

const {
  insertAudit,
  listFirmActivity,
  purgeExpiredAudit,
  recordAudit,
  recordAuditForAccount,
  recordAuditForBusiness,
  withAuditBypass,
} = await import("./audit.server");
type AuditEventName = Parameters<typeof insertAudit>[1]["event"];

let db: TestDb;

beforeAll(async () => {
  db = await openTestDb();
}, 60_000);

afterAll(async () => {
  await db.close();
});

/**
 * Firm North (owner `fo`, preparer `pp`) with client biz_1 under `fo`;
 * `so` is in no firm and owns biz_s.
 */
beforeEach(async () => {
  report.error.mockClear();
  await db.clear("report_versions", "firm_members", "firms", "businesses", '"user"');
  for (const id of ["fo", "pp", "so"]) await db.seedUser(id);
  await db.pg.exec(`
    update "user" set name = 'Fay Owner' where id = 'fo';
    update "user" set name = '' where id = 'pp';
    insert into firms (user_id, name) values ('fo', 'North');
    insert into firm_members (firm_user_id, member_user_id, role)
      values ('fo', 'fo', 'owner'), ('fo', 'pp', 'preparer');
    insert into businesses (id, user_id, name, industry, profile, revision, firm_user_id)
      values ('biz_1', 'fo', 'Client', 'general', '{}'::jsonb, 1, 'fo'),
             ('biz_s', 'so', 'Solo', 'general', '{}'::jsonb, 1, null);
  `);
});

const logRows = () =>
  db.sql<{ firm_user_id: string; actor_name: string; event: string; business_id: string | null }>`
    select firm_user_id, actor_name, event, business_id from firm_audit_log order by id
  `;

describe("the activity log", () => {
  it("writes a row with the actor's name as it is now, or the address when the name is empty", async () => {
    await recordAudit(db.sql, { firmUserId: "fo", actorUserId: "fo", event: "letterhead_changed" });
    await recordAudit(db.sql, {
      firmUserId: "fo",
      actorUserId: "pp",
      event: "version_locked",
      businessId: "biz_1",
      detail: { versionId: "rv_1" },
    });
    await recordAudit(db.sql, { firmUserId: "fo", actorUserId: null, event: "plan_changed" });
    expect(await logRows()).toEqual([
      {
        firm_user_id: "fo",
        actor_name: "Fay Owner",
        event: "letterhead_changed",
        business_id: null,
      },
      {
        firm_user_id: "fo",
        actor_name: "pp@example.test",
        event: "version_locked",
        business_id: "biz_1",
      },
      { firm_user_id: "fo", actor_name: "", event: "plan_changed", business_id: null },
    ]);
    const [newest] = await listFirmActivity(db.sql, "fo");
    expect(newest).toMatchObject({ event: "plan_changed", actorName: "", detail: {} });
  });

  it("refuses an update or a delete from any connection", async () => {
    await recordAudit(db.sql, { firmUserId: "fo", actorUserId: "fo", event: "member_invited" });
    await expect(
      db.sql`update firm_audit_log set actor_name = 'someone else'`,
    ).rejects.toMatchObject({ code: "42501" });
    await expect(db.sql`delete from firm_audit_log`).rejects.toMatchObject({ code: "42501" });
    // Deleting the firm owner's account cascades into the log, and is refused too.
    await expect(db.sql`delete from "user" where id = 'fo'`).rejects.toMatchObject({
      code: "42501",
    });
    expect((await logRows()).map((r) => r.actor_name)).toEqual(["Fay Owner"]);
  });

  it("takes an update and a delete under the bypass, inside that transaction only", async () => {
    await recordAudit(db.sql, { firmUserId: "fo", actorUserId: "fo", event: "member_invited" });
    await recordAudit(db.sql, { firmUserId: "fo", actorUserId: "fo", event: "invite_revoked" });
    await inTransaction(db.sql, async (tx) => {
      await withAuditBypass(tx);
      await tx`update firm_audit_log set firm_user_id = 'pp' where event = 'member_invited'`;
      await tx`delete from firm_audit_log where event = 'invite_revoked'`;
    });
    expect(await logRows()).toMatchObject([{ firm_user_id: "pp", event: "member_invited" }]);
    // The setting ended with its transaction.
    await expect(
      inTransaction(db.sql, (tx) => tx`delete from firm_audit_log`),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(db.sql`delete from firm_audit_log`).rejects.toMatchObject({ code: "42501" });
    expect(await logRows()).toHaveLength(1);
  });

  it("purges rows past their firm's retention, each by its own age, and 7 years without a firm row", async () => {
    await db.seedUser("gone");
    await db.pg.exec(`
      update firms set retention_years = 10 where user_id = 'fo';
      update businesses set deleted_at = now() - interval '9 years' where id = 'biz_1';
      insert into firm_audit_log (firm_user_id, event, business_id, occurred_at) values
        ('fo', 'client_deleted', 'biz_1', now() - interval '9 years'),
        ('fo', 'version_locked', 'biz_1', now() - interval '11 years'),
        ('fo', 'member_joined', null, now() - interval '1 day'),
        ('gone', 'member_joined', null, now() - interval '8 years'),
        ('gone', 'member_left', null, now() - interval '6 years');
    `);
    expect(await purgeExpiredAudit(db.sql)).toBe(2);
    expect((await logRows()).map((r) => `${r.firm_user_id}:${r.event}`)).toEqual([
      "fo:client_deleted",
      "fo:member_joined",
      "gone:member_left",
    ]);
  });

  it("reports a failed write and never throws it through recordAudit; insertAudit throws", async () => {
    const bad = { firmUserId: "fo", actorUserId: "fo", event: "not_an_event" as AuditEventName };
    await expect(recordAudit(db.sql, bad)).resolves.toBeUndefined();
    expect(report.error).toHaveBeenCalledWith(expect.anything(), "audit");
    await expect(insertAudit(db.sql, bad)).rejects.toThrow();
    expect(await logRows()).toEqual([]);
  });

  it("writes for an account's firm or a business's firm, and nothing outside a firm", async () => {
    await recordAuditForAccount(db.sql, "pp", { actorUserId: "pp", event: "export_run" });
    await recordAuditForAccount(db.sql, "so", { actorUserId: "so", event: "export_run" });
    await recordAuditForBusiness(db.sql, "fo", "biz_1", {
      actorUserId: "pp",
      event: "share_created",
    });
    await recordAuditForBusiness(db.sql, "so", "biz_s", {
      actorUserId: "so",
      event: "share_created",
    });
    expect(await logRows()).toEqual([
      { firm_user_id: "fo", actor_name: "pp@example.test", event: "export_run", business_id: null },
      {
        firm_user_id: "fo",
        actor_name: "pp@example.test",
        event: "share_created",
        business_id: "biz_1",
      },
    ]);
  });
});

describe("a locked version keeps what it printed", () => {
  beforeEach(async () => {
    await db.pg.exec(`
      insert into businesses (id, user_id, name, industry, profile, revision, firm_user_id)
        values ('biz_2', 'pp', 'Moved', 'general', '{}'::jsonb, 1, 'fo');
      insert into report_versions (id, user_id, business_id, version_no, profile, prepared_by,
        firm_name, engagement_scope, report_model, firm_user_id)
        values ('rv_1', 'fo', 'biz_1', 1, '{"a":1}'::jsonb, 'pp', 'North', 'Year end',
          '{"m":1}'::jsonb, 'fo');
    `);
  });

  it.each([
    ["profile", `profile = '{"a":2}'::jsonb`],
    ["report_model", `report_model = '{"m":2}'::jsonb`],
    ["firm_name", "firm_name = null"],
    ["engagement_scope", "engagement_scope = 'Something else'"],
    ["prepared_by", "prepared_by = 'fo'"],
  ])("refuses a change of %s", async (_column, set) => {
    await expect(
      db.pg.query(`update report_versions set ${set} where id = 'rv_1'`),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("lets the stamps, the firm repoint and the member hand-over through", async () => {
    await db.pg.exec(`
      update report_versions set reviewed_by = 'fo', reviewed_at = now(), review_note = 'ok',
        sent_at = now() where id = 'rv_1';
      update report_versions set review_requested_at = now(), review_requested_by = 'pp',
        review_requested_from = 'fo', returned_at = now(), returned_by = 'fo',
        return_note = 'fix' where id = 'rv_1';
      update report_versions set firm_user_id = 'pp' where id = 'rv_1';
      update report_versions set user_id = 'pp', business_id = 'biz_2' where id = 'rv_1';
    `);
    const rows = await db.sql<{ user_id: string; business_id: string; firm_user_id: string }>`
      select user_id, business_id, firm_user_id from report_versions where id = 'rv_1'
    `;
    expect(rows).toEqual([{ user_id: "pp", business_id: "biz_2", firm_user_id: "pp" }]);
  });

  it("clears the preparer when their account is deleted, and goes with its business", async () => {
    await db.sql`delete from "user" where id = 'pp'`;
    const kept = await db.sql<{ prepared_by: string | null; firm_name: string }>`
      select prepared_by, firm_name from report_versions where id = 'rv_1'
    `;
    expect(kept).toEqual([{ prepared_by: null, firm_name: "North" }]);
    await db.sql`delete from businesses where user_id = 'fo' and id = 'biz_1'`;
    expect(await db.sql`select id from report_versions`).toEqual([]);
  });
});
