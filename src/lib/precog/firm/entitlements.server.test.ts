import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { openTestDb, type TestDb } from "@/test/pglite";
import { businessLimitMessage } from "../business-lifecycle";
import { defaultProfile, type PracticeProfile } from "../practice-profile";
import { runDigest } from "../reminders/digest";
import { countClients, loadEntitlements, requireEntitlement } from "./entitlements.server";
import { ENTITLEMENTS_FROM, HAND_MARKED_PLANS_UNTIL } from "./entitlements";
import { loadReportVersion, lockReportVersion } from "./reports";
import { loadFirmFor, saveFirm } from "./store";
import type { Person } from "../types";

vi.mock("@/lib/observability/report.server", () => ({
  reportServerError: vi.fn(async () => undefined),
}));

const OWNER_TOKEN = "ab".repeat(24);

function withStripe() {
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test");
  vi.stubEnv("STRIPE_PRICE_ASSESSMENT", "price_a");
  vi.stubEnv("STRIPE_PRICE_MONTHLY", "price_m");
}

/** A profile whose owner has something due on 2026-09-25 (an open decision to review). */
function profileWithDues(name: string): PracticeProfile {
  const people = [
    { id: "p1", name: "Ada Owner", role: "Owner", active: true, owner: true },
    { id: "p2", name: "Bea Books", role: "Bookkeeper", active: true },
  ] as unknown as Person[];
  return {
    ...defaultProfile("general"),
    practiceName: name,
    customPeople: people,
    decisions: [
      {
        id: "d1",
        createdAt: "2026-08-01T00:00:00Z",
        subject: "bank reconciliation",
        kind: "remediate",
        note: "Owner opens the statement.",
        reviewBy: "2026-09-20",
        status: "open",
      },
    ] as PracticeProfile["decisions"],
  };
}

describe("entitlements on the database", () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await openTestDb();
  }, 60_000);
  afterAll(async () => {
    await db.close();
  });
  beforeEach(async () => {
    await db.clear(
      "reminder_log",
      "engagement_marks",
      "report_versions",
      "billing_accounts",
      "businesses",
      "firm_members",
      "firms",
      '"user"',
    );
    await db.seedUser("owner");
    await db.seedUser("member");
    await db.seedUser("solo");
    await saveFirm(db.sql, "owner", "North", "assessment");
    await db.pg.exec(
      `insert into firm_members (firm_user_id, member_user_id, role) values ('owner', 'member', 'preparer')`,
    );
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  async function business(id: string, userId: string, firmUserId: string | null, name = id) {
    await db.pg.query(
      `insert into businesses (id, user_id, firm_user_id, name, industry, profile, revision)
       values ($1, $2, $3, $4, 'general', $5::jsonb, 1)`,
      [id, userId, firmUserId, name, JSON.stringify(profileWithDues(name))],
    );
  }

  it("opens everything for everyone while Stripe is not configured", async () => {
    expect((await loadEntitlements(db.sql, "solo")).features.quickbooks).toBe(true);
    expect((await loadEntitlements(db.sql, "member")).clientLimit).toBe(50);
  });

  it("gives a member of a paid firm the firm's plan, and a solo account the free one", async () => {
    withStripe();
    await db.sql`insert into billing_accounts (user_id, subscription_id, subscription_status)
      values ('owner', 'sub_1', 'active')`;
    expect((await loadEntitlements(db.sql, "member")).plan).toBe("firm");
    expect((await loadEntitlements(db.sql, "owner")).plan).toBe("firm");
    const solo = await loadEntitlements(db.sql, "solo");
    expect(solo).toMatchObject({ plan: "free", clientLimit: 1 });
    await expect(requireEntitlement(db.sql, "solo", "lockedVersions")).rejects.toMatchObject({
      status: 402,
      message:
        "Locked report versions are part of the Firm plan and the Assessment. Start one on the Firm page; the live report still prints.",
    });
    await expect(requireEntitlement(db.sql, "member", "members")).resolves.toMatchObject({
      plan: "firm",
    });
  });

  it("counts the firm's live clients for a member, and an account's own outside a firm", async () => {
    await business("c1", "owner", "owner");
    await business("c2", "member", "owner");
    await business("gone", "member", "owner");
    await db.sql`update businesses set deleted_at = now() where id = 'gone'`;
    await business("s1", "solo", null);
    await business("s2", "solo", null);
    const firm = await loadFirmFor(db.sql, "member");
    expect(await countClients(db.sql, "member", firm)).toBe(2);
    expect(await countClients(db.sql, "owner", firm)).toBe(2);
    expect(await countClients(db.sql, "solo", null)).toBe(2);
  });

  it("still returns a locked version after the Assessment's window ended", async () => {
    await business("c1", "owner", "owner");
    const version = await lockReportVersion(db.sql, {
      ownerUserId: "owner",
      businessId: "c1",
      preparedBy: "owner",
      scopeNote: "",
      id: "rv_1",
    });
    withStripe();
    await db.sql`insert into billing_accounts (user_id, assessment_paid_at)
      values ('owner', '2026-06-01T00:00:00Z')`;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2027-02-01T00:00:00Z"));
    const e = await loadEntitlements(db.sql, "owner");
    expect(e).toMatchObject({ plan: "free", assessmentEndedAt: "2027-01-03T00:00:00.000Z" });
    expect(ENTITLEMENTS_FROM).toBe("2026-10-05");
    await expect(requireEntitlement(db.sql, "owner", "lockedVersions")).rejects.toMatchObject({
      status: 402,
    });
    const loaded = await loadReportVersion(db.sql, "owner", "rv_1");
    expect(loaded?.version.id).toBe(version.id);
  });

  it("keeps a hand-marked Firm plan with no billing row open until the dated cut-off", async () => {
    withStripe();
    await saveFirm(db.sql, "owner", "North", "monthly");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-12-01T00:00:00Z"));
    expect((await loadEntitlements(db.sql, "member")).plan).toBe("firm");
    vi.setSystemTime(new Date(`${HAND_MARKED_PLANS_UNTIL}T12:00:00Z`));
    expect((await loadEntitlements(db.sql, "member")).plan).toBe("free");
  });

  it("refuses a restore past the plan's limit with the plan's text, and lets the Firm plan restore", async () => {
    withStripe();
    await business("c1", "owner", "owner");
    await business("c2", "owner", "owner");
    await db.sql`update businesses set deleted_at = now() where id = 'c2'`;
    // The handler's check: the plan's limit against the live count.
    const free = await loadEntitlements(db.sql, "owner");
    const firm = await loadFirmFor(db.sql, "owner");
    const held = await countClients(db.sql, "owner", firm);
    expect(held >= free.clientLimit).toBe(true);
    expect(businessLimitMessage({ plan: free.plan, limit: free.clientLimit })).toBe(
      "Precog keeps one business per account for free. The Firm plan holds 5, 20 or 50 client businesses by tier; start it on the Firm page.",
    );
    await db.sql`insert into billing_accounts (user_id, subscription_id, subscription_status)
      values ('owner', 'sub_1', 'active')`;
    const paid = await loadEntitlements(db.sql, "owner");
    expect(held >= paid.clientLimit).toBe(false);
  });

  describe("the tier from the subscription's price", () => {
    async function subscribed(priceId: string | null) {
      await db.sql`insert into billing_accounts
        (user_id, subscription_id, subscription_status, subscription_price_id)
        values ('owner', 'sub_1', 'active', ${priceId})`;
    }
    async function clients(n: number) {
      for (let i = 1; i <= n; i++) await business(`c${i}`, "owner", "owner");
    }

    it("holds the tier's clients for a known tier price, monthly or yearly", async () => {
      withStripe();
      vi.stubEnv("STRIPE_PRICE_TIER_1", "price_t1");
      vi.stubEnv("STRIPE_PRICE_TIER_2", "price_t2");
      vi.stubEnv("STRIPE_PRICE_TIER_3_ANNUAL", "price_t3y");
      await subscribed("price_t2");
      expect(await loadEntitlements(db.sql, "member")).toMatchObject({ tier: 2, clientLimit: 20 });
      await db.sql`update billing_accounts set subscription_price_id = 'price_t1'`;
      expect(await loadEntitlements(db.sql, "owner")).toMatchObject({ tier: 1, clientLimit: 5 });
      await db.sql`update billing_accounts set subscription_price_id = 'price_t3y'`;
      expect(await loadEntitlements(db.sql, "owner")).toMatchObject({ tier: 3, clientLimit: 50 });
    });

    it("keeps 50 on the legacy monthly price while the Starter price differs, at six clients or five", async () => {
      withStripe();
      vi.stubEnv("STRIPE_PRICE_TIER_1", "price_t1");
      await subscribed("price_m");
      await clients(6);
      expect(await loadEntitlements(db.sql, "owner")).toMatchObject({
        tier: null,
        clientLimit: 50,
      });
      // Down to five, a legacy firm can still restore a sixth: the same check
      // restoreDeletedClient runs (held >= clientLimit) passes.
      await db.sql`update businesses set deleted_at = now() where id = 'c6'`;
      const e = await loadEntitlements(db.sql, "owner");
      const held = await countClients(db.sql, "owner", await loadFirmFor(db.sql, "owner"));
      expect(held).toBe(5);
      expect(held >= e.clientLimit).toBe(false);
    });

    it("treats the legacy monthly price as Starter once it is also the Starter price", async () => {
      withStripe();
      vi.stubEnv("STRIPE_PRICE_TIER_1", "price_m");
      await subscribed("price_m");
      expect(await loadEntitlements(db.sql, "owner")).toMatchObject({ tier: 1, clientLimit: 5 });
    });

    it("keeps 50 on the legacy price while no Starter price is set, and for a price not seen yet", async () => {
      withStripe();
      await subscribed("price_m");
      expect(await loadEntitlements(db.sql, "owner")).toMatchObject({
        tier: null,
        clientLimit: 50,
      });
      await db.sql`update billing_accounts set subscription_price_id = null`;
      expect(await loadEntitlements(db.sql, "owner")).toMatchObject({
        tier: null,
        clientLimit: 50,
      });
    });
  });

  it("skips the owner note of a closed firm and keeps the open one", async () => {
    withStripe();
    await db.seedUser("other");
    await saveFirm(db.sql, "other", "South", "assessment");
    await business("c1", "owner", "owner", "Riverside Plumbing");
    await business("o1", "other", "other", "Hill Dental");
    for (const [user, id, email, token] of [
      ["owner", "c1", "north-owner@shop.test", OWNER_TOKEN],
      ["other", "o1", "south-owner@shop.test", "cd".repeat(24)],
    ]) {
      await db.pg.query(
        `insert into engagement_marks (user_id, business_id, owner_email, owner_email_token, owner_email_confirmed_at)
         values ($1, $2, $3, $4, now())`,
        [user, id, email, token],
      );
    }
    await db.sql`insert into billing_accounts (user_id, subscription_id, subscription_status)
      values ('owner', 'sub_1', 'active')`;
    const sent: string[] = [];
    const outcome = await runDigest(db.sql, {
      today: "2026-09-25",
      appUrl: "https://app.example",
      send: async (to) => {
        sent.push(to);
      },
    });
    expect(sent).toEqual(["north-owner@shop.test"]);
    expect(outcome).toMatchObject({ owners: 1, skipped: 1, errors: [] });
  });
});
