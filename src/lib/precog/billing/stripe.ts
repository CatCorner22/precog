/**
 * The parts of Stripe this app needs, spoken directly over HTTPS so no SDK
 * runs at import time. Pure helpers live here (testable without a network);
 * the calls that need the secret key are in `stripe.server.ts`.
 */
export type CheckoutPlan = "assessment" | "monthly";

export interface StripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

/** What a webhook event means for an account, independent of Stripe's shapes. */
export type BillingChange =
  | { kind: "assessment-paid"; userId: string; customerId: string | null }
  | {
      kind: "subscription";
      userId: string | null;
      customerId: string | null;
      subscriptionId: string;
      status: string;
      currentPeriodEnd: string | null;
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
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${payload}`),
  );
  return Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
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
    return { id: value.id, type: value.type, data: { object: value.data.object } };
  } catch {
    return null;
  }
}

function str(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function customerIdOf(object: Record<string, unknown>): string | null {
  const customer = object.customer;
  if (typeof customer === "string") return customer;
  if (customer && typeof customer === "object") return str((customer as { id?: unknown }).id);
  return null;
}

/**
 * Reads the account and plan change out of the events this app subscribes
 * to. The user id rides in `client_reference_id` / metadata on checkout
 * (set when the session is created); subscription events carry only the
 * customer id, which the store maps back to an account.
 */
export function billingChangeFor(event: StripeEvent): BillingChange {
  const object = event.data.object;
  if (event.type === "checkout.session.completed") {
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
        status: "active",
        currentPeriodEnd: null,
      };
    }
    if (object.mode === "payment" && object.payment_status === "paid") {
      return { kind: "assessment-paid", userId, customerId };
    }
    return { kind: "ignore" };
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
    return {
      kind: "subscription",
      userId: str(metadata.userId),
      customerId: customerIdOf(object),
      subscriptionId,
      status: event.type === "customer.subscription.deleted" ? "canceled" : status,
      currentPeriodEnd: periodEnd,
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
