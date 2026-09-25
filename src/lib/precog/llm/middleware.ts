import { createMiddleware } from "@tanstack/react-start";
import type { LlmAccessOptions } from "./guard.server";

/**
 * Resolves who is calling and what the model budget allows, before the
 * function's input is parsed. The bearer token exists for the live preview,
 * where the app runs in an iframe with partitioned cookies.
 */
function llmMiddlewareFor(options: LlmAccessOptions) {
  return createMiddleware({ type: "function" })
    .client(async ({ next }) => {
      const { getBearerToken } = await import("@/lib/auth/client");
      return next({ sendContext: { bearerToken: getBearerToken() ?? undefined } });
    })
    .server(async ({ next, context }) => {
      const { resolveLlmAccess } = await import("./guard.server");
      const llm = await resolveLlmAccess(context.bearerToken, options);
      return next({ context: { llm } });
    });
}

export const llmMiddleware = llmMiddlewareFor({});

/**
 * For a function that does costly work on the server even without a model
 * call: signed-out callers get the tighter allowance in guard.server.ts.
 */
export const heavyLlmMiddleware = llmMiddlewareFor({ heavy: true });
