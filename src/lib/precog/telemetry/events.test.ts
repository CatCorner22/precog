import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { openTestDb, type TestDb } from "@/test/pglite";
import { recordFirst, weeklyActivation, type ProductEvent } from "./events.server";

const report = vi.hoisted(() => ({
  error: vi.fn(async (_err: unknown, _at?: string | null) => {}),
}));
vi.mock("@/lib/observability/report.server", () => ({ reportServerError: report.error }));

describe("product milestones", () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await openTestDb();
  }, 60_000);
  afterAll(async () => {
    await db.close();
  });
  beforeEach(async () => {
    await db.clear("product_events", "businesses", '"user"');
    await db.seedUser("adv");
    await db.seedUser("mem");
    report.error.mockClear();
  });

  const rows = () =>
    db.sql<{ user_id: string; event: string; business_id: string | null }>`
      select user_id, event, business_id from product_events order by user_id, event
    `;

  it("records a milestone once per account, keeping the first business id", async () => {
    await recordFirst(db.sql, "adv", "first_business", "biz_1");
    await recordFirst(db.sql, "adv", "first_business", "biz_2");
    await recordFirst(db.sql, "mem", "first_business", "biz_9");
    expect(await rows()).toEqual([
      { user_id: "adv", event: "first_business", business_id: "biz_1" },
      { user_id: "mem", event: "first_business", business_id: "biz_9" },
    ]);
  });

  it("keeps the milestone after the business is purged, and loses it with the account", async () => {
    await db.pg.query(
      `insert into businesses (id, user_id, name, industry, profile, revision)
       values ('biz_1', 'adv', 'Riverside Plumbing', 'general', '{}'::jsonb, 1)`,
    );
    await recordFirst(db.sql, "adv", "first_business", "biz_1");
    await recordFirst(db.sql, "adv", "first_locked_version", null);
    await db.sql`delete from businesses where id = 'biz_1'`;
    expect((await rows()).map((r) => r.business_id)).toEqual(["biz_1", null]);
    await db.sql`delete from "user" where id = 'adv'`;
    expect(await rows()).toEqual([]);
  });

  it("reports a failed insert instead of throwing", async () => {
    await expect(
      recordFirst(db.sql, "adv", "first_coffee" as ProductEvent, null),
    ).resolves.toBeUndefined();
    expect(report.error).toHaveBeenCalledTimes(1);
    expect(report.error).toHaveBeenCalledWith(expect.any(Error), "telemetry");
    expect(await rows()).toEqual([]);
  });

  it("counts the seven days ending today, sign-ups included", async () => {
    await db.pg.query(
      `update "user" set "createdAt" = timestamptz '2026-09-30T12:00:00Z' where id = 'adv'`,
    );
    await db.pg.query(
      `update "user" set "createdAt" = timestamptz '2026-09-29T12:00:00Z' where id = 'mem'`,
    );
    await db.pg.query(`
      insert into product_events (user_id, event, business_id, occurred_at) values
        ('adv', 'first_business', 'biz_1', timestamptz '2026-09-30T08:00:00Z'),
        ('adv', 'first_locked_version', 'biz_1', timestamptz '2026-10-06T23:59:00Z'),
        ('adv', 'first_report_sent', 'biz_1', timestamptz '2026-10-07T00:00:00Z'),
        ('mem', 'first_business', 'biz_9', timestamptz '2026-09-29T23:59:00Z'),
        ('mem', 'first_monthly_review', 'biz_9', timestamptz '2026-10-01T00:00:00Z')
    `);
    expect(await weeklyActivation(db.sql, "2026-10-06")).toEqual({
      weekEnding: "2026-10-06",
      signedUp: 1,
      firstBusiness: 1,
      firstLockedVersion: 1,
      firstReportSent: 0,
      firstMonthlyReview: 1,
    });
    expect(await weeklyActivation(db.sql, "2026-12-01")).toMatchObject({
      signedUp: 0,
      firstBusiness: 0,
      firstMonthlyReview: 0,
    });
  });

  it("exposes the weekly views the operator reads", async () => {
    await db.pg.query(`
      insert into product_events (user_id, event, business_id, occurred_at) values
        ('adv', 'first_business', 'biz_1', timestamptz '2026-09-30T08:00:00Z'),
        ('mem', 'first_business', 'biz_9', timestamptz '2026-10-01T08:00:00Z')
    `);
    const weekly = await db.sql<{ week_start: string; event: string; accounts: number }>`
      select week_start::text as week_start, event, accounts from product_activation_weekly
    `;
    expect(weekly).toEqual([{ week_start: "2026-09-28", event: "first_business", accounts: 2 }]);
    const signups = await db.sql<{ accounts: number }>`
      select accounts from product_signups_weekly
    `;
    expect(signups).toEqual([{ accounts: 2 }]);
    expect(await db.sql`select user_id from product_retained_reviewers`).toEqual([]);
  });
});
