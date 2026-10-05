import { env } from "@/lib/env.server";
import { RequestError } from "@/lib/request-errors";
import { stripeHasNoCustomer } from "./texts";

/** The fields of a Stripe subscription the link reads. */
export interface StripeSubscription {
  id: string;
  status: string;
  created: number | null;
  /** Seconds since 1970, as Stripe sends it; null when absent. */
  currentPeriodEnd: number | null;
  priceId: string | null;
}

/** Statuses that keep the Firm plan running. */
export const RUNNING_STATUSES = new Set(["active", "trialing", "past_due"]);

/**
 * The customer's newest subscriptions, newest first (one Stripe read). A
 * customer Stripe does not have is a 409 naming it. Called only when
 * billing is connected; the secret key never leaves the server.
 */
export async function listCustomerSubscriptions(customerId: string): Promise<StripeSubscription[]> {
  const key = env("STRIPE_SECRET_KEY");
  if (!key) throw new Error("Stripe is not configured");
  const res = await fetch(
    `https://api.stripe.com/v1/subscriptions?customer=${encodeURIComponent(customerId)}&status=all&limit=3`,
    {
      method: "GET",
      headers: { authorization: `Bearer ${key}`, "stripe-version": "2024-06-20" },
      signal: AbortSignal.timeout(10_000),
    },
  );
  const body = (await res.json()) as {
    data?: Array<Record<string, unknown>>;
    error?: { message?: string; code?: string };
  };
  if (!res.ok) {
    if (body.error?.code === "resource_missing") {
      throw new RequestError(409, stripeHasNoCustomer(customerId));
    }
    throw new Error(body.error?.message ?? `Stripe answered ${res.status}`);
  }
  return (body.data ?? []).map(toSubscription).sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
}

function toSubscription(raw: Record<string, unknown>): StripeSubscription {
  const items = raw.items as { data?: Array<{ price?: unknown }> } | undefined;
  const price = items?.data?.[0]?.price;
  return {
    id: String(raw.id),
    status: String(raw.status),
    created: typeof raw.created === "number" ? raw.created : null,
    currentPeriodEnd: typeof raw.current_period_end === "number" ? raw.current_period_end : null,
    priceId:
      typeof price === "string"
        ? price
        : typeof (price as { id?: unknown } | undefined)?.id === "string"
          ? (price as { id: string }).id
          : null,
  };
}

/** The subscription a link applies: the newest running one, else (with Replace) the newest. */
export function subscriptionToApply(subscriptions: StripeSubscription[]): {
  running: StripeSubscription | null;
  applied: StripeSubscription | null;
} {
  const running = subscriptions.find((s) => RUNNING_STATUSES.has(s.status)) ?? null;
  return { running, applied: running ?? subscriptions[0] ?? null };
}
