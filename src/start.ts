import { createCsrfMiddleware, createMiddleware, createStart } from "@tanstack/react-start";

/**
 * The framework's default protection, restated: declaring a start instance
 * replaces the default request middleware, so CSRF must be listed here.
 */
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

/**
 * Server-function requests: refuse oversized bodies (413) and bodies the
 * framework cannot parse (400) before any function, auth check included,
 * does work, and answer an unknown function id with 404 rather than 500.
 */
const serverFnRequestGuard = createMiddleware().server(async ({ request, handlerType, next }) => {
  if (handlerType !== "serverFn") return next();
  const { checkServerFnRequest, isUnknownServerFnError, plainResponse } =
    await import("@/lib/server-fn-guard");
  const refused = await checkServerFnRequest(request);
  if (refused) return refused;
  try {
    return await next();
  } catch (error) {
    if (isUnknownServerFnError(error)) return plainResponse(404, "Not found");
    throw error;
  }
});

/** Gives a thrown error that names a 4xx status that HTTP status (see server-fn-status.server.ts). */
const clientErrorStatusMiddleware = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    try {
      return await next();
    } catch (error) {
      const { applyClientErrorStatus } = await import("@/lib/server-fn-status.server");
      applyClientErrorStatus(error);
      throw error;
    }
  },
);

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware, serverFnRequestGuard],
  functionMiddleware: [clientErrorStatusMiddleware],
}));
