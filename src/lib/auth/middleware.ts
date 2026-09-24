import { createMiddleware } from "@tanstack/react-start";

/** Verified session ownership plus a fail-closed client identity expectation. */
export const authMiddleware = createMiddleware({ type: "function" })
  .client(async ({ next }) => {
    const { browserWorkspace } = await import("@/lib/precog/sync/workspace");
    const token = browserWorkspace.snapshot();
    const { getBearerToken } = await import("./client");
    if (token) browserWorkspace.assertCurrent(token);
    const result = await next({
      sendContext: {
        bearerToken: getBearerToken() ?? undefined,
        expectedUserId: token?.owner ?? undefined,
      },
    });
    if (token) browserWorkspace.assertCurrent(token);
    return result;
  })
  .server(async ({ next, context }) => {
    const { assertSameSiteRequest } = await import("./isolation.server");
    const { requireUserId } = await import("./verify.server");
    const { getRequest } = await import("@tanstack/react-start/server");
    const { RequestError } = await import("@/lib/request-errors");
    assertSameSiteRequest();
    const userId = await requireUserId(context.bearerToken);
    const expected = context.expectedUserId;
    // The expectation can only reject a mismatch; it cannot grant access.
    // Old browser builds must refresh before mutating account-owned records.
    if (
      (typeof expected === "string" && expected !== userId) ||
      (getRequest()?.method === "POST" && typeof expected !== "string")
    ) {
      throw new RequestError(409, "Your account changed. Refresh before saving; local work is retained.");
    }
    return next({ context: { userId } });
  });
