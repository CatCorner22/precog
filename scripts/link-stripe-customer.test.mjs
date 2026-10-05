/**
 * The link script against an embedded Postgres with every migration and a
 * stubbed Stripe: it writes the row setStripeCustomer writes, refuses what
 * setStripeCustomer refuses with the same words, and writes nothing without
 * --yes or when the customer has no running subscription.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { openTestDb } from "../src/test/pglite";
import {
  loadBillingAccount,
  NO_RUNNING_SUBSCRIPTION as STORE_TEXT,
  setStripeCustomer,
} from "../src/lib/precog/firm/billing-store";
import { entitlementsFor } from "../src/lib/precog/firm/entitlements";
import { loadFirmFor, saveFirm } from "../src/lib/precog/firm/store";
import { parseStripeEvent } from "../src/lib/precog/billing/stripe";
import { applyBillingEvent } from "../src/lib/precog/billing/webhook";
import {
  linkCustomer,
  LinkRefused,
  NO_RUNNING_SUBSCRIPTION,
  planLine,
} from "./lib/link-stripe-customer.mjs";

const ENV = { STRIPE_PRICE_TIER_1: "price_t1", STRIPE_PRICE_TIER_2_ANNUAL: "price_t2y" };
const RENEWS = Date.parse("2026-11-04T00:00:00Z") / 1000;

let db;
beforeAll(async () => {
  db = await openTestDb();
}, 60_000);
afterAll(async () => {
  await db.close();
});

/** Stripe with customers cus_1, cus_2 and whatever subscriptions a test gives them. */
function stripeFake(subscriptions = {}) {
  const posts = [];
  return {
    posts,
    stripeGet: async (path) => {
      const customer = path.match(/^\/customers\/(cus_[a-z0-9]+)$/);
      if (customer) {
        if (customer[1] === "cus_1") return { id: "cus_1", email: "billing@firm.test" };
        return customer[1] === "cus_2" ? { id: "cus_2" } : null;
      }
      const list = path.match(/^\/subscriptions\?customer=(cus_[a-z0-9]+)&status=all&limit=100$/);
      if (list) return { data: subscriptions[list[1]] ?? [] };
      throw new Error(`unexpected GET ${path}`);
    },
    stripePost: async (path, form) => {
      posts.push([path, form]);
      return {};
    },
  };
}

const running = (status = "active", price = "price_t1") => ({
  id: "sub_net30",
  status,
  created: 200,
  current_period_end: RENEWS,
  items: { data: [{ price: { id: price } }] },
});

async function run(input, stripe = stripeFake({ cus_1: [running()] })) {
  const lines = [];
  const result = await linkCustomer({
    query: async (text, params) => (await db.pg.query(text, params)).rows,
    stripeGet: stripe.stripeGet,
    stripePost: stripe.stripePost,
    env: ENV,
    log: (line) => lines.push(line),
    ...input,
  });
  return { result, lines, posts: stripe.posts };
}

const row = async (userId) =>
  (
    await db.pg.query(
      `select stripe_customer_id, subscription_id, subscription_status, subscription_price_id,
         current_period_end from billing_accounts where user_id = $1`,
      [userId],
    )
  ).rows[0] ?? null;

describe("linking a Stripe customer from the script", () => {
  beforeEach(async () => {
    await db.clear("billing_accounts", "firm_members", "firms", '"user"');
    for (const id of ["owner", "other", "member", "solo"]) await db.seedUser(id, `${id}@firm.test`);
    await saveFirm(db.sql, "owner", "North Advisors", "monthly");
    await db.pg.exec(
      `insert into firm_members (firm_user_id, member_user_id, role) values ('owner', 'member', 'preparer')`,
    );
  });

  it("copies the store's refusal text word for word", () => {
    expect(NO_RUNNING_SUBSCRIPTION("cus_9")).toBe(STORE_TEXT("cus_9"));
  });

  it("prints the plan the account will have and writes nothing without --yes", async () => {
    const { result, lines, posts } = await run({ account: "owner@firm.test", customerId: "cus_1" });
    expect(result.outcome).toBe("dry-run");
    expect(lines).toContain("Plan after linking: Firm plan · Starter, active, renews 2026-11-04");
    expect(lines).toContain("Nothing written. Run again with --yes to link.");
    expect(await row("owner")).toBeNull();
    expect(posts).toEqual([]);
  });

  it("writes the same customer row setStripeCustomer writes, and applies the subscription", async () => {
    const { result, lines, posts } = await run({
      account: "owner",
      customerId: "cus_1",
      yes: true,
    });
    expect(result.outcome).toBe("linked");
    expect(lines).toEqual([
      "Account: owner@firm.test (owner)",
      "Stripe customer: cus_1 (billing@firm.test)",
      "Plan after linking: Firm plan · Starter, active, renews 2026-11-04",
      "Linked cus_1 to owner.",
      "Applied subscription sub_net30 (active).",
      "Named owner on the Stripe customer.",
    ]);
    expect(await row("owner")).toMatchObject({
      stripe_customer_id: "cus_1",
      subscription_id: "sub_net30",
      subscription_status: "active",
      subscription_price_id: "price_t1",
    });
    expect(posts).toEqual([["/customers/cus_1", { "metadata[userId]": "owner" }]]);
    expect((await loadFirmFor(db.sql, "owner"))?.plan).toBe("monthly");
    // The store's statement on a second account gives the same customer column.
    await setStripeCustomer(db.sql, "solo", "cus_solo");
    const viaStore = await loadBillingAccount(db.sql, "solo");
    await db.pg.query(`delete from billing_accounts where user_id = 'solo'`);
    await run(
      { account: "solo", customerId: "cus_2", yes: true },
      stripeFake({ cus_2: [running()] }),
    );
    const viaScript = await loadBillingAccount(db.sql, "solo");
    expect(viaStore?.stripeCustomerId).toBe("cus_solo");
    expect(viaScript?.stripeCustomerId).toBe("cus_2");
    // Both leave the same columns set apart from what the script applies from Stripe.
    expect(viaStore?.assessmentPaidAt).toBe(viaScript?.assessmentPaidAt);
    expect(viaStore?.assessmentCreditUsedAt).toBe(viaScript?.assessmentCreditUsedAt);
  });

  it("prints each step when the customer is already linked, and keeps a price only for the same subscription", async () => {
    await setStripeCustomer(db.sql, "owner", "cus_2");
    await db.pg.query(
      `update billing_accounts set subscription_id = 'sub_old', subscription_status = 'canceled',
         subscription_price_id = 'price_t3' where user_id = 'owner'`,
    );
    const noItems = { ...running(), items: undefined };
    const { result, lines } = await run(
      { account: "owner", customerId: "cus_2", yes: true },
      stripeFake({ cus_2: [noItems] }),
    );
    expect(result.outcome).toBe("unchanged");
    expect(lines).toEqual([
      "Account: owner@firm.test (owner)",
      "Stripe customer: cus_2",
      "Plan after linking: Firm plan, active, renews 2026-11-04",
      "Already linked to cus_2.",
      "Applied subscription sub_net30 (active).",
      "Named owner on the Stripe customer.",
    ]);
    // A new subscription never keeps the old one's tier.
    expect(await row("owner")).toMatchObject({
      subscription_id: "sub_net30",
      subscription_price_id: null,
    });
    // The same subscription with no items keeps its stored price.
    await db.pg.query(
      `update billing_accounts set subscription_price_id = 'price_t1' where user_id = 'owner'`,
    );
    await run(
      { account: "owner", customerId: "cus_2", yes: true },
      stripeFake({ cus_2: [noItems] }),
    );
    expect((await row("owner"))?.subscription_price_id).toBe("price_t1");
  });

  it("stamps the link time, so a subscription event sent before the link cannot undo it", async () => {
    await run({ account: "owner", customerId: "cus_1", yes: true });
    expect((await row("owner"))?.subscription_status).toBe("active");
    // Stripe refused this past_due update before the link and retries it now.
    const event = (id, status, created) =>
      parseStripeEvent(
        JSON.stringify({
          id,
          type: "customer.subscription.updated",
          created,
          data: { object: { id: "sub_net30", status, customer: "cus_1" } },
        }),
      );
    await applyBillingEvent(db.sql, event("e_before_link", "past_due", 100));
    expect((await row("owner"))?.subscription_status).toBe("active");
    const pastDue = await db.pg.query(
      `select past_due_since from billing_accounts where user_id = 'owner'`,
    );
    expect(pastDue.rows[0].past_due_since).toBeNull();
    // An event Stripe creates after the link still applies.
    const later = Math.ceil(Date.now() / 1000) + 60;
    await applyBillingEvent(db.sql, event("e_after_link", "past_due", later));
    expect((await row("owner"))?.subscription_status).toBe("past_due");
  });

  it("refuses with the store's words: another account, another customer, a member", async () => {
    await setStripeCustomer(db.sql, "other", "cus_1");
    await expect(run({ account: "owner", customerId: "cus_1", yes: true })).rejects.toThrow(
      new LinkRefused("That customer belongs to another account in Precog."),
    );
    await expect(setStripeCustomer(db.sql, "owner", "cus_1")).rejects.toThrow(
      "That customer belongs to another account in Precog.",
    );

    await setStripeCustomer(db.sql, "owner", "cus_2");
    await expect(
      run({ account: "owner", customerId: "cus_1", yes: true }, stripeFake({ cus_1: [running()] })),
    ).rejects.toThrow("That customer belongs to another account in Precog.");
    await db.pg.query(`delete from billing_accounts where user_id = 'other'`);
    await expect(run({ account: "owner", customerId: "cus_1", yes: true })).rejects.toThrow(
      "This account already has Stripe customer cus_2. Tick Replace to link another.",
    );
    const replaced = await run({ account: "owner", customerId: "cus_1", yes: true, replace: true });
    expect(replaced.result.outcome).toBe("linked");
    expect((await row("owner"))?.stripe_customer_id).toBe("cus_1");

    await expect(run({ account: "member@firm.test", customerId: "cus_2" })).rejects.toThrow(
      "member@firm.test is a member of North Advisors, not its owner. Link the firm owner's account.",
    );
    await expect(setStripeCustomer(db.sql, "member", "cus_2")).rejects.toThrow(
      "member@firm.test is a member of North Advisors, not its owner. Link the firm owner's account.",
    );
    expect(await row("member")).toBeNull();
  });

  it("refuses an unknown account and a customer Stripe does not have", async () => {
    await expect(run({ account: "nobody@firm.test", customerId: "cus_1" })).rejects.toThrow(
      "No Precog account has nobody@firm.test.",
    );
    await expect(run({ account: "owner", customerId: "cus_404" })).rejects.toThrow(
      "Stripe has no customer cus_404.",
    );
  });

  it("refuses a customer with no running subscription, leaving a hand-marked firm on its plan", async () => {
    const canceled = stripeFake({ cus_1: [{ ...running("canceled"), id: "sub_old" }] });
    for (const replace of [false, true]) {
      await expect(
        run({ account: "owner", customerId: "cus_1", yes: true, replace }, canceled),
      ).rejects.toThrow(STORE_TEXT("cus_1"));
    }
    expect(await row("owner")).toBeNull();
    const firm = await loadFirmFor(db.sql, "owner");
    expect(
      entitlementsFor({
        stripeConfigured: true,
        firmPlan: firm?.plan ?? null,
        billing: await loadBillingAccount(db.sql, "owner"),
        now: new Date("2026-12-01T00:00:00Z"),
      }).plan,
    ).toBe("firm");
  });

  it("links with --replace an account not marked by hand even without a running subscription", async () => {
    await expect(
      run({ account: "solo", customerId: "cus_2", yes: true }, stripeFake({ cus_2: [] })),
    ).rejects.toThrow(STORE_TEXT("cus_2"));
    const { result, lines } = await run(
      { account: "solo", customerId: "cus_2", yes: true, replace: true },
      stripeFake({ cus_2: [] }),
    );
    expect(result.outcome).toBe("linked");
    expect(lines).toContain("Plan after linking: no Firm plan (the customer has no subscription)");
    expect((await row("solo"))?.stripe_customer_id).toBe("cus_2");
    // With no subscription to apply, the script's row is the store's row.
    await setStripeCustomer(db.sql, "other", "cus_other");
    const full = async (userId) => {
      const rows = (
        await db.pg.query(`select * from billing_accounts where user_id = $1`, [userId])
      ).rows;
      const { user_id: _u, stripe_customer_id: _c, updated_at: _t, ...rest } = rows[0];
      return rest;
    };
    expect(await full("solo")).toEqual(await full("other"));
  });

  it("names the tier from the price, and only a running subscription as a Firm plan", () => {
    expect(planLine(running("past_due", "price_t2y"), ENV)).toBe(
      "Plan after linking: Firm plan · Practice, past_due, renews 2026-11-04",
    );
    expect(planLine(running("active", "price_legacy"), ENV)).toBe(
      "Plan after linking: Firm plan, active, renews 2026-11-04",
    );
    expect(planLine(running("canceled"), ENV)).toBe(
      "Plan after linking: no Firm plan (the newest subscription is canceled)",
    );
  });
});
