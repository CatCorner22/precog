import { constantTimeEqual, fromBase64Url, hmacSha256, toBase64Url } from "@/lib/web-crypto";

/**
 * The OAuth 2.0 dance with Intuit, minus the network: the authorize URL and a
 * signed `state` that carries the account and business back to the callback,
 * so the callback needs no session of its own. HMAC via WebCrypto, so the
 * same code runs in a test without Node-only modules.
 */
/** Where Intuit sends the browser back; the route file declares the same path. */
export const QBO_CALLBACK_PATH = "/api/integrations/qbo/callback";

/** The redirect_uri Intuit must see identically at authorize and token exchange. */
export function qboCallbackUrl(origin: string): string {
  return `${origin}${QBO_CALLBACK_PATH}`;
}

export interface ConnectState {
  userId: string;
  businessId: string;
  issuedAt: number;
}

export async function signState(state: ConnectState, secret: string): Promise<string> {
  const body = toBase64Url(encoder.encode(JSON.stringify(state)));
  return `${body}.${await sign(secret, body)}`;
}

/** The state a token carries, or null unless it is exactly `body.signature`, signed and fresh. */
export async function verifyState(
  token: string | null,
  secret: string,
  now = Date.now(),
): Promise<ConnectState | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, signature] = parts;
  if (!body || !signature) return null;
  if (!constantTimeEqual(await sign(secret, body), signature)) return null;
  const raw = fromBase64Url(body);
  if (!raw) return null;
  try {
    const state = JSON.parse(new TextDecoder().decode(raw)) as Partial<ConnectState>;
    if (
      typeof state.userId !== "string" ||
      typeof state.businessId !== "string" ||
      typeof state.issuedAt !== "number" ||
      now - state.issuedAt > STATE_TTL_MS ||
      state.issuedAt > now + 60_000
    ) {
      return null;
    }
    return { userId: state.userId, businessId: state.businessId, issuedAt: state.issuedAt };
  } catch {
    return null;
  }
}

export function authorizeUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL(QBO_AUTHORIZE_URL);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", QBO_SCOPE);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", input.state);
  return url.toString();
}

async function sign(secret: string, body: string): Promise<string> {
  return toBase64Url(await hmacSha256(secret, body));
}

const encoder = new TextEncoder();
const QBO_SCOPE = "com.intuit.quickbooks.accounting";
const QBO_AUTHORIZE_URL = "https://appcenter.intuit.com/connect/oauth2";
const STATE_TTL_MS = 10 * 60 * 1000;
