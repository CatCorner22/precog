/**
 * The OAuth 2.0 dance with Intuit, minus the network: the authorize URL and a
 * signed `state` that carries the account and business back to the callback,
 * so the callback needs no session of its own. HMAC via WebCrypto, so the
 * same code runs in a test without Node-only modules.
 */
const QBO_SCOPE = "com.intuit.quickbooks.accounting";
const QBO_AUTHORIZE_URL = "https://appcenter.intuit.com/connect/oauth2";
const STATE_TTL_MS = 10 * 60 * 1000;

export interface ConnectState {
  userId: string;
  businessId: string;
  issuedAt: number;
}

const encoder = new TextEncoder();

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(text: string): Uint8Array | null {
  try {
    const padded = text
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(text.length / 4) * 4, "=");
    const binary = atob(padded);
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return base64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(message))));
}

export async function signState(state: ConnectState, secret: string): Promise<string> {
  const body = base64url(encoder.encode(JSON.stringify(state)));
  return `${body}.${await hmac(secret, body)}`;
}

export async function verifyState(
  token: string | null,
  secret: string,
  now = Date.now(),
): Promise<ConnectState | null> {
  if (!token) return null;
  const [body, signature] = token.split(".", 2);
  if (!body || !signature) return null;
  const expected = await hmac(secret, body);
  if (expected.length !== signature.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1)
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  if (diff !== 0) return null;
  const raw = fromBase64url(body);
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
