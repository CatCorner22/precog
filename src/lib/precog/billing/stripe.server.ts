import { encodeStripeParams, type CheckoutPlan, type PlanPrice } from "./stripe";
import { env } from "@/lib/env.server";
import { toHex } from "@/lib/web-crypto";

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
 * The amounts of the two prices the checkout buttons charge, so the buttons
 * print what the customer pays. Cached for ten minutes; null when Stripe is
 * not configured or does not answer. When Stripe fails, the last good prices
 * keep serving while the module holds any, else the failure is cached for a
 * minute, so a page anyone can load (sign-in) cannot drive a request to
 * Stripe per visit.
 */
export async function loadPlanPrices(): Promise<Record<CheckoutPlan, PlanPrice> | null> {
  if (priceCache && priceCache.expiresAt > Date.now()) return priceCache.prices;
  const assessmentId = env("STRIPE_PRICE_ASSESSMENT");
  const monthlyId = env("STRIPE_PRICE_MONTHLY");
  if (!assessmentId || !monthlyId || !env("STRIPE_SECRET_KEY")) return null;
  try {
    const [assessment, monthly] = await Promise.all([
      loadPrice(assessmentId),
      loadPrice(monthlyId),
    ]);
    const prices = { assessment, monthly };
    priceCache = { prices, expiresAt: Date.now() + PRICE_CACHE_MS };
    return prices;
  } catch {
    const stale = priceCache?.prices ?? null;
    priceCache = { prices: stale, expiresAt: Date.now() + PRICE_ERROR_CACHE_MS };
    return stale;
  }
}

/**
 * A Checkout Session for the fixed assessment (one payment) or the firm plan
 * (a subscription). The account id rides along so the webhook can attribute
 * the payment without a customer lookup. An account Stripe already knows
 * reuses its customer, so every subscription stays in one billing portal;
 * a first payment creates one, so a refund of it can be found later. The
 * idempotency key covers the request and the stored billing state
 * (`billingVersion`, which the webhook moves): a second click or tab before
 * the webhook lands gets the same session back instead of a second charge.
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
}): Promise<{ url: string }> {
  const price =
    input.plan === "monthly" ? env("STRIPE_PRICE_MONTHLY") : env("STRIPE_PRICE_ASSESSMENT");
  if (!price) throw new Error("Stripe is not configured");
  const params = {
    mode: input.plan === "monthly" ? "subscription" : "payment",
    line_items: [{ price, quantity: 1 }],
    client_reference_id: input.userId,
    // Stripe refuses a request that names both.
    ...(input.customerId
      ? { customer: input.customerId, customer_update: { address: "auto", name: "auto" } }
      : { customer_email: input.email ?? undefined }),
    // Stripe refuses customer_creation alongside a customer.
    ...(input.plan === "assessment" && !input.customerId ? { customer_creation: "always" } : {}),
    metadata: { userId: input.userId, plan: input.plan },
    ...(input.plan === "monthly"
      ? { subscription_data: { metadata: { userId: input.userId } } }
      : { payment_intent_data: { metadata: { userId: input.userId, plan: "assessment" } } }),
    automatic_tax: { enabled: true },
    billing_address_collection: "required",
    tax_id_collection: { enabled: true },
    success_url: `${input.origin}/firm?billing=success`,
    cancel_url: `${input.origin}/firm?billing=cancelled`,
    allow_promotion_codes: true,
  };
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${input.billingVersion ?? "none"}\n${encodeStripeParams(params)}`),
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
let priceCache: { prices: Record<CheckoutPlan, PlanPrice> | null; expiresAt: number } | null = null;
