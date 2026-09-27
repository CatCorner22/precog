import { getRequest } from "@tanstack/react-start/server";

/**
 * The public origin of the app, for links that leave it: Stripe return pages,
 * the QuickBooks redirect_uri, digest emails. Server-only (`.server.ts`):
 * import it dynamically inside a handler, never at the top of a module a
 * client component also imports. Must be called inside a request.
 */
export function requestOrigin(): string {
  const request = getRequest();
  return originFrom(request.url, request.headers);
}

/**
 * One rule for the app's public origin, in order:
 *
 *   1. PUBLIC_APP_URL, else BETTER_AUTH_URL (the deployment's public URL that
 *      sign-in already uses), without a trailing slash;
 *   2. the proxy's x-forwarded-host / x-forwarded-proto, but only where the
 *      proxy is known to overwrite them: on Vercel (VERCEL=1) or when the
 *      operator sets TRUST_FORWARDED_HOST=1 for their own proxy. Anywhere
 *      else a client could name any host and have Stripe or Intuit send the
 *      customer there (the same policy as client-ip.ts);
 *   3. the origin of the request URL itself.
 */
export function originFrom(
  requestUrl: string,
  headers: Headers,
  env: Record<string, string | undefined> = process.env,
): string {
  const configured = env.PUBLIC_APP_URL?.trim() || env.BETTER_AUTH_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  const url = new URL(requestUrl);
  if (env.VERCEL === "1" || env.TRUST_FORWARDED_HOST?.trim() === "1") {
    const host = firstValue(headers.get("x-forwarded-host"));
    if (host) {
      const proto = firstValue(headers.get("x-forwarded-proto")) ?? url.protocol.slice(0, -1);
      return `${proto}://${host}`;
    }
  }
  return url.origin;
}

function firstValue(header: string | null): string | undefined {
  return header?.split(",")[0]?.trim() || undefined;
}
