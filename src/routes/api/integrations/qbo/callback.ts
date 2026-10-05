import { createFileRoute, redirect } from "@tanstack/react-router";

const NO_STORE = { "cache-control": "no-store" } as const;
const REALM_ID = /^\d{1,32}$/;

/**
 * Intuit sends the browser back here with `code`, `state` and `realmId`. The
 * signed state names the account and business that started the connection,
 * and the browser finishing the flow must be signed in as that same account:
 * otherwise anyone could hand their own connect link to a QuickBooks user
 * and receive that user's books. The tokens are exchanged, encrypted and
 * stored, and the browser lands on the firm workspace.
 */
export const Route = createFileRoute("/api/integrations/qbo/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const back = (outcome: string) =>
          redirect({ href: `/firm?quickbooks=${outcome}`, throw: false });
        const [
          { qboCallbackUrl, verifyState },
          client,
          store,
          { getSql },
          { resolveBusinessOwner },
          { requireUserId },
          { recordAuditForBusiness },
        ] = await Promise.all([
          import("@/lib/precog/integrations/qbo/oauth"),
          import("@/lib/precog/integrations/qbo/client.server"),
          import("@/lib/precog/integrations/qbo/store"),
          import("@/lib/db"),
          import("@/lib/precog/business-store"),
          import("@/lib/auth/verify.server"),
          import("@/lib/precog/firm/audit.server"),
        ]);
        if (!client.qboConfigured()) return back("not-configured");
        if (url.searchParams.get("error")) return back("declined");

        const state = await verifyState(url.searchParams.get("state"), client.stateSecret());
        const code = url.searchParams.get("code");
        const realmId = url.searchParams.get("realmId");
        // Intuit company ids are numeric; anything else would fail every later reading.
        if (!state || !code || !realmId || !REALM_ID.test(realmId)) return back("invalid");

        const signedInAs = await requireUserId().catch(() => null);
        if (!signedInAs) return back("signed-out");
        if (signedInAs !== state.userId) return back("wrong-account");

        const sql = await getSql();
        const owner = await resolveBusinessOwner(sql, state.userId, state.businessId);
        if (!owner) return back("invalid");

        try {
          // The handler has the request itself; the same origin rule as the authorize step.
          const { originFrom } = await import("@/lib/request-origin.server");
          const origin = originFrom(request.url, request.headers);
          const tokens = await client.exchangeCode(code, qboCallbackUrl(origin));
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
          await reportServerError(err, "qbo-callback");
          return back("failed");
        }
        // The firm's log, when the business has a firm; best effort, after the save.
        await recordAuditForBusiness(sql, owner, state.businessId, {
          actorUserId: state.userId,
          event: "quickbooks_connected",
        });
        return back("connected");
      },
      ANY: () => new Response(null, { status: 405, headers: { ...NO_STORE, allow: "GET" } }),
    },
  },
});
