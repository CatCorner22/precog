import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { openTestDb, type TestDb } from "@/test/pglite";
import {
  commercialToolsOpen,
  isHandMarked,
  loadBillingAccount,
  NO_RUNNING_SUBSCRIPTION,
  planToStore,
  setStripeCustomer,
} from "./billing-store";
import { saveFirm } from "./store";

describe("planToStore", () => {
  it("ignores the client's plan while Stripe is connected", () => {
    expect(planToStore(true, false, "monthly")).toBeNull();
    expect(planToStore(true, true, "assessment")).toBeNull();
  });

  it("ignores the client's plan once a billing row exists", () => {
    expect(planToStore(false, true, "monthly")).toBeNull();
  });

  it("stores the plan the owner recorded by hand when nothing else sets it", () => {
    expect(planToStore(false, false, "monthly")).toBe("monthly");
    expect(planToStore(false, false, "assessment")).toBe("assessment");
  });
});

describe("commercialToolsOpen", () => {
  it("stays open when Stripe is not configured", () => {
    expect(
      commercialToolsOpen({
        stripeConfigured: false,
        subscriptionStatus: null,
        assessmentPaidAt: null,
        assessmentRefundedAt: null,
      }),
    ).toBe(true);
  });

  it("keeps a past_due plan open for 14 days from the failed payment", () => {
    const pastDue = {
      stripeConfigured: true,
      subscriptionStatus: "past_due",
      assessmentPaidAt: null,
      assessmentRefundedAt: null,
      pastDueSince: "2026-10-20T00:00:00.000Z",
    };
    expect(commercialToolsOpen({ ...pastDue, now: new Date("2026-10-25T00:00:00.000Z") })).toBe(
      true,
    );
    expect(commercialToolsOpen({ ...pastDue, now: new Date("2026-11-04T00:00:00.000Z") })).toBe(
      false,
    );
  });

  it("closes a past_due plan after the grace even after an assessment outside its window", () => {
    expect(
      commercialToolsOpen({
        stripeConfigured: true,
        subscriptionStatus: "past_due",
        assessmentPaidAt: "2026-03-01T00:00:00.000Z",
        assessmentRefundedAt: null,
        pastDueSince: "2026-10-20T00:00:00.000Z",
        now: new Date("2027-02-01T00:00:00.000Z"),
      }),
    ).toBe(false);
  });

  it("opens for an active plan or a paid assessment with no subscription", () => {
    expect(
      commercialToolsOpen({
        stripeConfigured: true,
        subscriptionStatus: "active",
        assessmentPaidAt: null,
        assessmentRefundedAt: null,
      }),
    ).toBe(true);
    // An assessment paid before the first deploy counts from that deploy.
    expect(
      commercialToolsOpen({
        stripeConfigured: true,
        subscriptionStatus: null,
        assessmentPaidAt: "2026-09-01T00:00:00.000Z",
        assessmentRefundedAt: null,
        now: new Date("2026-12-01T00:00:00.000Z"),
      }),
    ).toBe(true);
    expect(
      commercialToolsOpen({
        stripeConfigured: true,
        subscriptionStatus: null,
        assessmentPaidAt: null,
        assessmentRefundedAt: null,
      }),
    ).toBe(false);
  });

  it("closes again once the assessment is refunded, or its 90 days are over", () => {
    expect(
      commercialToolsOpen({
        stripeConfigured: true,
        subscriptionStatus: null,
        assessmentPaidAt: "2026-09-01T00:00:00.000Z",
        assessmentRefundedAt: "2026-09-20T00:00:00.000Z",
      }),
    ).toBe(false);
    expect(
      commercialToolsOpen({
        stripeConfigured: true,
        subscriptionStatus: null,
        assessmentPaidAt: "2026-09-01T00:00:00.000Z",
        assessmentRefundedAt: null,
        now: new Date("2027-01-10T00:00:00.000Z"),
      }),
    ).toBe(false);
    // An active plan keeps the tools open whatever happened to the assessment.
    expect(
      commercialToolsOpen({
        stripeConfigured: true,
        subscriptionStatus: "active",
        assessmentPaidAt: "2026-09-01T00:00:00.000Z",
        assessmentRefundedAt: "2026-09-20T00:00:00.000Z",
      }),
    ).toBe(true);
  });
});

describe("setStripeCustomer", () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await openTestDb();
  }, 60_000);
  afterAll(async () => {
    await db.close();
  });
  beforeEach(async () => {
    await db.clear("billing_accounts", "firm_members", "firms", '"user"');
    for (const id of ["owner", "other", "member"]) await db.seedUser(id, `${id}@firm.test`);
    await saveFirm(db.sql, "owner", "North Advisors", "monthly");
    await db.pg.exec(
      `insert into firm_members (firm_user_id, member_user_id, role) values ('owner', 'member', 'preparer')`,
    );
  });

  const customerOf = async (userId: string) =>
    (await loadBillingAccount(db.sql, userId))?.stripeCustomerId ?? null;

  it("links a customer, then says unchanged for the same one", async () => {
    expect(await isHandMarked(db.sql, "owner")).toBe(true);
    expect(await setStripeCustomer(db.sql, "owner", "cus_1")).toBe("linked");
    expect(await customerOf("owner")).toBe("cus_1");
    // The new row ends the hand-marked exception.
    expect(await isHandMarked(db.sql, "owner")).toBe(false);
    expect(await setStripeCustomer(db.sql, "owner", "cus_1")).toBe("unchanged");
  });

  it("refuses a customer another account holds, and another customer without Replace", async () => {
    await setStripeCustomer(db.sql, "other", "cus_other");
    await expect(setStripeCustomer(db.sql, "owner", "cus_other")).rejects.toMatchObject({
      status: 409,
      message: "That customer belongs to another account in Precog.",
    });
    await setStripeCustomer(db.sql, "owner", "cus_1");
    await expect(setStripeCustomer(db.sql, "owner", "cus_2")).rejects.toMatchObject({
      status: 409,
      message: "This account already has Stripe customer cus_1. Tick Replace to link another.",
    });
    expect(await setStripeCustomer(db.sql, "owner", "cus_2", { replace: true })).toBe("linked");
    expect(await customerOf("owner")).toBe("cus_2");
  });

  it("refuses a member of a firm who is not its owner", async () => {
    await expect(setStripeCustomer(db.sql, "member", "cus_m")).rejects.toMatchObject({
      status: 409,
      message:
        "member@firm.test is a member of North Advisors, not its owner. Link the firm owner's account.",
    });
    expect(await customerOf("member")).toBeNull();
  });

  it("words the no-running-subscription refusal the script and the operator page share", () => {
    expect(NO_RUNNING_SUBSCRIPTION("cus_1")).toBe(
      "Stripe customer cus_1 has no running subscription. Create the subscription in Stripe first, then link.",
    );
  });
});
