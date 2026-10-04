import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { openTestDb, type TestDb } from "@/test/pglite";
import { alertQuickBooksProblems } from "./alerts.server";
import { markSynced } from "./store";

const report = vi.hoisted(() => ({
  error: vi.fn(async (_err: unknown, _at?: string | null) => {}),
}));
vi.mock("@/lib/observability/report.server", () => ({ reportServerError: report.error }));

const TODAY = "2026-10-06";
const REFUSED = "QuickBooks no longer accepts this connection. Disconnect and connect again.";

describe("QuickBooks alerts", () => {
  let db: TestDb;
  beforeAll(async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM", "Precog <no-reply@example.test>");
    db = await openTestDb();
  }, 60_000);
  afterAll(async () => {
    vi.unstubAllEnvs();
    await db.close();
  });
  beforeEach(async () => {
    report.error.mockClear();
    await db.clear(
      "integration_connections",
      "email_suppressions",
      "firm_members",
      "firms",
      "businesses",
      '"user"',
    );
    await db.seedUser("adv", "adv@firm.test");
    await db.seedUser("mem", "mem@firm.test");
    await db.seedUser("solo", "solo@shop.test");
    await db.pg.exec(`
      insert into firms (user_id, name) values ('adv', 'North Advisors');
      insert into firm_members (firm_user_id, member_user_id, role)
        values ('adv', 'adv', 'owner'), ('adv', 'mem', 'preparer');
      insert into businesses (id, user_id, firm_user_id, name, industry, profile, revision) values
        ('biz_1', 'mem', 'adv', 'Ortiz Dental', 'general', '{}'::jsonb, 1),
        ('biz_2', 'adv', 'adv', 'Hill Dental', 'general', '{}'::jsonb, 1),
        ('biz_3', 'solo', null, 'Riverside Plumbing', 'general', '{}'::jsonb, 1),
        ('biz_4', 'adv', 'adv', 'Healthy Books', 'general', '{}'::jsonb, 1);
    `);
    // A failing reading on the member's client, a permission ending in ten
    // days, one that ended last week, and a healthy connection.
    await connect("mem", "biz_1", "now() + interval '90 days'");
    await db.sql`
      update integration_connections set last_error = ${REFUSED},
        last_error_at = timestamptz '2026-10-05T09:00:00Z',
        last_synced_at = timestamptz '2026-09-01T09:00:00Z'
      where business_id = 'biz_1'
    `;
    await connect("adv", "biz_2", "now() + interval '10 days'");
    await connect("solo", "biz_3", "now() - interval '7 days'");
    await connect("adv", "biz_4", "now() + interval '90 days'");
  });

  async function connect(userId: string, businessId: string, refreshExpires: string) {
    await db.pg.query(
      `insert into integration_connections (user_id, business_id, provider, realm_id,
         access_token_enc, refresh_token_enc, access_expires_at, refresh_expires_at)
       values ($1, $2, 'qbo', '123', 'a', 'r', now() + interval '1 hour', ${refreshExpires})`,
      [userId, businessId],
    );
  }

  function recorder() {
    const sent: { to: string; subject: string; text: string }[] = [];
    const send = async (to: string, message: { subject: string; text: string }) => {
      sent.push({ to, subject: message.subject, text: message.text });
    };
    return { sent, send };
  }
  const run = (send: ReturnType<typeof recorder>["send"]) =>
    alertQuickBooksProblems(db.sql, { today: TODAY, appUrl: "https://app.example", send });

  const stamps = () =>
    db.sql<{ business_id: string; failure: boolean; expiry: boolean }>`
      select business_id, failure_alerted_at is not null as failure,
        expiry_alerted_for is not null as expiry
      from integration_connections order by business_id
    `;

  it("emails each firm owner once about every problem, never the member, then stays quiet", async () => {
    const { sent, send } = recorder();
    expect(await run(send)).toEqual({ emailed: 2, skipped: 0, errors: [] });
    expect(sent.map((s) => s.to).sort()).toEqual(["adv@firm.test", "solo@shop.test"]);
    const firm = sent.find((s) => s.to === "adv@firm.test")!;
    expect(firm.subject).toBe("Precog: QuickBooks needs attention for 2 clients");
    expect(firm.text).toContain(
      `Precog could not read the QuickBooks books of Ortiz Dental on Oct 5, 2026: ${REFUSED} Until it is read again, the monthly check of vendors and payroll runs on the reading of Sep 1, 2026.`,
    );
    expect(firm.text).toMatch(/QuickBooks' permission for Hill Dental ends on Oct \d+, 2026\./);
    expect(firm.text).not.toContain("Healthy Books");
    expect(firm.text).toContain("Open the firm workspace: https://app.example/firm");
    expect(firm.text).toContain("in North Advisors on Precog");
    const solo = sent.find((s) => s.to === "solo@shop.test")!;
    expect(solo.subject).toBe("Precog: QuickBooks needs attention for Riverside Plumbing");
    expect(solo.text).toMatch(
      /QuickBooks' permission for Riverside Plumbing ended on Sep \d+, 2026, so the monthly reading has stopped\./,
    );
    expect(await stamps()).toEqual([
      { business_id: "biz_1", failure: true, expiry: false },
      { business_id: "biz_2", failure: false, expiry: true },
      { business_id: "biz_3", failure: false, expiry: true },
      { business_id: "biz_4", failure: false, expiry: false },
    ]);

    const again = recorder();
    expect(await run(again.send)).toEqual({ emailed: 0, skipped: 0, errors: [] });
    expect(again.sent).toEqual([]);
    expect(report.error).not.toHaveBeenCalled();
  });

  it("alerts again after a successful reading starts a new failure episode", async () => {
    await run(recorder().send);
    await markSynced(db.sql, "mem", "biz_1", "QuickBooks refused the request. Try again later.");
    const quiet = recorder();
    await run(quiet.send);
    expect(quiet.sent).toEqual([]);

    await markSynced(db.sql, "mem", "biz_1", null);
    expect((await stamps())[0]).toEqual({ business_id: "biz_1", failure: false, expiry: false });
    await markSynced(db.sql, "mem", "biz_1", "QuickBooks refused the request. Try again later.");
    const { sent, send } = recorder();
    expect((await run(send)).emailed).toBe(1);
    expect(sent[0].to).toBe("adv@firm.test");
    expect(sent[0].subject).toBe("Precog: QuickBooks needs attention for Ortiz Dental");
    expect(sent[0].text).toContain("QuickBooks refused the request. Try again later.");
  });

  it("warns about an expiry again only when a refresh moved it and it is still near", async () => {
    await run(recorder().send);
    await db.sql`
      update integration_connections set refresh_expires_at = now() + interval '5 days'
      where business_id = 'biz_2'
    `;
    const near = recorder();
    expect((await run(near.send)).emailed).toBe(1);
    expect(near.sent[0].text).toContain("QuickBooks' permission for Hill Dental ends on");

    await db.sql`
      update integration_connections set refresh_expires_at = now() + interval '100 days'
      where business_id = 'biz_2'
    `;
    const far = recorder();
    expect((await run(far.send)).emailed).toBe(0);
    expect(far.sent).toEqual([]);
  });

  it("reports an owner whose address bounced once, stamps the rows and sends nothing", async () => {
    await db.sql`
      insert into email_suppressions (email, reason, provider_event_id)
      values ('adv@firm.test', 'bounced', 'em_1')
    `;
    const { sent, send } = recorder();
    expect(await run(send)).toEqual({ emailed: 1, skipped: 1, errors: [] });
    expect(sent.map((s) => s.to)).toEqual(["solo@shop.test"]);
    expect(report.error).toHaveBeenCalledTimes(1);
    expect(report.error).toHaveBeenCalledWith(expect.any(Error), "qbo-alert");
    expect((await stamps()).slice(0, 2)).toEqual([
      { business_id: "biz_1", failure: true, expiry: false },
      { business_id: "biz_2", failure: false, expiry: true },
    ]);
    report.error.mockClear();
    expect(await run(recorder().send)).toEqual({ emailed: 0, skipped: 0, errors: [] });
    expect(report.error).not.toHaveBeenCalled();
  });

  it("treats an unconfirmed password address the same way", async () => {
    await db.sql`update "user" set "emailVerified" = false where id = 'solo'`;
    const { sent, send } = recorder();
    expect(await run(send)).toEqual({ emailed: 1, skipped: 1, errors: [] });
    expect(sent.map((s) => s.to)).toEqual(["adv@firm.test"]);
    expect(report.error).toHaveBeenCalledTimes(1);
    expect((await stamps())[2]).toEqual({ business_id: "biz_3", failure: false, expiry: true });
  });

  it("stamps nothing when a send fails, so the next run tries again", async () => {
    const outcome = await alertQuickBooksProblems(db.sql, {
      today: TODAY,
      appUrl: "https://app.example",
      send: async () => {
        throw new Error("provider down");
      },
    });
    expect(outcome).toMatchObject({ emailed: 0, skipped: 0 });
    expect(outcome.errors).toEqual([
      "quickbooks alert adv: provider down",
      "quickbooks alert solo: provider down",
    ]);
    expect((await stamps()).every((s) => !s.failure && !s.expiry)).toBe(true);
    expect(report.error).toHaveBeenCalledTimes(1);
    expect(report.error).toHaveBeenCalledWith(expect.any(Error), "qbo-alert-send");
    expect((report.error.mock.calls[0][0] as Error).message).toBe(
      "quickbooks alert adv: provider down; quickbooks alert solo: provider down",
    );
    const { sent, send } = recorder();
    expect((await run(send)).emailed).toBe(2);
    expect(sent).toHaveLength(2);
  });

  it("stamps the expiry the alert named, not one a refresh moved meanwhile", async () => {
    const first = recorder();
    expect(
      (
        await run(async (to, message) => {
          // A token refresh lands between the select and the stamp.
          await db.sql`
            update integration_connections set refresh_expires_at = now() + interval '12 days'
            where business_id = 'biz_2'
          `;
          await first.send(to, message);
        })
      ).emailed,
    ).toBe(2);
    const { sent, send } = recorder();
    expect((await run(send)).emailed).toBe(1);
    expect(sent[0].to).toBe("adv@firm.test");
    expect(sent[0].text).toContain("QuickBooks' permission for Hill Dental ends on");
    expect(sent[0].text).not.toContain("Ortiz Dental");
  });

  it("sends and stamps nothing while mail is off, so the alerts wait for it", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    try {
      const { sent, send } = recorder();
      expect(await run(send)).toEqual({ emailed: 0, skipped: 2, errors: [] });
      expect(sent).toEqual([]);
      expect((await stamps()).every((s) => !s.failure && !s.expiry)).toBe(true);
    } finally {
      vi.stubEnv("RESEND_API_KEY", "re_test");
    }
    expect((await run(recorder().send)).emailed).toBe(2);
  });
});
