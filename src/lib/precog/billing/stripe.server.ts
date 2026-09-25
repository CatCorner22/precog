import { encodeStripeParams, type CheckoutPlan } from "./stripe";

/**
 * Stripe calls that need the secret key. Configured when STRIPE_SECRET_KEY
 * and the two price ids are set; the firm workspace shows a "billing not
 * connected" state otherwise and keeps the manual stage buttons.
 */
const env = (key: string): string | undefined => {
  const value = process.env[key]?.trim();
  return value || undefined;
};

export function stripeConfigured(): boolean {
  return Boolean(
    env("STRIPE_SECRET_KEY") && env("STRIPE_PRICE_ASSESSMENT") && env("STRIPE_PRICE_MONTHLY"),
  );
}

export function stripeWebhookSecret(): string | undefined {
  return env("STRIPE_WEBHOOK_SECRET");
}

async function stripePost<T>(path: string, params: Record<string, unknown>): Promise<T> {
  const key = env("STRIPE_SECRET_KEY");
  if (!key) throw new Error("Stripe is not configured");
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/x-www-form-urlencoded",
      "stripe-version": "2024-06-20",
    },
    body: encodeStripeParams(params),
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await res.json()) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(body.error?.message ?? `Stripe answered ${res.status}`);
  return body;
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
  const session = await stripePost<{ url: string | null }>("/checkout/sessions", {
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
  const session = await stripePost<{ url: string }>("/billing_portal/sessions", {
    customer: input.customerId,
    return_url: `${input.origin}/firm`,
  });
  return { url: session.url };
}
