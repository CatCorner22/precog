/**
 * The parts of Stripe this app needs, spoken directly over HTTPS so no SDK
 * runs at import time. Pure helpers live here (testable without a network);
 * the calls that need the secret key are in `stripe.server.ts`.
 */
import { constantTimeEqual, hmacSha256, toHex } from "@/lib/web-crypto";

// The plan types and the price formatter live in ../firm/pricing so a page
// that prints prices (the sign-in page) does not pull web-crypto in with them.
export { formatPlanPrice, type CheckoutPlan, type PlanPrice } from "../firm/pricing";

export interface StripeEvent {
  id: string;
  type: string;
  /** When Stripe created the event, in Unix seconds; orders subscription events. */
  created?: number;
  data: { object: Record<string, unknown> };
}

/** What a webhook event means for an account, independent of Stripe's shapes. */
export type BillingChange =
  | {
      kind: "assessment-paid";
      userId: string;
      customerId: string | null;
      /** The payment intent behind the charge; a refund or dispute names it. */
      paymentIntentId: string | null;
      /** When Stripe created the event (ISO), or null when it did not say. */
      eventAt: string | null;
      /** The session's amount before tax, in cents (what the Assessment credit posts), or null. */
      amountSubtotalCents: number | null;
    }
  | { kind: "assessment-refunded"; paymentIntentId: string; eventAt: string | null }
  | {
      kind: "assessment-dispute";
      paymentIntentId: string;
      /**
       * open: Stripe opened a dispute or an inquiry. lost: the money went
       * back. won: the dispute closed any other way (won, an inquiry closed
       * without a chargeback, the charge refunded meanwhile), which clears
       * the mark.
       */
      status: "open" | "won" | "lost";
      eventAt: string | null;
    }
  | {
      kind: "subscription";
      userId: string | null;
      customerId: string | null;
      subscriptionId: string;
      /** Null when the event knows only the ids (a completed checkout). */
      status: string | null;
      currentPeriodEnd: string | null;
      /** When Stripe created the event (ISO), or null when it did not say. */
      eventAt: string | null;
      /** Stripe's reason on a cancellation ("payment_failed" when its retries ran out), else null. */
      cancellationReason: string | null;
    }
  | {
      /** An invoice on the subscription was not paid; the subscription events move the status. */
      kind: "payment-failed";
      customerId: string | null;
      subscriptionId: string;
      /** Stripe's hosted invoice page, where the card can be fixed without signing in. */
      hostedInvoiceUrl: string | null;
      eventAt: string | null;
    }
  | { kind: "ignore" };

const SIGNATURE_TOLERANCE_SECONDS = 300;

/** `Stripe-Signature: t=…,v1=…[,v1=…]` → its parts, or null when malformed. */
export function parseSignatureHeader(header: string | null): {
  timestamp: number;
  signatures: string[];
} | null {
  if (!header) return null;
  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const [key, value] = part.trim().split("=", 2);
    if (key === "t" && value && /^\d+$/.test(value)) timestamp = Number(value);
    if (key === "v1" && value && /^[a-f0-9]{64}$/.test(value)) signatures.push(value);
  }
  return timestamp !== null && signatures.length > 0 ? { timestamp, signatures } : null;
}

/** HMAC-SHA256 hex of `${timestamp}.${payload}` with the endpoint secret. */
export async function signPayload(
  secret: string,
  timestamp: number,
  payload: string,
): Promise<string> {
  return toHex(await hmacSha256(secret, `${timestamp}.${payload}`));
}

/**
 * True when the signature header was produced with `secret` over this exact
 * payload within the tolerance window. Same scheme as Stripe's SDK.
 */
export async function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  const parsed = parseSignatureHeader(header);
  if (!parsed) return false;
  if (Math.abs(nowSeconds - parsed.timestamp) > SIGNATURE_TOLERANCE_SECONDS) return false;
  const expected = await signPayload(secret, parsed.timestamp, payload);
  return parsed.signatures.some((sig) => constantTimeEqual(sig, expected));
}

export function parseStripeEvent(payload: string): StripeEvent | null {
  try {
    const value = JSON.parse(payload) as Partial<StripeEvent>;
    if (
      typeof value?.id !== "string" ||
      typeof value.type !== "string" ||
      !value.data ||
      typeof value.data.object !== "object" ||
      value.data.object === null
    ) {
      return null;
    }
    return {
      id: value.id,
      type: value.type,
      ...(typeof value.created === "number" ? { created: value.created } : {}),
      data: { object: value.data.object },
    };
  } catch {
    return null;
  }
}

function str(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

/** A Stripe reference that arrives as an id or as the expanded object. */
function idOf(value: unknown): string | null {
  if (typeof value === "string") return value || null;
  if (value && typeof value === "object") return str((value as { id?: unknown }).id);
  return null;
}

function customerIdOf(object: Record<string, unknown>): string | null {
  return idOf(object.customer);
}

/**
 * Reads the account and plan change out of the events this app subscribes
 * to. The user id rides in `client_reference_id` / metadata on checkout
 * (set when the session is created); subscription events carry only the
 * customer id, which the store maps back to an account. A checkout
 * completion carries no subscription status or renewal date: those come from
 * the customer.subscription.* events, whichever order they arrive in. A
 * delayed payment method completes through async_payment_succeeded.
 *
 * A refund (charge.refunded, once the charge is fully refunded) and a
 * dispute (charge.dispute.created / closed) carry only the payment intent;
 * the store matches it against the intent stored with the assessment
 * payment. A refund on an invoice charge is the Firm plan's, which the
 * subscription events already describe, so it is ignored here.
 */
export function billingChangeFor(event: StripeEvent): BillingChange {
  const object = event.data.object;
  const eventAt =
    typeof event.created === "number" ? new Date(event.created * 1000).toISOString() : null;
  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    const metadata = (object.metadata ?? {}) as Record<string, unknown>;
    const userId = str(object.client_reference_id) ?? str(metadata.userId);
    if (!userId) return { kind: "ignore" };
    const customerId = customerIdOf(object);
    if (object.mode === "subscription") {
      const subscriptionId = str(object.subscription);
      if (!subscriptionId) return { kind: "ignore" };
      return {
        kind: "subscription",
        userId,
        customerId,
        subscriptionId,
        status: null,
        currentPeriodEnd: null,
        eventAt,
        cancellationReason: null,
      };
    }
    if (object.mode === "payment" && object.payment_status === "paid") {
      return {
        kind: "assessment-paid",
        userId,
        customerId,
        paymentIntentId: idOf(object.payment_intent),
        eventAt,
        amountSubtotalCents:
          typeof object.amount_subtotal === "number" ? object.amount_subtotal : null,
      };
    }
    return { kind: "ignore" };
  }
  if (event.type === "invoice.payment_failed") {
    // A one-off or dashboard invoice has no subscription and never marks one past due.
    const subscriptionId = idOf(object.subscription);
    if (!subscriptionId) return { kind: "ignore" };
    return {
      kind: "payment-failed",
      customerId: customerIdOf(object),
      subscriptionId,
      hostedInvoiceUrl: str(object.hosted_invoice_url),
      eventAt,
    };
  }
  if (event.type === "charge.refunded") {
    const paymentIntentId = idOf(object.payment_intent);
    if (object.refunded !== true || object.invoice != null || !paymentIntentId)
      return { kind: "ignore" };
    return { kind: "assessment-refunded", paymentIntentId, eventAt };
  }
  if (event.type === "charge.dispute.created" || event.type === "charge.dispute.closed") {
    const paymentIntentId = idOf(object.payment_intent);
    if (!paymentIntentId) return { kind: "ignore" };
    // A closed dispute keeps the mark only when it was lost: Stripe closes an
    // inquiry as "warning_closed" and a refunded charge's dispute as
    // "charge_refunded", and neither is a chargeback.
    const status =
      event.type === "charge.dispute.created" ? "open" : object.status === "lost" ? "lost" : "won";
    return { kind: "assessment-dispute", paymentIntentId, status, eventAt };
  }
  if (
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted" ||
    event.type === "customer.subscription.created"
  ) {
    const subscriptionId = str(object.id);
    const status = str(object.status);
    if (!subscriptionId || !status) return { kind: "ignore" };
    const periodEnd =
      typeof object.current_period_end === "number"
        ? new Date(object.current_period_end * 1000).toISOString()
        : null;
    const metadata = (object.metadata ?? {}) as Record<string, unknown>;
    const cancellation = object.cancellation_details as Record<string, unknown> | undefined;
    return {
      kind: "subscription",
      userId: str(metadata.userId),
      customerId: customerIdOf(object),
      subscriptionId,
      status: event.type === "customer.subscription.deleted" ? "canceled" : status,
      currentPeriodEnd: periodEnd,
      eventAt,
      cancellationReason: str(cancellation?.reason),
    };
  }
  return { kind: "ignore" };
}

/** Form-encodes nested params the way Stripe's API expects (`a[b]=c`). */
export function encodeStripeParams(params: Record<string, unknown>, prefix = ""): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        parts.push(
          typeof item === "object" && item !== null
            ? encodeStripeParams(item as Record<string, unknown>, `${name}[${index}]`)
            : `${encodeURIComponent(`${name}[${index}]`)}=${encodeURIComponent(String(item))}`,
        );
      });
    } else if (typeof value === "object") {
      parts.push(encodeStripeParams(value as Record<string, unknown>, name));
    } else {
      parts.push(`${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts.filter(Boolean).join("&");
}
