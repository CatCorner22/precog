import { createCsrfMiddleware, createMiddleware, createStart } from "@tanstack/react-start";

const csrfMiddleware = createCsrfMiddleware({ filter: (ctx) => ctx.handlerType === "serverFn" });

const runtimeGuard = createMiddleware().server(async ({ handlerType, request, next }) => {
  const { productionConfigurationErrors } = await import("@/lib/runtime-config");
  const errors = productionConfigurationErrors(process.env);
  if (errors.length) {
    console.error("[runtime] Invalid production configuration:", errors.join("; "));
    return new Response("Service configuration is incomplete. Contact the operator.", {
      status: 503,
      headers: { "cache-control": "no-store" },
    });
  }
  if (
    process.env.PRECOG_READ_ONLY === "true" &&
    handlerType === "serverFn" &&
    request.method === "POST"
  ) {
    return new Response(
      "Maintenance is in progress. Local work is retained; try saving after maintenance.",
      {
        status: 503,
        headers: { "cache-control": "no-store", "retry-after": "60" },
      },
    );
  }
  return next();
});

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
  requestMiddleware: [runtimeGuard, csrfMiddleware, serverFnRequestGuard],
  functionMiddleware: [clientErrorStatusMiddleware],
}));
