import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Sql } from "@/lib/db";
import { openTestDb, type TestDb } from "@/test/pglite";
import {
  billingChangeFor,
  encodeStripeParams,
  formatPlanPrice,
  parseSignatureHeader,
  parseStripeEvent,
  signPayload,
  verifyStripeSignature,
} from "./stripe";
import { applyBillingEvent } from "./webhook";
import { loadBillingAccount } from "../firm/billing-store";
import { loadFirmFor, saveFirm } from "../firm/store";

describe("stripe signatures", () => {
  const secret = "whsec_test";
  const payload = '{"id":"evt_1","type":"x","data":{"object":{}}}';

  it("accepts a fresh signature made with the secret and rejects the rest", async () => {
    const t = 1_700_000_000;
    const v1 = await signPayload(secret, t, payload);
    const header = `t=${t},v1=${v1}`;
    expect(await verifyStripeSignature(payload, header, secret, t + 10)).toBe(true);
    expect(await verifyStripeSignature(payload, header, secret, t + 600)).toBe(false);
    expect(await verifyStripeSignature(`${payload} `, header, secret, t)).toBe(false);
    expect(await verifyStripeSignature(payload, header, "other", t)).toBe(false);
    expect(await verifyStripeSignature(payload, null, secret, t)).toBe(false);
  });

  it("parses the header shape Stripe sends", () => {
    expect(parseSignatureHeader(`t=1,v1=${"a".repeat(64)},v0=zz`)).toEqual({
      timestamp: 1,
      signatures: ["a".repeat(64)],
    });
    expect(parseSignatureHeader("garbage")).toBeNull();
  });
});

describe("plan prices", () => {
  it("prints the Stripe amount, with cents only when there are some", () => {
    expect(formatPlanPrice({ amount: 1000, currency: "usd", interval: null })).toBe("$1,000");
    expect(formatPlanPrice({ amount: 299, currency: "usd", interval: "month" })).toBe(
      "$299 a month",
    );
    expect(formatPlanPrice({ amount: 299.5, currency: "usd", interval: "month" })).toBe(
      "$299.50 a month",
    );
    expect(formatPlanPrice({ amount: 250, currency: "eur", interval: null })).toBe("€250");
  });
});

describe("billing changes", () => {
  it("reads a paid assessment and a new subscription off checkout completion", () => {
    const paid = billingChangeFor({
      id: "evt",
      type: "checkout.session.completed",
      data: {
        object: {
          mode: "payment",
          payment_status: "paid",
          client_reference_id: "user-1",
          customer: "cus_1",
        },
      },
    });
    expect(paid).toEqual({ kind: "assessment-paid", userId: "user-1", customerId: "cus_1" });
    const sub = billingChangeFor({
      id: "evt",
      type: "checkout.session.completed",
      data: {
        object: { mode: "subscription", subscription: "sub_1", metadata: { userId: "user-1" } },
      },
    });
    expect(sub).toMatchObject({ kind: "subscription", subscriptionId: "sub_1", status: null });
  });

  it("maps a cancelled subscription to canceled and ignores unrelated events", () => {
    expect(
      billingChangeFor({
        id: "evt",
        type: "customer.subscription.deleted",
        data: {
          object: {
            id: "sub_1",
            status: "active",
            customer: "cus_1",
            current_period_end: 1_700_000_000,
          },
        },
      }),
    ).toMatchObject({
      kind: "subscription",
      status: "canceled",
      currentPeriodEnd: "2023-11-14T22:13:20.000Z",
    });
    expect(billingChangeFor({ id: "e", type: "invoice.paid", data: { object: {} } })).toEqual({
      kind: "ignore",
    });
    expect(parseStripeEvent("nope")).toBeNull();
  });

  it("form-encodes nested params the way Stripe expects", () => {
    expect(
      encodeStripeParams({
        mode: "payment",
        line_items: [{ price: "p_1", quantity: 1 }],
        metadata: { userId: "u" },
      }),
    ).toBe(
      "mode=payment&line_items%5B0%5D%5Bprice%5D=p_1&line_items%5B0%5D%5Bquantity%5D=1&metadata%5BuserId%5D=u",
    );
  });
});

describe("applying events", () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await openTestDb();
  }, 60_000);
  afterAll(async () => {
    await db.close();
  });
  beforeEach(async () => {
    await db.clear("billing_events", "billing_accounts", "firm_members", "firms", '"user"');
    await db.seedUser("owner");
    await saveFirm(db.sql, "owner", "North", "assessment");
  });

  it("records the subscription, moves the plan, and skips a redelivery", async () => {
    const event = {
      id: "evt_1",
      type: "checkout.session.completed",
      data: {
        object: {
          mode: "subscription",
          subscription: "sub_1",
          customer: "cus_1",
          client_reference_id: "owner",
        },
      },
    };
    expect(await applyBillingEvent(db.sql, event)).toBe("applied");
    expect(await applyBillingEvent(db.sql, event)).toBe("duplicate");
    expect((await loadFirmFor(db.sql, "owner"))?.plan).toBe("monthly");

    // A later cancellation, attributed through the customer id alone.
    expect(
      await applyBillingEvent(db.sql, {
        id: "evt_2",
        type: "customer.subscription.deleted",
        data: { object: { id: "sub_1", status: "canceled", customer: "cus_1" } },
      }),
    ).toBe("applied");
    expect((await loadFirmFor(db.sql, "owner"))?.plan).toBe("assessment");
    expect((await loadBillingAccount(db.sql, "owner"))?.subscriptionStatus).toBe("canceled");
  });

  const checkout = {
    id: "evt_checkout",
    type: "checkout.session.completed",
    data: {
      object: {
        mode: "subscription",
        subscription: "sub_1",
        customer: "cus_1",
        client_reference_id: "owner",
      },
    },
  };
  const created = (status: string) => ({
    id: `evt_created_${status}`,
    type: "customer.subscription.created",
    data: {
      object: {
        id: "sub_1",
        status,
        customer: "cus_1",
        current_period_end: 1_800_000_000,
        metadata: { userId: "owner" },
      },
    },
  });

  it("leaves the event unclaimed when applying it fails, so the retry applies it", async () => {
    const paid = {
      id: "evt_paid",
      type: "checkout.session.completed",
      data: {
        object: {
          mode: "payment",
          payment_status: "paid",
          client_reference_id: "owner",
          customer: "cus_1",
        },
      },
    };
    await expect(applyBillingEvent(failingOnStatement(db.sql, 2), paid)).rejects.toThrow("db down");
    expect(await db.pg.query("select id from billing_events")).toMatchObject({ rows: [] });
    expect(await applyBillingEvent(db.sql, paid)).toBe("applied");
    expect((await loadBillingAccount(db.sql, "owner"))?.assessmentPaidAt).not.toBeNull();
  }, 60_000);

  it("keeps the renewal date when the checkout event arrives after the subscription event", async () => {
    expect(await applyBillingEvent(db.sql, created("active"))).toBe("applied");
    expect(await applyBillingEvent(db.sql, checkout)).toBe("applied");
    const account = await loadBillingAccount(db.sql, "owner");
    expect(account?.subscriptionStatus).toBe("active");
    expect(account?.currentPeriodEnd).toBe("2027-01-15T08:00:00.000Z");
  });

  it("does not turn an incomplete subscription active on a late checkout event", async () => {
    expect(await applyBillingEvent(db.sql, created("incomplete"))).toBe("applied");
    expect(await applyBillingEvent(db.sql, checkout)).toBe("applied");
    expect((await loadBillingAccount(db.sql, "owner"))?.subscriptionStatus).toBe("incomplete");
    expect((await loadFirmFor(db.sql, "owner"))?.plan).toBe("assessment");
  });
});

/** The same database, with statement `n` of each transaction failing. */
function failingOnStatement(sql: Sql, n: number): Sql {
  const wrap = (tx: Sql): Sql => {
    let count = 0;
    const failing = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
      count += 1;
      if (count === n) throw new Error("db down");
      return tx(strings, ...values);
    }) as Sql;
    failing.query = tx.query;
    failing.transaction = (work) => work(failing);
    return failing;
  };
  const outer = wrap(sql);
  outer.transaction = (work) => sql.transaction!((tx) => work(wrap(tx)));
  return outer;
}
