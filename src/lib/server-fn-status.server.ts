import { getRequest, setResponseStatus } from "@tanstack/react-start/server";
import { clientErrorStatus } from "@/lib/request-errors";

/**
 * Server-only (`.server.ts`): imports `@tanstack/react-start/server`.
 *
 * TanStack Start answers a server function that throws with HTTP 200 and the
 * serialized error, whatever the error says. For an error that names a 4xx
 * status (bad input 400, signed out 401, cross-site 403, conflict 409, too
 * large 413, rate limited 429) this sets that status instead, so logs,
 * monitors and the platform see a client error rather than a success. The
 * body is unchanged: the client still receives the same Error. Only a
 * server-function HTTP request is touched, never a page render that happens
 * to call a server function in process.
 */
export function applyClientErrorStatus(error: unknown): void {
  const status = clientErrorStatus(error);
  if (status === null) return;
  let request: Request | undefined;
  try {
    request = getRequest();
  } catch {
    return;
  }
  if (!request) return;
  const base = process.env.TSS_SERVER_FN_BASE || "/_serverFn/";
  if (!new URL(request.url).pathname.startsWith(base)) return;
  setResponseStatus(status);
}
