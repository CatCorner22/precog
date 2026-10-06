import { encodeStripeParams, type CheckoutPlan, type PlanPrice, type PlanPrices } from "./stripe";
import { CHECKOUT_PLANS, isSubscriptionPlan, type Tier } from "../firm/pricing";
import type { Sql } from "@/lib/db";
import { env } from "@/lib/env.server";
import { RequestError } from "@/lib/request-errors";
import { toHex } from "@/lib/web-crypto";
import {
  assessmentCreditApplies,
  markAssessmentCreditUsed,
  recordStripeCustomer,
  type BillingAccount,
} from "../firm/billing-store";

/**
 * Stripe calls that need the secret key. Configured when STRIPE_SECRET_KEY
 * and the two price ids are set; the firm workspace shows a "billing not
 * connected" state otherwise and keeps the manual stage buttons.
 */
export function stripeConfigured(): boolean {
  return Boolean(
    env("STRIPE_SECRET_KEY") && env("STRIPE_PRICE_ASSESSMENT") && env("STRIPE_PRICE_MONTHLY"),
  );
}

export function stripeWebhookSecret(): string | undefined {
  return env("STRIPE_WEBHOOK_SECRET");
}

/**
 * The Stripe price a Checkout plan charges. Starter monthly ("tier1", and the
 * stale "monthly") is STRIPE_PRICE_TIER_1, else STRIPE_PRICE_MONTHLY, so once
 * the Starter price is set Checkout never sells the legacy price again.
 * Undefined when the plan's id is not set (that tier is not offered).
 */
export function priceIdFor(plan: CheckoutPlan): string | undefined {
  switch (plan) {
    case "assessment":
      return env("STRIPE_PRICE_ASSESSMENT");
    case "monthly":
    case "tier1":
      return env("STRIPE_PRICE_TIER_1") || env("STRIPE_PRICE_MONTHLY");
    case "tier2":
      return env("STRIPE_PRICE_TIER_2");
    case "tier3":
      return env("STRIPE_PRICE_TIER_3");
    case "tier1_annual":
      return env("STRIPE_PRICE_TIER_1_ANNUAL");
    case "tier2_annual":
      return env("STRIPE_PRICE_TIER_2_ANNUAL");
    case "tier3_annual":
      return env("STRIPE_PRICE_TIER_3_ANNUAL");
  }
}

/** The plan a Checkout request names; "monthly" stays accepted as Starter monthly (a tab opened before the tiers). */
export function parseCheckoutPlan(plan: unknown): CheckoutPlan {
  if (typeof plan !== "string" || !CHECKOUT_PLANS.includes(plan as CheckoutPlan)) {
    throw new RequestError(400, "Unknown plan");
  }
  return plan as CheckoutPlan;
}

export const TIER_NOT_OFFERED =
  "That tier is not offered on this deployment yet. Write to Support.";

/** Refuses (409) a tier or yearly plan whose Stripe price id is not set on this deployment. */
export function assertPlanOffered(plan: CheckoutPlan): void {
  if (!priceIdFor(plan)) throw new RequestError(409, TIER_NOT_OFFERED);
}

/**
 * The tier a subscription's price stands for, or null when Precog does not
 * know it. The legacy STRIPE_PRICE_MONTHLY is Starter only when it is also
 * STRIPE_PRICE_TIER_1; otherwise it maps to null, so every subscription that
 * ran before the tiers keeps 50 clients until its price changes in Stripe.
 */
export function tierForPrice(priceId: string | null): Tier | null {
  if (!priceId) return null;
  const tier1 = env("STRIPE_PRICE_TIER_1");
  if (priceId === tier1 || priceId === env("STRIPE_PRICE_TIER_1_ANNUAL")) return 1;
  if (priceId === env("STRIPE_PRICE_TIER_2") || priceId === env("STRIPE_PRICE_TIER_2_ANNUAL"))
    return 2;
  if (priceId === env("STRIPE_PRICE_TIER_3") || priceId === env("STRIPE_PRICE_TIER_3_ANNUAL"))
    return 3;
  return null;
}

/**
 * The amounts of the prices the checkout buttons charge, so the buttons
 * print what the customer pays: the Assessment and Starter monthly are
 * required; each other tier and yearly price is read when its id is set and
 * is null when it is not or Stripe could not read it. Cached for ten
 * minutes; null when Stripe is not configured or does not answer. When
 * Stripe fails, the last good prices keep serving while the module holds
 * any, else the failure is cached for a minute, so a page anyone can load
 * (sign-in) cannot drive a request to Stripe per visit.
 */
export async function loadPlanPrices(): Promise<PlanPrices | null> {
  if (priceCache && priceCache.expiresAt > Date.now()) return priceCache.prices;
  const assessmentId = env("STRIPE_PRICE_ASSESSMENT");
  const monthlyId = priceIdFor("tier1");
  if (!assessmentId || !monthlyId || !env("STRIPE_SECRET_KEY")) return null;
  const optional = (plan: CheckoutPlan): Promise<PlanPrice | null> => {
    const id = priceIdFor(plan);
    return id ? loadPrice(id).catch(() => null) : Promise.resolve(null);
  };
  try {
    const [assessment, monthly, t1y, t2m, t2y, t3m, t3y] = await Promise.all([
      loadPrice(assessmentId),
      loadPrice(monthlyId),
      optional("tier1_annual"),
      optional("tier2"),
      optional("tier2_annual"),
      optional("tier3"),
      optional("tier3_annual"),
    ]);
    const prices: PlanPrices = {
      assessment,
      monthly,
      tiers: {
        1: { month: monthly, year: t1y },
        2: { month: t2m, year: t2y },
        3: { month: t3m, year: t3y },
      },
    };
    priceCache = { prices, expiresAt: Date.now() + PRICE_CACHE_MS };
    return prices;
  } catch {
    const stale = priceCache?.prices ?? null;
    priceCache = { prices: stale, expiresAt: Date.now() + PRICE_ERROR_CACHE_MS };
    return stale;
  }
}

/**
 * A Checkout Session for the fixed assessment (one payment) or the Firm plan
 * (a subscription on the chosen tier and interval). The account id rides
 * along so the webhook can attribute the payment without a customer lookup.
 * An account Stripe already knows reuses its customer, so every subscription
 * stays in one billing portal; a first payment creates one, so a refund of it
 * can be found later. Card and US bank account (ACH) are offered on both; an
 * ACH Assessment completes unpaid and opens nothing until Stripe confirms the
 * payment (checkout.session.async_payment_succeeded).
 *
 * A Firm plan Checkout first names a Stripe customer (creating one, keyed on
 * the account, when none is stored; nothing is written here, the webhook
 * stores it on completion) and keeps one open subscription Checkout per
 * account: an open one for the same plan is handed back as it is, and every
 * other open one is expired (expireOtherCheckouts), so a Starter Checkout
 * left open in another tab cannot complete beside a Practice one.
 *
 * The idempotency key covers the request, the stored billing state
 * (`billingVersion`, which the webhook moves), the hour, and the sessions
 * this call expired: a second click or tab inside the hour gets the same
 * session back instead of a second charge, and a session Stripe expired
 * (after 24 hours, or by this call) is never handed back again.
 *
 * Stripe Tax prices the sale by the collected address, so the Stripe account
 * must have Stripe Tax activated and a registration for each state where
 * Precog collects (docs/OPERATIONS.md). The payment intent's metadata is for
 * the Stripe dashboard; the webhook attributes a refund by the intent id.
 */
export async function createCheckoutSession(input: {
  userId: string;
  email: string | null;
  customerId: string | null;
  billingVersion: string | null;
  plan: CheckoutPlan;
  origin: string;
  /** The clock (ms), for the hour in the idempotency key; tests pass it. */
  now?: number;
}): Promise<{ url: string }> {
  const price = priceIdFor(input.plan);
  if (!price) throw new Error("Stripe is not configured");
  const subscription = isSubscriptionPlan(input.plan);
  let customerId = input.customerId;
  let expiredIds: string[] = [];
  if (subscription) {
    customerId ??= (await createCustomer({ userId: input.userId, email: input.email })).id;
    const open = await expireOtherCheckouts({ customerId, userId: input.userId, plan: input.plan });
    if (open.reuse) return { url: open.reuse };
    expiredIds = open.expiredIds;
  }
  const params = {
    mode: subscription ? "subscription" : "payment",
    line_items: [{ price, quantity: 1 }],
    client_reference_id: input.userId,
    // Stripe refuses a request that names both.
    ...(customerId
      ? { customer: customerId, customer_update: { address: "auto", name: "auto" } }
      : { customer_email: input.email ?? undefined }),
    // Stripe refuses customer_creation alongside a customer.
    ...(input.plan === "assessment" && !customerId ? { customer_creation: "always" } : {}),
    metadata: { userId: input.userId, plan: input.plan },
    ...(subscription
      ? { subscription_data: { metadata: { userId: input.userId } } }
      : { payment_intent_data: { metadata: { userId: input.userId, plan: "assessment" } } }),
    payment_method_types: ["card", "us_bank_account"],
    automatic_tax: { enabled: true },
    billing_address_collection: "required",
    tax_id_collection: { enabled: true },
    success_url: `${input.origin}/firm?billing=success`,
    cancel_url: `${input.origin}/firm?billing=cancelled`,
    allow_promotion_codes: true,
  };
  const hourBucket = Math.floor((input.now ?? Date.now()) / HOUR_MS);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      `${input.billingVersion ?? "none"}\n${hourBucket}\n${expiredIds.join(",")}\n${encodeStripeParams(params)}`,
    ),
  );
  const session = await stripeRequest<{ url: string | null }>(
    "POST",
    "/checkout/sessions",
    params,
    `checkout-${toHex(new Uint8Array(digest))}`,
  );
  if (!session.url) throw new Error("Stripe returned no checkout link");
  return { url: session.url };
}

const HOUR_MS = 3_600_000;

/** "monthly" is the stale name of Starter monthly, so the two are one plan. */
function samePlan(a: unknown, b: CheckoutPlan): boolean {
  const norm = (plan: unknown) => (plan === "monthly" ? "tier1" : plan);
  return norm(a) === norm(b);
}

/**
 * The account's open subscription Checkouts on its customer: an open one for
 * the same plan is handed back (`reuse`, its link); every other one the
 * account started is expired, and their ids come back sorted for the
 * idempotency key. Sessions another account started on the same customer
 * are left alone.
 */
export async function expireOtherCheckouts(input: {
  customerId: string;
  userId: string;
  plan: CheckoutPlan;
}): Promise<{ reuse: string | null; expiredIds: string[] }> {
  const list = await stripeRequest<{
    data?: {
      id: string;
      url: string | null;
      mode: string;
      metadata?: Record<string, unknown> | null;
    }[];
  }>(
    "GET",
    `/checkout/sessions?customer=${encodeURIComponent(input.customerId)}&status=open&limit=10`,
  );
  const mine = (list.data ?? []).filter(
    (s) => s.mode === "subscription" && s.metadata?.userId === input.userId,
  );
  const reuse = mine.find((s) => samePlan(s.metadata?.plan, input.plan) && s.url) ?? null;
  const expiredIds: string[] = [];
  for (const session of mine) {
    if (session === reuse) continue;
    await stripeRequest("POST", `/checkout/sessions/${encodeURIComponent(session.id)}/expire`);
    expiredIds.push(session.id);
  }
  return { reuse: reuse?.url ?? null, expiredIds: expiredIds.sort() };
}

/** A Stripe customer for an account that has none yet (an Assessment paid before Checkout created one). */
export async function createCustomer(input: {
  userId: string;
  email: string | null;
}): Promise<{ id: string }> {
  return stripeRequest<{ id: string }>(
    "POST",
    "/customers",
    { ...(input.email ? { email: input.email } : {}), metadata: { userId: input.userId } },
    `customer-${input.userId}`,
  );
}

/**
 * Posts a credit to the customer's balance, which Stripe draws down across
 * the following invoices until spent. A negative amount is a credit in
 * Stripe's terms. The idempotency key makes a retry after a lost answer
 * post nothing twice; it names the Assessment payment (its paid-at time),
 * so an Assessment paid again after a refund earns its own credit even
 * inside the day Stripe remembers the key.
 */
export async function creditCustomerBalance(
  customerId: string,
  amountCents: number,
  description: string,
  userId: string,
  assessmentPaidAt: string | null,
): Promise<void> {
  await stripeRequest(
    "POST",
    `/customers/${encodeURIComponent(customerId)}/balance_transactions`,
    { amount: -amountCents, currency: "usd", description },
    `credit-${customerId}-${userId}-${assessmentPaidAt ?? "unknown"}`,
  );
}

/** The description every Assessment-credit reversal carries on the customer balance. */
const REVERSAL_DESCRIPTION = "Assessment credit reversed";

/**
 * The `reversal_for` metadata of an Assessment-credit reversal: the account
 * and the Assessment payment (its paid-at time) whose credit it takes back.
 * The scheduled run finds an earlier reversal by it (findCreditReversal).
 */
export function creditReversalTag(userId: string, assessmentPaidAt: string | null): string {
  return `${userId}:${assessmentPaidAt ?? "unknown"}`;
}

/**
 * Takes a posted credit back (a refunded Assessment keeps no credit). Keyed
 * on the Assessment payment like the credit, so a later payment's reversal
 * is not swallowed by this one's cached answer, and tagged with
 * creditReversalTag, so a retry after Stripe has forgotten the key (about a
 * day) finds the reversal instead of posting it again.
 */
export async function reverseCustomerBalance(input: {
  userId: string;
  customerId: string;
  amountCents: number;
  assessmentPaidAt: string | null;
}): Promise<void> {
  await stripeRequest(
    "POST",
    `/customers/${encodeURIComponent(input.customerId)}/balance_transactions`,
    {
      amount: input.amountCents,
      currency: "usd",
      description: REVERSAL_DESCRIPTION,
      metadata: { reversal_for: creditReversalTag(input.userId, input.assessmentPaidAt) },
    },
    `credit-reversal-${input.customerId}-${input.assessmentPaidAt ?? "unknown"}`,
  );
}

/** Pages of 100 read before findCreditReversal gives up rather than guess. */
const REVERSAL_LOOKUP_PAGES = 20;

type BalanceTransaction = {
  id: string;
  amount: number;
  created: number;
  description: string | null;
  metadata: Record<string, string> | null;
};

/**
 * True when the customer's balance already holds the reversal of this
 * Assessment payment's credit: a transaction tagged with its
 * creditReversalTag, or (posted before the tag existed) an untagged
 * "Assessment credit reversed" of the same amount created after the payment.
 * Reads newest first and stops at transactions older than the payment.
 * Throws when Stripe cannot answer or the history is longer than it reads,
 * so the caller posts nothing on a guess.
 */
export async function findCreditReversal(input: {
  userId: string;
  customerId: string;
  amountCents: number;
  assessmentPaidAt: string | null;
}): Promise<boolean> {
  const tag = creditReversalTag(input.userId, input.assessmentPaidAt);
  const paidAtSeconds = input.assessmentPaidAt
    ? Math.floor(Date.parse(input.assessmentPaidAt) / 1000)
    : null;
  let after: string | null = null;
  for (let page = 0; page < REVERSAL_LOOKUP_PAGES; page += 1) {
    const query = new URLSearchParams({ limit: "100" });
    if (after) query.set("starting_after", after);
    const list = await stripeRequest<{ data?: BalanceTransaction[]; has_more?: boolean }>(
      "GET",
      `/customers/${encodeURIComponent(input.customerId)}/balance_transactions?${query}`,
    );
    if (!Array.isArray(list.data)) throw new Error("Stripe balance transactions unreadable");
    for (const txn of list.data) {
      const reversalFor = txn.metadata?.reversal_for;
      if (reversalFor === tag) return true;
      if (
        reversalFor === undefined &&
        txn.description === REVERSAL_DESCRIPTION &&
        txn.amount === input.amountCents &&
        (paidAtSeconds === null || txn.created >= paidAtSeconds)
      ) {
        return true;
      }
    }
    const oldest = list.data.at(-1);
    if (!list.has_more || !oldest) return false;
    if (paidAtSeconds !== null && oldest.created < paidAtSeconds) return false;
    after = oldest.id;
  }
  throw new Error(`Stripe balance history of ${input.customerId} too long to search`);
}

export const ASSESSMENT_PRICE_UNKNOWN =
  "Precog cannot read the Assessment price to credit it. Try again in a minute.";

/**
 * Before the first Firm plan Checkout of an account that paid the Assessment:
 * credits the pre-tax fee to the Stripe customer balance (the fee stored at
 * payment, else the configured price) and stamps the row, so the credit is
 * posted once. An account with no customer yet gets one first. Nothing
 * happens when the credit does not apply. Returns the customer to check out
 * with.
 */
export async function applyAssessmentCredit(
  sql: Sql,
  input: { userId: string; email: string | null; account: BillingAccount | null },
): Promise<{ customerId: string | null; creditedCents: number | null }> {
  const { account } = input;
  if (!account || !assessmentCreditApplies(account)) {
    return { customerId: account?.stripeCustomerId ?? null, creditedCents: null };
  }
  const price = account.assessmentFeeCents ?? (await loadPlanPrices())?.assessment.amount;
  const creditCents =
    account.assessmentFeeCents ?? (typeof price === "number" ? Math.round(price * 100) : null);
  if (creditCents === null || creditCents <= 0)
    throw new RequestError(409, ASSESSMENT_PRICE_UNKNOWN);
  let customerId = account.stripeCustomerId;
  if (!customerId) {
    customerId = (await createCustomer({ userId: input.userId, email: input.email })).id;
    await recordStripeCustomer(sql, input.userId, customerId);
  }
  await creditCustomerBalance(
    customerId,
    creditCents,
    "Assessment credit",
    input.userId,
    account.assessmentPaidAt,
  );
  await markAssessmentCreditUsed(sql, input.userId, creditCents);
  return { customerId, creditedCents: creditCents };
}

/**
 * After the firm changes owner: the subscription's metadata names the new
 * owner, so a later subscription event that falls back to it lands on the
 * right account. Best effort; nothing without the secret key.
 */
export async function updateSubscriptionMetadata(
  subscriptionId: string,
  input: { userId: string },
): Promise<void> {
  if (!env("STRIPE_SECRET_KEY")) return;
  await stripeRequest("POST", `/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    metadata: { userId: input.userId },
  });
}

/**
 * After the firm changes owner: Stripe's receipts and failed-payment emails
 * go to the new owner's address, and the customer names the new account.
 * Best effort; nothing without the secret key.
 */
export async function updateCustomer(
  customerId: string,
  input: { email: string | null; userId: string },
): Promise<void> {
  if (!env("STRIPE_SECRET_KEY")) return;
  await stripeRequest("POST", `/customers/${encodeURIComponent(customerId)}`, {
    ...(input.email ? { email: input.email } : {}),
    metadata: { userId: input.userId },
  });
}

/** A Billing Portal session so the firm can update its card or cancel. */
export async function createPortalSession(input: {
  customerId: string;
  origin: string;
}): Promise<{ url: string }> {
  const session = await stripeRequest<{ url: string }>("POST", "/billing_portal/sessions", {
    customer: input.customerId,
    return_url: `${input.origin}/firm`,
  });
  return { url: session.url };
}

/**
 * Deletes the account's Stripe customer when the account is deleted. Stripe
 * keeps the invoices, receipts and tax records the law requires. A customer
 * Stripe no longer has counts as deleted. Needs only the secret key: an
 * account can hold a customer from before the prices were configured.
 */
export async function deleteCustomer(customerId: string): Promise<void> {
  if (!env("STRIPE_SECRET_KEY")) return;
  try {
    await stripeRequest("DELETE", `/customers/${encodeURIComponent(customerId)}`);
  } catch (error) {
    if (error instanceof StripeError && error.code === "resource_missing") return;
    throw error;
  }
}

async function loadPrice(id: string): Promise<PlanPrice> {
  const price = await stripeRequest<{
    unit_amount: number | null;
    currency: string;
    recurring: { interval: string } | null;
  }>("GET", `/prices/${encodeURIComponent(id)}`);
  if (typeof price.unit_amount !== "number") throw new Error("Stripe price has no fixed amount");
  return {
    amount: price.unit_amount / 100,
    currency: price.currency,
    interval: price.recurring?.interval ?? null,
  };
}

/** A refusal from Stripe, with its error code when Stripe gave one. */
class StripeError extends Error {
  constructor(
    message: string,
    readonly code: string | null,
  ) {
    super(message);
  }
}

async function stripeRequest<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  params?: Record<string, unknown>,
  idempotencyKey?: string,
): Promise<T> {
  const key = env("STRIPE_SECRET_KEY");
  if (!key) throw new Error("Stripe is not configured");
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: {
      authorization: `Bearer ${key}`,
      "stripe-version": "2024-06-20",
      ...(params ? { "content-type": "application/x-www-form-urlencoded" } : {}),
      ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
    },
    body: params ? encodeStripeParams(params) : undefined,
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await res.json()) as T & { error?: { message?: string; code?: string } };
  if (!res.ok) {
    throw new StripeError(
      body.error?.message ?? `Stripe answered ${res.status}`,
      body.error?.code ?? null,
    );
  }
  return body;
}

const PRICE_CACHE_MS = 10 * 60 * 1000;
/** How long a failed price read is remembered before Stripe is asked again. */
const PRICE_ERROR_CACHE_MS = 60_000;
let priceCache: { prices: PlanPrices | null; expiresAt: number } | null = null;
