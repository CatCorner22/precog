import { encodeStripeParams, type CheckoutPlan, type PlanPrice } from "./stripe";
import { env } from "@/lib/env.server";

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
 * not configured or does not answer.
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
    return null;
  }
}

/**
 * A Checkout Session for the fixed assessment (one payment) or the firm plan
 * (a subscription). The account id rides along so the webhook can attribute
 * the payment without a customer lookup.
 */
export async function createCheckoutSession(input: {
  userId: string;
  email: string | null;
  plan: CheckoutPlan;
  origin: string;
}): Promise<{ url: string }> {
  const price =
    input.plan === "monthly" ? env("STRIPE_PRICE_MONTHLY") : env("STRIPE_PRICE_ASSESSMENT");
  if (!price) throw new Error("Stripe is not configured");
  const session = await stripeRequest<{ url: string | null }>("POST", "/checkout/sessions", {
    mode: input.plan === "monthly" ? "subscription" : "payment",
    line_items: [{ price, quantity: 1 }],
    client_reference_id: input.userId,
    customer_email: input.email ?? undefined,
    metadata: { userId: input.userId, plan: input.plan },
    ...(input.plan === "monthly"
      ? { subscription_data: { metadata: { userId: input.userId } } }
      : {}),
    success_url: `${input.origin}/firm?billing=success`,
    cancel_url: `${input.origin}/firm?billing=cancelled`,
    allow_promotion_codes: true,
  });
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

async function stripeRequest<T>(
  method: "GET" | "POST",
  path: string,
  params?: Record<string, unknown>,
): Promise<T> {
  const key = env("STRIPE_SECRET_KEY");
  if (!key) throw new Error("Stripe is not configured");
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: {
      authorization: `Bearer ${key}`,
      "stripe-version": "2024-06-20",
      ...(params ? { "content-type": "application/x-www-form-urlencoded" } : {}),
    },
    body: params ? encodeStripeParams(params) : undefined,
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await res.json()) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(body.error?.message ?? `Stripe answered ${res.status}`);
  return body;
}

const PRICE_CACHE_MS = 10 * 60 * 1000;
let priceCache: { prices: Record<CheckoutPlan, PlanPrice>; expiresAt: number } | null = null;
