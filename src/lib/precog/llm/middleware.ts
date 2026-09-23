import { createMiddleware } from "@tanstack/react-start";

export const llmMiddleware = createMiddleware({ type: "function" })
  .client(async ({ next }) => {
    const { getBearerToken } = await import("@/lib/auth/client");
    return next({ sendContext: { bearerToken: getBearerToken() ?? undefined } });
  })
  .server(async ({ next, context }) => {
    const { resolveLlmAccess } = await import("./guard.server");
    const llm = await resolveLlmAccess(context.bearerToken);
    return next({ context: { llm } });
  });

/**
 * As llmMiddleware, for a function that does costly work on the server even
 * without a model call: signed-out callers get the tighter allowance in
 * guard.server.ts. Runs before the function's input is parsed.
 */
export const heavyLlmMiddleware = createMiddleware({ type: "function" })
  .client(async ({ next }) => {
    const { getBearerToken } = await import("@/lib/auth/client");
    return next({ sendContext: { bearerToken: getBearerToken() ?? undefined } });
  })
  .server(async ({ next, context }) => {
    const { resolveLlmAccess } = await import("./guard.server");
    const llm = await resolveLlmAccess(context.bearerToken, { heavy: true });
    return next({ context: { llm } });
  });
