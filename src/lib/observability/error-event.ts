/**
 * The one shape an error takes on its way to the error tracker, built the same
 * way on the client and the server. Everything that could identify a client
 * of the firm (emails, names typed into a business, session tokens, share
 * passcodes) is scrubbed before the event leaves the process, so the tracker
 * holds where the app broke and never whose data it was holding.
 */
export interface ErrorEvent {
  message: string;
  name: string;
  stack: string | null;
  where: "client" | "server";
  /** Route or server-function name; never a query string. */
  at: string | null;
  occurredAt: string;
  release: string | null;
}

export const MAX_MESSAGE_CHARS = 500;
export const MAX_STACK_CHARS = 4000;
export const MAX_AT_CHARS = 200;

const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;
const BEARER = /bearer\s+[\w.~+/=-]+/gi;
/** Long opaque strings: session tokens, share tokens, API keys, base64 blobs. */
const TOKEN = /\b[A-Za-z0-9_-]{32,}\b/g;
const JWT = /\b[\w-]+\.[\w-]+\.[\w-]+\b/g;
/**
 * Double-quoted text is what a person typed: a business name, a note, a
 * vendor. Straight apostrophes stay, so "can't" in a message survives.
 */
const QUOTED = /"[^"\n]{4,}?"|“[^”\n]{4,}?”/g;
/** `passcode=…` and `?token=…` style pairs in URLs or messages. */
const SECRET_PAIR = /\b(passcode|token|secret|key|password|authorization)=([^&\s]+)/gi;

export function scrubText(text: string, limit: number): string {
  return text
    .replace(BEARER, "Bearer [token]")
    .replace(SECRET_PAIR, "$1=[redacted]")
    .replace(EMAIL, "[email]")
    .replace(JWT, "[token]")
    .replace(TOKEN, "[token]")
    .replace(QUOTED, '"[text]"')
    .slice(0, limit);
}

/** A route path with its query string and any id-like segments removed. */
export function scrubLocation(location: string | null | undefined): string | null {
  if (!location) return null;
  const path = location.split(/[?#]/, 1)[0] ?? "";
  return (
    path
      .split("/")
      .map((segment) => (/^[A-Za-z0-9_-]{16,}$/.test(segment) ? "[id]" : segment))
      .join("/")
      .slice(0, MAX_AT_CHARS) || null
  );
}

export function toErrorEvent(
  error: unknown,
  input: { where: ErrorEvent["where"]; at?: string | null; release?: string | null; now?: Date },
): ErrorEvent {
  const err = error instanceof Error ? error : null;
  const rawMessage = err ? err.message : typeof error === "string" ? error : "Unknown error";
  return {
    message: scrubText(rawMessage || "Unknown error", MAX_MESSAGE_CHARS),
    name: err?.name?.slice(0, 80) || "Error",
    stack: err?.stack ? scrubText(err.stack, MAX_STACK_CHARS) : null,
    where: input.where,
    at: scrubLocation(input.at),
    occurredAt: (input.now ?? new Date()).toISOString(),
    release: input.release ?? null,
  };
}

/** True for a payload the intake route accepts from a browser. */
export function isErrorEventPayload(value: unknown): value is ErrorEvent {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.message === "string" &&
    v.message.length <= MAX_MESSAGE_CHARS &&
    typeof v.name === "string" &&
    v.name.length <= 80 &&
    (v.stack === null || (typeof v.stack === "string" && v.stack.length <= MAX_STACK_CHARS)) &&
    v.where === "client" &&
    (v.at === null || (typeof v.at === "string" && v.at.length <= MAX_AT_CHARS)) &&
    typeof v.occurredAt === "string" &&
    (v.release === null || typeof v.release === "string")
  );
}
