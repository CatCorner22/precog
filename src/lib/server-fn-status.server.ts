import { getRequest, setResponseHeader, setResponseStatus } from "@tanstack/react-start/server";
import { clientErrorStatus } from "@/lib/request-errors";

/**
 * Server-only (`.server.ts`): imports `@tanstack/react-start/server`.
 *
 * TanStack Start answers a server function that throws with HTTP 500 and the
 * serialized error, unless a status was set on the response
 * (start-server-core's server-functions-handler), and prints "Server Fn
 * Error!" with the error to the console either way. For an error that names
 * a 4xx status (bad input 400, signed out 401, cross-site 403, conflict 409,
 * too large 413, rate limited 429) this sets that status instead, so logs,
 * monitors and the platform see a client error rather than a failure of
 * ours. A 429 that knows its window also gets `Retry-After` in seconds. The
 * body is unchanged: the client still receives the same Error. Only a
 * server-function HTTP request is touched, never a page render that happens
 * to call a server function in process. Returns true when the error was a
 * client error (whether or not the status could be set), so the caller knows
 * not to report it as a failure of the server.
 */
export function applyClientErrorStatus(error: unknown): boolean {
  const status = clientErrorStatus(error);
  if (status === null) return false;
  let request: Request;
  try {
    request = getRequest();
  } catch {
    // Called outside a request (a direct call in a script or test).
    return true;
  }
  const base = process.env.TSS_SERVER_FN_BASE || "/_serverFn/";
  if (!new URL(request.url).pathname.startsWith(base)) return true;
  setResponseStatus(status);
  const retryAfterSeconds = status === 429 ? retryAfterSecondsOf(error) : null;
  if (retryAfterSeconds !== null) setResponseHeader("retry-after", String(retryAfterSeconds));
  return true;
}

function retryAfterSecondsOf(error: unknown): number | null {
  const ms = (error as { retryAfterMs?: unknown }).retryAfterMs;
  return typeof ms === "number" && Number.isFinite(ms) && ms > 0 ? Math.ceil(ms / 1000) : null;
}
