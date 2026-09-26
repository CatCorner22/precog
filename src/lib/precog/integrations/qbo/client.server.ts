import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";
import { env } from "@/lib/env.server";

/**
 * Intuit's token and query endpoints, and the at-rest encryption for the
 * tokens. Configured when QBO_CLIENT_ID, QBO_CLIENT_SECRET and
 * INTEGRATION_KEY are set (INTEGRATION_KEY_PREVIOUS during a key rotation).
 * QBO_ENVIRONMENT=sandbox points at Intuit's sandbox company data.
 */
export function qboConfigured(): boolean {
  return Boolean(env("QBO_CLIENT_ID") && env("QBO_CLIENT_SECRET") && env("INTEGRATION_KEY"));
}

export function qboClientId(): string {
  const id = env("QBO_CLIENT_ID");
  if (!id) throw new Error("QuickBooks is not configured");
  return id;
}

/** The secret that signs connect states; derived from INTEGRATION_KEY. */
export function stateSecret(): string {
  const master = env("INTEGRATION_KEY");
  if (!master) throw new Error("INTEGRATION_KEY is not set");
  return deriveKey(master, "qbo-state").toString("hex");
}

/**
 * AES-256-GCM under INTEGRATION_KEY. The output is `kid.iv.tag.ciphertext`
 * in base64url, where `kid` names the key that sealed it, so the key can be
 * rotated: set the old value as INTEGRATION_KEY_PREVIOUS and the new one as
 * INTEGRATION_KEY, and tokens sealed under either still open. Each refresh
 * seals the new tokens under the current key.
 */
export function encryptSecret(plain: string): string {
  const [key] = tokenKeys();
  if (!key) throw new Error("INTEGRATION_KEY is not set");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key.key, iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [key.id, ...[iv, cipher.getAuthTag(), body].map((b) => b.toString("base64url"))].join(".");
}

/** Opens a sealed token; also reads the older `iv.tag.ciphertext` form, which has no key id. */
export function decryptSecret(sealed: string): string {
  const parts = sealed.split(".");
  const kid = parts.length === 4 ? parts[0] : null;
  const rest = parts.length === 4 ? parts.slice(1) : parts;
  if (rest.length !== 3) throw new Error("Unreadable sealed token");
  const [iv, tag, body] = rest.map((part) => Buffer.from(part, "base64url"));
  const keys = tokenKeys().filter((k) => kid === null || k.id === kid);
  if (keys.length === 0) throw new Error("The key that sealed this token is not configured");
  let failure: unknown;
  for (const { key } of keys) {
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
    } catch (err) {
      failure = err;
    }
  }
  throw failure;
}

/** The current token key first, then the previous one while a rotation is under way. */
function tokenKeys(): { id: string; key: Buffer }[] {
  return [env("INTEGRATION_KEY"), env("INTEGRATION_KEY_PREVIOUS")]
    .filter((master): master is string => Boolean(master))
    .map((master) => {
      const key = deriveKey(master, "qbo-tokens");
      return { id: createHash("sha256").update(key).digest("hex").slice(0, 8), key };
    });
}

function deriveKey(master: string, purpose: string): Buffer {
  return Buffer.from(hkdfSync("sha256", master, "precog-integrations", purpose, 32));
}

const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const REVOKE_URL = "https://developer.api.intuit.com/v2/oauth2/tokens/revoke";

function apiBase(): string {
  return env("QBO_ENVIRONMENT") === "sandbox"
    ? "https://sandbox-quickbooks.api.intuit.com"
    : "https://quickbooks.api.intuit.com";
}

function basicAuth(): string {
  return `Basic ${Buffer.from(`${env("QBO_CLIENT_ID")}:${env("QBO_CLIENT_SECRET")}`).toString("base64")}`;
}

export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  /** ISO instants. */
  accessExpiresAt: string;
  refreshExpiresAt: string;
}

async function tokenRequest(params: Record<string, string>): Promise<TokenSet> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      authorization: basicAuth(),
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params).toString(),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    x_refresh_token_expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !body.access_token || !body.refresh_token) {
    throw new Error(body.error_description ?? body.error ?? `Intuit answered ${res.status}`);
  }
  const now = Date.now();
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    accessExpiresAt: new Date(now + (body.expires_in ?? 3600) * 1000).toISOString(),
    refreshExpiresAt: new Date(
      now + (body.x_refresh_token_expires_in ?? 100 * 24 * 3600) * 1000,
    ).toISOString(),
  };
}

export function exchangeCode(code: string, redirectUri: string): Promise<TokenSet> {
  return tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
}

export function refreshTokens(refreshToken: string): Promise<TokenSet> {
  return tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
}

export async function revokeToken(refreshToken: string): Promise<void> {
  await fetch(REVOKE_URL, {
    method: "POST",
    headers: { authorization: basicAuth(), "content-type": "application/json" },
    body: JSON.stringify({ token: refreshToken }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => undefined);
}

/** Runs one QBO query (`select * from Vendor`) and returns the parsed body. */
export async function query(
  realmId: string,
  accessToken: string,
  statement: string,
): Promise<unknown> {
  const url = new URL(`${apiBase()}/v3/company/${encodeURIComponent(realmId)}/query`);
  url.searchParams.set("query", statement);
  url.searchParams.set("minorversion", "75");
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok)
    throw new Error(
      `QuickBooks answered ${res.status} to ${statement.split(" from ")[1] ?? "query"}`,
    );
  return res.json();
}
