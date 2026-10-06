import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { openTestDb, type TestDb } from "@/test/pglite";
import { restoreBusinessRow } from "./business-store";

/**
 * A restore counts against the plan that holds the business: its firm's
 * when it has one (a business its owner shared with a firm included), else
 * its owner's own. Stripe is configured, so an account without a
 * subscription is on the free plan (one client).
 */
let db: TestDb;

beforeAll(async () => {
  db = await openTestDb();
}, 60_000);

afterAll(async () => {
  await db.close();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/**
 * Firm North: owner `fo`, preparer `pp`; biz_f is its one live client, so a
 * free firm is full. `so` is outside any firm, with its own live biz_s.
 */
beforeEach(async () => {
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_restore");
  vi.stubEnv("STRIPE_PRICE_ASSESSMENT", "price_assessment");
  vi.stubEnv("STRIPE_PRICE_MONTHLY", "price_monthly");
  await db.clear(
    "billing_accounts",
    "business_deletion_markers",
    "firm_members",
    "firms",
    "businesses",
    '"user"',
  );
  for (const id of ["fo", "pp", "so"]) await db.seedUser(id);
  await db.pg.exec(`
    insert into firms (user_id, name) values ('fo', 'North');
    insert into firm_members (firm_user_id, member_user_id, role) values
      ('fo', 'fo', 'owner'), ('fo', 'pp', 'preparer');
    insert into businesses (id, user_id, name, industry, profile, revision, firm_user_id, granted_at, deleted_at) values
      ('biz_f', 'fo', 'Firm Client', 'dental', '{}'::jsonb, 1, 'fo', null, null),
      ('biz_s', 'so', 'Solo Shop', 'dental', '{}'::jsonb, 1, null, null, null),
      ('biz_g', 'so', 'Shared Shop', 'dental', '{}'::jsonb, 2, 'fo', now(), now()),
      ('biz_own', 'pp', 'Kept Outside', 'dental', '{}'::jsonb, 2, null, null, now());
  `);
});

const live = async (owner: string, id: string) =>
  (
    await db.sql<{ live: boolean }>`select deleted_at is null as live from businesses
      where user_id = ${owner} and id = ${id}`
  )[0]?.live;

describe("restoring a business counts against the plan that holds it", () => {
  it("counts a business shared with a firm against the firm's plan, not its owner's", async () => {
    // The firm is full on the free plan; the owner's own plan has room.
    await db.sql`update businesses set deleted_at = now() where id = 'biz_s'`;
    await expect(restoreBusinessRow(db.sql, "so", "biz_g")).rejects.toMatchObject({
      status: 402,
    });
    expect(await live("so", "biz_g")).toBe(false);
  });

  it("restores a shared business while the firm's plan has room, though its owner's is full", async () => {
    await db.sql`insert into billing_accounts (user_id, subscription_id, subscription_status)
      values ('fo', 'sub_1', 'active')`;
    // `so` holds biz_s, a full free plan of its own; the firm's plan holds the business.
    expect(await restoreBusinessRow(db.sql, "so", "biz_g")).toBe(true);
    expect(await live("so", "biz_g")).toBe(true);
  });

  it("counts a member's business kept outside the firm against the member's own businesses", async () => {
    // The firm is full, but the business is not the firm's: pp holds no other live business.
    expect(await restoreBusinessRow(db.sql, "pp", "biz_own")).toBe(true);
    expect(await live("pp", "biz_own")).toBe(true);
  });

  it("still refuses a firm client past the firm's limit", async () => {
    await db.sql`update businesses set firm_user_id = 'fo', deleted_at = now()
      where id = 'biz_own'`;
    await expect(restoreBusinessRow(db.sql, "pp", "biz_own", "fo")).rejects.toMatchObject({
      status: 402,
    });
  });
});
