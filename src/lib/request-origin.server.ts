import { getRequest } from "@tanstack/react-start/server";

/**
 * The public origin of the current request, behind Vercel's proxy headers.
 * Server-only (`.server.ts`): import it dynamically inside a handler, never
 * at the top of a module a client component also imports.
 */
export function requestOrigin(): string {
  const configured = process.env.PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  const request = getRequest();
  const url = new URL(request.url);
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  return `${proto}://${host}`;
}

const QBO_CALLBACK_PATH = "/api/integrations/qbo/callback";

export function qboCallbackUrl(): string {
  return `${requestOrigin()}${QBO_CALLBACK_PATH}`;
}
