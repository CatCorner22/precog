import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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
import { createCheckoutSession, deleteCustomer } from "./stripe.server";
import {
  checkoutRefusal,
  commercialToolsOpen,
  loadBillingAccount,
  subscriptionStatusLabel,
  type BillingAccount,
} from "../firm/billing-store";
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
    expect(paid).toMatchObject({ kind: "assessment-paid", userId: "user-1", customerId: "cus_1" });
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

  it("reads a refund and a dispute off the charge events by their payment intent", () => {
    expect(
      billingChangeFor({
        id: "e",
        type: "charge.refunded",
        created: 100,
        data: { object: { refunded: true, payment_intent: "pi_1", invoice: null } },
      }),
    ).toEqual({
      kind: "assessment-refunded",
      paymentIntentId: "pi_1",
      eventAt: "1970-01-01T00:01:40.000Z",
    });
    // A partial refund is not a refund of the assessment; an invoice charge is the Firm plan's.
    expect(
      billingChangeFor({
        id: "e",
        type: "charge.refunded",
        data: { object: { refunded: false, payment_intent: "pi_1" } },
      }),
    ).toEqual({ kind: "ignore" });
    expect(
      billingChangeFor({
        id: "e",
        type: "charge.refunded",
        data: { object: { refunded: true, payment_intent: "pi_1", invoice: "in_1" } },
      }),
    ).toEqual({ kind: "ignore" });
    expect(
      billingChangeFor({
        id: "e",
        type: "charge.dispute.created",
        data: { object: { payment_intent: { id: "pi_1" }, status: "needs_response" } },
      }),
    ).toMatchObject({ kind: "assessment-dispute", paymentIntentId: "pi_1", status: "open" });
    expect(
      billingChangeFor({
        id: "e",
        type: "charge.dispute.closed",
        data: { object: { payment_intent: "pi_1", status: "lost" } },
      }),
    ).toMatchObject({ kind: "assessment-dispute", status: "lost" });
    expect(
      billingChangeFor({
        id: "e",
        type: "charge.dispute.closed",
        data: { object: { payment_intent: "pi_1", status: "won" } },
      }),
    ).toMatchObject({ kind: "assessment-dispute", status: "won" });
  });

  it("names every subscription status in plain words", () => {
    expect(subscriptionStatusLabel("active")).toBe("Active");
    expect(subscriptionStatusLabel("trialing")).toBe("Trial");
    expect(subscriptionStatusLabel("past_due")).toBe("Payment overdue");
    expect(subscriptionStatusLabel("incomplete")).toBe("Payment not finished");
    expect(subscriptionStatusLabel("incomplete_expired")).toBe("Checkout expired");
    expect(subscriptionStatusLabel("canceled")).toBe("Cancelled");
    expect(subscriptionStatusLabel("unpaid")).toBe("Unpaid");
    expect(subscriptionStatusLabel("paused")).toBe("Paused");
    expect(subscriptionStatusLabel(null)).toBe("None");
    expect(subscriptionStatusLabel("something_new")).toBe("something_new");
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

  const paidEvent = (id: string, intent: string, created?: number) => ({
    id,
    type: "checkout.session.completed",
    ...(created === undefined ? {} : { created }),
    data: {
      object: {
        mode: "payment",
        payment_status: "paid",
        client_reference_id: "owner",
        customer: "cus_1",
        payment_intent: intent,
      },
    },
  });
  const refundEvent = (id: string, intent: string, created = 500) => ({
    id,
    type: "charge.refunded",
    created,
    data: { object: { refunded: true, payment_intent: intent, invoice: null } },
  });
  const disputeEvent = (id: string, intent: string, status: string, created = 600) => ({
    id,
    type: status === "open" ? "charge.dispute.created" : "charge.dispute.closed",
    created,
    data: { object: { payment_intent: intent, status } },
  });
  const toolsOpen = async () => {
    const account = await loadBillingAccount(db.sql, "owner");
    return commercialToolsOpen({
      stripeConfigured: true,
      subscriptionStatus: account?.subscriptionStatus ?? null,
      assessmentPaidAt: account?.assessmentPaidAt ?? null,
      assessmentRefundedAt: account?.assessmentRefundedAt ?? null,
    });
  };

  it("stamps the assessment with the event time, or now when Stripe gave none", async () => {
    expect(await applyBillingEvent(db.sql, paidEvent("evt_p1", "pi_1", 100))).toBe("applied");
    expect(await loadBillingAccount(db.sql, "owner")).toMatchObject({
      assessmentPaidAt: "1970-01-01T00:01:40.000Z",
      assessmentPaymentIntentId: "pi_1",
      assessmentRefundedAt: null,
      assessmentDisputedAt: null,
    });
    await db.clear("billing_events", "billing_accounts");
    expect(await applyBillingEvent(db.sql, paidEvent("evt_p2", "pi_2"))).toBe("applied");
    const stamp = (await loadBillingAccount(db.sql, "owner"))?.assessmentPaidAt;
    expect(stamp).not.toBeNull();
    expect(Date.now() - Date.parse(stamp!)).toBeLessThan(60_000);
  });

  it("keeps the first stamp when the same payment is delivered again", async () => {
    await applyBillingEvent(db.sql, paidEvent("evt_p1", "pi_1", 100));
    expect(await applyBillingEvent(db.sql, paidEvent("evt_p1_again", "pi_1", 900))).toBe("applied");
    expect((await loadBillingAccount(db.sql, "owner"))?.assessmentPaidAt).toBe(
      "1970-01-01T00:01:40.000Z",
    );
  });

  it("closes the tools on a refund and reopens the Pay button, then a new payment reopens them", async () => {
    await applyBillingEvent(db.sql, paidEvent("evt_p1", "pi_1", 100));
    expect(await toolsOpen()).toBe(true);
    expect(checkoutRefusal(await loadBillingAccount(db.sql, "owner"), "assessment")).toMatch(
      /already paid/,
    );
    expect(await applyBillingEvent(db.sql, refundEvent("evt_r1", "pi_1"))).toBe("applied");
    const refunded = await loadBillingAccount(db.sql, "owner");
    expect(refunded?.assessmentRefundedAt).toBe("1970-01-01T00:08:20.000Z");
    expect(await toolsOpen()).toBe(false);
    expect(checkoutRefusal(refunded, "assessment")).toBeNull();
    expect((await loadFirmFor(db.sql, "owner"))?.plan).toBe("assessment");
    // A new payment with a new intent.
    expect(await applyBillingEvent(db.sql, paidEvent("evt_p2", "pi_2", 1000))).toBe("applied");
    expect(await loadBillingAccount(db.sql, "owner")).toMatchObject({
      assessmentPaidAt: "1970-01-01T00:16:40.000Z",
      assessmentPaymentIntentId: "pi_2",
      assessmentRefundedAt: null,
    });
    expect(await toolsOpen()).toBe(true);
  });

  it("treats a lost dispute as a refund and a won one as nothing", async () => {
    await applyBillingEvent(db.sql, paidEvent("evt_p1", "pi_1", 100));
    expect(await applyBillingEvent(db.sql, disputeEvent("evt_d1", "pi_1", "open"))).toBe("applied");
    expect((await loadBillingAccount(db.sql, "owner"))?.assessmentDisputedAt).toBe(
      "1970-01-01T00:10:00.000Z",
    );
    expect(await toolsOpen()).toBe(true);
    expect(await applyBillingEvent(db.sql, disputeEvent("evt_d2", "pi_1", "won"))).toBe("applied");
    expect(await loadBillingAccount(db.sql, "owner")).toMatchObject({
      assessmentDisputedAt: null,
      assessmentRefundedAt: null,
    });
    expect(await applyBillingEvent(db.sql, disputeEvent("evt_d3", "pi_1", "open"))).toBe("applied");
    expect(await applyBillingEvent(db.sql, disputeEvent("evt_d4", "pi_1", "lost"))).toBe("applied");
    expect(await loadBillingAccount(db.sql, "owner")).toMatchObject({
      assessmentDisputedAt: null,
      assessmentRefundedAt: "1970-01-01T00:10:00.000Z",
    });
    expect(await toolsOpen()).toBe(false);
  });

  it("keeps the Firm plan when a refunded assessment sits under a running subscription", async () => {
    await applyBillingEvent(db.sql, paidEvent("evt_p1", "pi_1", 100));
    await applyBillingEvent(db.sql, created("active"));
    expect((await loadFirmFor(db.sql, "owner"))?.plan).toBe("monthly");
    await applyBillingEvent(db.sql, refundEvent("evt_r1", "pi_1"));
    expect((await loadFirmFor(db.sql, "owner"))?.plan).toBe("monthly");
    expect(await toolsOpen()).toBe(true);
  });

  it("ignores a refund or dispute whose intent is not the stored one", async () => {
    await applyBillingEvent(db.sql, paidEvent("evt_p1", "pi_1", 100));
    expect(await applyBillingEvent(db.sql, refundEvent("evt_r_other", "pi_other"))).toBe("ignored");
    expect(await applyBillingEvent(db.sql, disputeEvent("evt_d_other", "pi_other", "open"))).toBe(
      "ignored",
    );
    expect(await loadBillingAccount(db.sql, "owner")).toMatchObject({
      assessmentRefundedAt: null,
      assessmentDisputedAt: null,
    });
    // A payment recorded before intents were stored has nothing to match.
    await db.clear("billing_events", "billing_accounts");
    await db.sql`
      insert into billing_accounts (user_id, stripe_customer_id, assessment_paid_at)
      values ('owner', 'cus_1', now())
    `;
    expect(await applyBillingEvent(db.sql, disputeEvent("evt_d_old", "pi_1", "open"))).toBe(
      "ignored",
    );
    expect(await applyBillingEvent(db.sql, refundEvent("evt_r_old", "pi_1"))).toBe("ignored");
    // A refund on an invoice charge is the Firm plan's, not the assessment's.
    expect(
      await applyBillingEvent(db.sql, {
        id: "evt_r_invoice",
        type: "charge.refunded",
        data: { object: { refunded: true, payment_intent: "pi_1", invoice: "in_1" } },
      }),
    ).toBe("ignored");
  });
});

describe("event order", () => {
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

  const subEvent = (id: string, type: string, sub: string, status: string, created: number) =>
    parseStripeEvent(
      JSON.stringify({
        id,
        type,
        created,
        data: { object: { id: sub, status, customer: "cus_1", metadata: { userId: "owner" } } },
      }),
    )!;

  it("ignores a retried update that Stripe created before the cancellation", async () => {
    await applyBillingEvent(
      db.sql,
      subEvent("e1", "customer.subscription.created", "sub_1", "active", 100),
    );
    await applyBillingEvent(
      db.sql,
      subEvent("e3", "customer.subscription.deleted", "sub_1", "canceled", 300),
    );
    expect((await loadFirmFor(db.sql, "owner"))?.plan).toBe("assessment");
    // The update that failed earlier comes back after the cancellation.
    await applyBillingEvent(
      db.sql,
      subEvent("e2", "customer.subscription.updated", "sub_1", "active", 200),
    );
    expect((await loadBillingAccount(db.sql, "owner"))?.subscriptionStatus).toBe("canceled");
    expect((await loadFirmFor(db.sql, "owner"))?.plan).toBe("assessment");
  });

  it("does not let a cancelled duplicate subscription end the one the firm pays for", async () => {
    await applyBillingEvent(
      db.sql,
      subEvent("e1", "customer.subscription.created", "sub_old", "active", 100),
    );
    await applyBillingEvent(
      db.sql,
      subEvent("e2", "customer.subscription.deleted", "sub_old", "canceled", 150),
    );
    await applyBillingEvent(
      db.sql,
      subEvent("e3", "customer.subscription.created", "sub_new", "active", 200),
    );
    // A late event for the old subscription, and then another duplicate being cancelled.
    await applyBillingEvent(
      db.sql,
      subEvent("e4", "customer.subscription.updated", "sub_old", "active", 120),
    );
    await applyBillingEvent(
      db.sql,
      subEvent("e5", "customer.subscription.deleted", "sub_dup", "canceled", 400),
    );
    const account = await loadBillingAccount(db.sql, "owner");
    expect(account).toMatchObject({ subscriptionId: "sub_new", subscriptionStatus: "active" });
    expect((await loadFirmFor(db.sql, "owner"))?.plan).toBe("monthly");
  });

  it("applies a newer event for the same subscription and a new one after a cancellation", async () => {
    await applyBillingEvent(
      db.sql,
      subEvent("e1", "customer.subscription.created", "sub_1", "active", 100),
    );
    await applyBillingEvent(
      db.sql,
      subEvent("e2", "customer.subscription.updated", "sub_1", "past_due", 200),
    );
    expect((await loadBillingAccount(db.sql, "owner"))?.subscriptionStatus).toBe("past_due");
    await applyBillingEvent(
      db.sql,
      subEvent("e3", "customer.subscription.deleted", "sub_1", "canceled", 300),
    );
    await applyBillingEvent(
      db.sql,
      subEvent("e4", "customer.subscription.created", "sub_2", "active", 400),
    );
    expect(await loadBillingAccount(db.sql, "owner")).toMatchObject({
      subscriptionId: "sub_2",
      subscriptionStatus: "active",
    });
  });
});

describe("starting checkout", () => {
  const account = (over: Partial<BillingAccount>): BillingAccount => ({
    stripeCustomerId: "cus_1",
    subscriptionId: null,
    subscriptionStatus: null,
    assessmentPaidAt: null,
    assessmentPaymentIntentId: null,
    assessmentRefundedAt: null,
    assessmentDisputedAt: null,
    currentPeriodEnd: null,
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...over,
  });

  it("refuses a second Firm plan or a second assessment payment", () => {
    expect(checkoutRefusal(null, "monthly")).toBeNull();
    expect(checkoutRefusal(account({ subscriptionStatus: "active" }), "monthly")).toMatch(
      /already active/,
    );
    expect(checkoutRefusal(account({ subscriptionStatus: "past_due" }), "monthly")).not.toBeNull();
    expect(checkoutRefusal(account({ subscriptionStatus: "canceled" }), "monthly")).toBeNull();
    expect(checkoutRefusal(account({ subscriptionStatus: "active" }), "assessment")).toBeNull();
    expect(
      checkoutRefusal(account({ assessmentPaidAt: "2026-09-01T00:00:00.000Z" }), "assessment"),
    ).toMatch(/already paid/);
    expect(
      checkoutRefusal(
        account({
          assessmentPaidAt: "2026-09-01T00:00:00.000Z",
          assessmentRefundedAt: "2026-09-20T00:00:00.000Z",
        }),
        "assessment",
      ),
    ).toBeNull();
  });

  describe("the Stripe request", () => {
    const calls: { url: string; method: string; body: string; headers: Record<string, string> }[] =
      [];
    let answer: () => Response;
    beforeEach(() => {
      calls.length = 0;
      answer = () => new Response(JSON.stringify({ url: "https://checkout.example/s" }));
      vi.stubEnv("STRIPE_SECRET_KEY", "sk_test");
      vi.stubEnv("STRIPE_PRICE_ASSESSMENT", "price_a");
      vi.stubEnv("STRIPE_PRICE_MONTHLY", "price_m");
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init: RequestInit) => {
          calls.push({
            url,
            method: String(init.method),
            body: String(init.body),
            headers: init.headers as Record<string, string>,
          });
          return answer();
        }),
      );
    });
    afterEach(() => {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    });

    const input = {
      userId: "owner",
      email: "o@example.com",
      customerId: null as string | null,
      billingVersion: "v1" as string | null,
      plan: "monthly" as const,
      origin: "https://precog.example",
    };

    it("reuses the stored Stripe customer instead of the email", async () => {
      await createCheckoutSession({ ...input, customerId: "cus_1" });
      await createCheckoutSession(input);
      expect(calls[0].body).toContain("customer=cus_1");
      expect(calls[0].body).not.toContain("customer_email");
      expect(calls[1].body).toContain("customer_email=o%40example.com");
    });

    it("sends the same idempotency key until the stored billing state moves", async () => {
      await createCheckoutSession(input);
      await createCheckoutSession(input);
      await createCheckoutSession({ ...input, billingVersion: "v2" });
      await createCheckoutSession({ ...input, plan: "assessment" });
      const keys = calls.map((c) => c.headers["idempotency-key"]);
      expect(keys[0]).toMatch(/^checkout-[0-9a-f]{64}$/);
      expect(keys[1]).toBe(keys[0]);
      expect(new Set(keys).size).toBe(3);
    });

    it("collects the billing address and tax id and prices the sale with Stripe Tax", async () => {
      await createCheckoutSession({ ...input, plan: "assessment" });
      await createCheckoutSession({ ...input, plan: "assessment", customerId: "cus_1" });
      await createCheckoutSession(input);
      for (const call of calls) {
        expect(call.body).toContain("automatic_tax%5Benabled%5D=true");
        expect(call.body).toContain("billing_address_collection=required");
        expect(call.body).toContain("tax_id_collection%5Benabled%5D=true");
      }
      // A first payment creates the customer so a refund can find it; the
      // intent's metadata names the account for the Stripe dashboard.
      expect(calls[0].body).toContain("customer_creation=always");
      expect(calls[0].body).toContain("payment_intent_data%5Bmetadata%5D%5BuserId%5D=owner");
      expect(calls[0].body).toContain("payment_intent_data%5Bmetadata%5D%5Bplan%5D=assessment");
      expect(calls[0].body).not.toContain("customer_update");
      // Stripe refuses customer_creation and customer_update without a customer, or both at once.
      expect(calls[1].body).not.toContain("customer_creation");
      expect(calls[1].body).toContain("customer_update%5Baddress%5D=auto");
      expect(calls[1].body).toContain("customer_update%5Bname%5D=auto");
      expect(calls[2].body).not.toContain("customer_creation");
      expect(calls[2].body).not.toContain("payment_intent_data");
    });

    it("deletes the Stripe customer and treats one already gone as deleted", async () => {
      await deleteCustomer("cus_1");
      expect(calls[0]).toMatchObject({
        url: "https://api.stripe.com/v1/customers/cus_1",
        method: "DELETE",
      });
      answer = () =>
        new Response(
          JSON.stringify({ error: { code: "resource_missing", message: "No such customer" } }),
          { status: 404 },
        );
      await expect(deleteCustomer("cus_1")).resolves.toBeUndefined();
      answer = () =>
        new Response(JSON.stringify({ error: { message: "Stripe is down" } }), { status: 500 });
      await expect(deleteCustomer("cus_1")).rejects.toThrow("Stripe is down");
    });
  });
});

describe("loading plan prices", () => {
  const price = (amount: number, interval: string | null) =>
    new Response(
      JSON.stringify({
        unit_amount: amount,
        currency: "usd",
        recurring: interval ? { interval } : null,
      }),
    );
  let fail = false;
  const fetchMock = vi.fn(async (url: string) => {
    if (fail) return new Response(JSON.stringify({ error: { message: "down" } }), { status: 500 });
    return url.endsWith("price_m") ? price(29_900, "month") : price(100_000, null);
  });

  beforeEach(() => {
    vi.resetModules();
    fail = false;
    fetchMock.mockClear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-03T12:00:00Z"));
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test");
    vi.stubEnv("STRIPE_PRICE_ASSESSMENT", "price_a");
    vi.stubEnv("STRIPE_PRICE_MONTHLY", "price_m");
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("does not ask Stripe again for a minute after a failure", async () => {
    const { loadPlanPrices } = await import("./stripe.server");
    fail = true;
    expect(await loadPlanPrices()).toBeNull();
    const after = fetchMock.mock.calls.length;
    expect(after).toBeGreaterThan(0);
    expect(await loadPlanPrices()).toBeNull();
    expect(fetchMock.mock.calls.length).toBe(after);
    vi.setSystemTime(new Date("2026-10-03T12:01:01Z"));
    fail = false;
    expect(await loadPlanPrices()).toMatchObject({ monthly: { amount: 299 } });
    expect(fetchMock.mock.calls.length).toBeGreaterThan(after);
  });

  it("keeps serving the last good prices when a later read fails", async () => {
    const { loadPlanPrices } = await import("./stripe.server");
    expect(await loadPlanPrices()).toEqual({
      assessment: { amount: 1000, currency: "usd", interval: null },
      monthly: { amount: 299, currency: "usd", interval: "month" },
    });
    vi.setSystemTime(new Date("2026-10-03T12:11:00Z"));
    fail = true;
    expect(await loadPlanPrices()).toMatchObject({ assessment: { amount: 1000 } });
    const after = fetchMock.mock.calls.length;
    expect(await loadPlanPrices()).toMatchObject({ assessment: { amount: 1000 } });
    expect(fetchMock.mock.calls.length).toBe(after);
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
