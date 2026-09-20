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
