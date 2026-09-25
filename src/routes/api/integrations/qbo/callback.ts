import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Intuit sends the browser back here with `code`, `state` and `realmId`. The
 * signed state names the account and business that started the connection,
 * so no session is needed; the tokens are exchanged, encrypted and stored,
 * and the browser lands on the firm workspace.
 */
export const Route = createFileRoute("/api/integrations/qbo/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const back = (outcome: string) =>
          redirect({ href: `/firm?quickbooks=${outcome}`, throw: false });
        const [{ verifyState }, client, store, { getSql }, { resolveBusinessOwner }] =
          await Promise.all([
            import("@/lib/precog/integrations/qbo/oauth"),
            import("@/lib/precog/integrations/qbo/client.server"),
            import("@/lib/precog/integrations/qbo/store"),
            import("@/lib/db"),
            import("@/lib/precog/business-store"),
          ]);
        if (!client.qboConfigured()) return back("not-configured");
        if (url.searchParams.get("error")) return back("declined");

        const state = await verifyState(url.searchParams.get("state"), client.stateSecret());
        const code = url.searchParams.get("code");
        const realmId = url.searchParams.get("realmId");
        if (!state || !code || !realmId) return back("invalid");

        const sql = await getSql();
        const owner = await resolveBusinessOwner(sql, state.userId, state.businessId);
        if (!owner) return back("invalid");

        try {
          const { callbackUrl } = await import("@/lib/precog/integrations/qbo/server");
          const tokens = await client.exchangeCode(code, callbackUrl());
          await store.saveConnection(sql, {
            ownerUserId: owner,
            businessId: state.businessId,
            realmId,
            accessTokenEnc: client.encryptSecret(tokens.accessToken),
            refreshTokenEnc: client.encryptSecret(tokens.refreshToken),
            accessExpiresAt: tokens.accessExpiresAt,
            refreshExpiresAt: tokens.refreshExpiresAt,
            connectedBy: state.userId,
          });
        } catch (err) {
          const { reportServerError } = await import("@/lib/observability/report.server");
          reportServerError(err, "qbo-callback");
          return back("failed");
        }
        return back("connected");
      },
    },
  },
});
