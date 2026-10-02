import { clientErrorStatus } from "@/lib/request-errors";

/**
 * Wraps a raw API route handler (one that src/start.ts's server-function
 * middleware never sees) so an unexpected throw goes to the error tracker
 * before the caller hears about it. The caller gets a bare 500 that names
 * nothing inside Precog. An error that names a 4xx status is a refusal, not a
 * failure of ours: it is answered with that status and not reported, the same
 * rule src/start.ts follows. The handler's own responses pass through as they
 * are. The reporter is imported on a throw only, so a route file that uses
 * this stays free of server-only imports.
 */
export function withReporting(
  handler: (ctx: RouteContext) => Response | Promise<Response>,
  where: string,
): (ctx: RouteContext) => Promise<Response> {
  return async (ctx) => {
    try {
      return await handler(ctx);
    } catch (error) {
      const status = clientErrorStatus(error);
      if (status !== null) return failure(status, "Request refused");
      const { reportServerError } = await import("./report.server");
      await reportServerError(error, where);
      return failure(500, "Precog could not finish this request. Try again in a few minutes.");
    }
  };
}

/** The part of a route handler's context these routes read. */
interface RouteContext {
  request: Request;
}

function failure(status: number, text: string): Response {
  return new Response(text, {
    status,
    headers: { "cache-control": "no-store", "content-type": "text/plain; charset=utf-8" },
  });
}
