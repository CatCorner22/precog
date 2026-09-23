/**
 * Which address a request came from, for rate limits and hashed view logs.
 *
 * A forwarding header is only as trustworthy as whoever last wrote it. On
 * Vercel the edge network sets `x-vercel-forwarded-for`, `x-real-ip` and
 * `x-forwarded-for` itself and overwrites any value the client sent, so they
 * are trusted there (VERCEL=1 is set by the platform at runtime). Anywhere
 * else, including the live preview, a client can send any value it likes and
 * pick a fresh rate-limit bucket per request, so no header is trusted and the
 * socket address is used. A deployment behind its own proxy can name the one
 * header that proxy sets (and strips from incoming requests) in
 * TRUSTED_CLIENT_IP_HEADER.
 */
export const VERCEL_CLIENT_IP_HEADERS = ["x-vercel-forwarded-for", "x-real-ip", "x-forwarded-for"];

export function trustedClientIpHeaders(
  env: Record<string, string | undefined> = process.env,
): string[] {
  const configured = env.TRUSTED_CLIENT_IP_HEADER?.trim().toLowerCase();
  if (configured) return [configured];
  if (env.VERCEL === "1") return VERCEL_CLIENT_IP_HEADERS;
  return [];
}

/** The first address in the first trusted header present, else the socket address. */
export function clientIpFrom(
  headers: Headers,
  trusted: readonly string[],
  socketAddress: string | undefined,
): string {
  for (const name of trusted) {
    const value = headers.get(name)?.split(",")[0]?.trim();
    if (value) return value;
  }
  return socketAddress?.trim() || "unknown";
}
