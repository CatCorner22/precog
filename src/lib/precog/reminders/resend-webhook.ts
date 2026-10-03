/**
 * The pure parts of Resend's bounce and complaint webhook: the Svix
 * signature check and the reading of an event into the addresses to stop
 * emailing. Testable without a network or a database; the route and the
 * suppression store do the rest.
 */
import { constantTimeEqual, fromBase64, hmacSha256Bytes, toBase64 } from "@/lib/web-crypto";

const SIGNATURE_TOLERANCE_SECONDS = 300;
const SECRET_PREFIX = "whsec_";

/** The three headers Resend (through Svix) sends with every delivery. */
export interface SvixHeaders {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}

/**
 * Base64 HMAC-SHA256 of `${id}.${timestamp}.${payload}`, keyed with the
 * decoded secret (the part after `whsec_`). What a `v1,` entry in the
 * signature header holds; null when the secret is not a base64 key.
 */
export async function signSvixPayload(
  secret: string,
  id: string,
  timestamp: number | string,
  payload: string,
): Promise<string | null> {
  const key = fromBase64(
    secret.startsWith(SECRET_PREFIX) ? secret.slice(SECRET_PREFIX.length) : secret,
  );
  if (!key || key.length === 0) return null;
  return toBase64(await hmacSha256Bytes(key, `${id}.${timestamp}.${payload}`));
}

/**
 * True when one of the header's `v1,…` entries was produced with `secret`
 * over this exact payload, id and timestamp, within the tolerance window.
 * The scheme Svix documents for manual verification.
 */
export async function verifySvixSignature(
  payload: string,
  headers: SvixHeaders,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!headers.id || !headers.timestamp || !headers.signature) return false;
  if (!/^\d+$/.test(headers.timestamp)) return false;
  if (Math.abs(nowSeconds - Number(headers.timestamp)) > SIGNATURE_TOLERANCE_SECONDS) return false;
  const expected = await signSvixPayload(secret, headers.id, headers.timestamp, payload);
  if (!expected) return false;
  const candidates = headers.signature
    .split(" ")
    .map((entry) => entry.trim())
    .filter((entry) => entry.startsWith("v1,"))
    .map((entry) => entry.slice(3));
  // Every candidate is compared, so the time taken does not say which one matched.
  let matched = false;
  for (const candidate of candidates) if (constantTimeEqual(candidate, expected)) matched = true;
  return matched;
}

/** One Resend event, reduced to what the suppression table needs. */
export interface ResendEvent {
  type: string;
  /** Resend's id of the email the event is about, when it gave one. */
  emailId: string | null;
  /** The addresses the email went to. */
  to: string[];
  /** For a bounce: Resend's classification (Permanent, Transient, Undetermined). */
  bounceType: string | null;
}

/** The event out of a delivery's JSON body, or null when it is not one. */
export function parseResendEvent(payload: string): ResendEvent | null {
  try {
    const value = JSON.parse(payload) as { type?: unknown; data?: unknown };
    if (!value || typeof value !== "object" || typeof value.type !== "string") return null;
    const data =
      value.data && typeof value.data === "object" ? (value.data as Record<string, unknown>) : {};
    const to = Array.isArray(data.to)
      ? data.to.filter((item): item is string => typeof item === "string" && item.includes("@"))
      : [];
    const bounce =
      data.bounce && typeof data.bounce === "object"
        ? (data.bounce as Record<string, unknown>)
        : null;
    return {
      type: value.type,
      emailId: typeof data.email_id === "string" && data.email_id ? data.email_id : null,
      to,
      bounceType: typeof bounce?.type === "string" ? bounce.type : null,
    };
  } catch {
    return null;
  }
}

export type SuppressionReason = "bounced" | "complained";

/**
 * The addresses an event stops, with the reason. A complaint stops every
 * recipient. A bounce stops every recipient unless Resend called it
 * Transient (a full mailbox, a greylist): that address may work next week.
 * Any other event stops nobody.
 */
export function suppressionsFrom(
  event: ResendEvent,
): { email: string; reason: SuppressionReason }[] {
  if (event.type === "email.complained")
    return event.to.map((email) => ({ email, reason: "complained" as const }));
  if (event.type === "email.bounced" && event.bounceType !== "Transient")
    return event.to.map((email) => ({ email, reason: "bounced" as const }));
  return [];
}
