import { createMiddleware } from "@tanstack/react-start";
import { identitySnapshot, identityUnchanged } from "@/lib/auth/identity-change";
import type { LlmAccessOptions } from "./guard.server";

export const llmMiddleware = llmMiddlewareFor({});

/**
 * For a function that does costly work on the server even without a model
 * call: every caller gets the per-minute allowance in guard.server.ts, and
 * signed-out callers a tighter one.
 */
export const heavyLlmMiddleware = llmMiddlewareFor({ heavy: true });

const ACCOUNT_CHANGED = "The account changed. Reload before continuing.";

/**
 * Resolves who is calling and what the model budget allows, before the
 * function's input is parsed. The bearer token exists for the live preview,
 * where the app runs in an iframe with partitioned cookies. A signed-in tab
 * also sends the account it shows, and the server refuses the call when the
 * session now belongs to another account, as `authMiddleware` does.
 */
function llmMiddlewareFor(options: LlmAccessOptions) {
  return createMiddleware({ type: "function" })
    .client(async ({ next }) => {
      const identity = identitySnapshot();
      if (identity.locked) throw new Error(ACCOUNT_CHANGED);
      const { getBearerToken } = await import("@/lib/auth/client");
      const result = await next({
        sendContext: {
          bearerToken: getBearerToken() ?? undefined,
          expectedAccountId: identity.accountId ?? undefined,
        },
      });
      if (!identityUnchanged(identity))
        throw new Error("The account changed. Precog discarded the old response.");
      return result;
    })
    .server(async ({ next, context }) => {
      const { resolveLlmAccess } = await import("./guard.server");
      const llm = await resolveLlmAccess(context.bearerToken, options, context.expectedAccountId);
      return next({ context: { llm } });
    });
}
