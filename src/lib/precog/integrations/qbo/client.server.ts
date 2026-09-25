import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * Intuit's token and query endpoints, and the at-rest encryption for the
 * tokens. Configured when QBO_CLIENT_ID, QBO_CLIENT_SECRET and
 * INTEGRATION_KEY are set. QBO_ENVIRONMENT=sandbox points at Intuit's
 * sandbox company data.
 */
const env = (key: string): string | undefined => {
  const value = process.env[key]?.trim();
  return value || undefined;
};

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
  return deriveKey("qbo-state").toString("hex");
}

function deriveKey(purpose: string): Buffer {
  const master = env("INTEGRATION_KEY");
  if (!master) throw new Error("INTEGRATION_KEY is not set");
  return Buffer.from(hkdfSync("sha256", master, "precog-integrations", purpose, 32));
}

/** AES-256-GCM; output is `iv.tag.ciphertext` in base64url. */
export function encryptSecret(plain: string): string {
  const key = deriveKey("qbo-tokens");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((b) => b.toString("base64url")).join(".");
}

export function decryptSecret(sealed: string): string {
  const [iv, tag, body] = sealed.split(".").map((part) => Buffer.from(part, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", deriveKey("qbo-tokens"), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
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
