import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { RequestError } from "@/lib/request-errors";
import { requireBusinessOwner, requireIntegrationManager } from "../../firm/access.server";
import { requireEntitlement } from "../../firm/entitlements.server";
import { assertEngagementOpen } from "../../firm/engagement-store";
import { businessInput } from "../../firm/server-inputs";
import { authorizeUrl, qboCallbackUrl, signState } from "./oauth";
import { qboClientId, qboConfigured, stateSecret } from "./client.server";
import { diffSnapshots, type IntegrationDrift } from "./model";
import {
  listSnapshots,
  loadConnection,
  mapPeopleFor,
  statusOf,
  type ConnectionStatus,
} from "./store";
import { recordReadingFailure, removeConnection, syncConnection } from "./sync.server";
import { recordAuditForBusiness } from "../../firm/audit.server";

interface QuickBooksStatus {
  configured: boolean;
  connection: ConnectionStatus | null;
  drift: IntegrationDrift | null;
}

/** Refuses QuickBooks with a 402 when the firm's plan does not open it (entitlements.ts). */
async function assertQuickBooksOpen(sql: Awaited<ReturnType<typeof getSql>>, userId: string) {
  await requireEntitlement(sql, userId, "quickbooks");
}

/** The connection's state and the newest drift, for the firm workspace. */
export const getQuickBooksStatus = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(businessInput)
  .handler(async ({ context, data }): Promise<QuickBooksStatus> => {
    const configured = qboConfigured();
    const sql = await getSql();
    // Closed with the plan like connecting and syncing: after the plan
    // closes, members stop polling drift off the stored snapshots. Both
    // readers degrade to no reading when this refuses.
    await assertQuickBooksOpen(sql, context.userId);
    const owner = await requireBusinessOwner(sql, context.userId, data.businessId);
    const connection = await loadConnection(sql, owner, data.businessId);
    if (!connection) return { configured, connection: null, drift: null };
    const [current, previous] = await listSnapshots(sql, owner, data.businessId, 2);
    const drift = current
      ? diffSnapshots(previous ?? null, current, await mapPeopleFor(sql, owner, data.businessId))
      : null;
    return { configured, connection: statusOf(connection), drift };
  });

/** Where the browser goes to authorize; the callback finishes the connection. */
export const startQuickBooksConnect = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(businessInput)
  .handler(async ({ context, data }) => {
    // audit: exempt (starts the connect flow; the callback logs the connection)
    if (!qboConfigured())
      throw new RequestError(409, "QuickBooks is not connected on this deployment");
    const sql = await getSql();
    await assertQuickBooksOpen(sql, context.userId);
    const owner = await requireIntegrationManager(sql, context.userId, data.businessId);
    await assertEngagementOpen(sql, owner, data.businessId, context.userId);
    const state = await signState(
      { userId: context.userId, businessId: data.businessId, issuedAt: Date.now() },
      stateSecret(),
    );
    const { requestOrigin } = await import("@/lib/request-origin.server");
    return {
      url: authorizeUrl({
        clientId: qboClientId(),
        redirectUri: qboCallbackUrl(requestOrigin()),
        state,
      }),
    };
  });

export const syncQuickBooksNow = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(businessInput)
  .handler(async ({ context, data }) => {
    // audit: exempt (a reading, not a change to the file)
    const sql = await getSql();
    await assertQuickBooksOpen(sql, context.userId);
    const owner = await requireBusinessOwner(sql, context.userId, data.businessId);
    await assertEngagementOpen(sql, owner, data.businessId, context.userId);
    const connection = await loadConnection(sql, owner, data.businessId);
    if (!connection) throw new RequestError(404, "This client is not connected to QuickBooks");
    try {
      return { drift: await syncConnection(sql, connection) };
    } catch (err) {
      // Already reported with the raw error; the advisor gets the plain sentence.
      throw new RequestError(409, await recordReadingFailure(sql, connection, err));
    }
  });

/** Revokes the connection at Intuit when it can, and removes it here either way. */
export const disconnectQuickBooks = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(businessInput)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const owner = await requireIntegrationManager(sql, context.userId, data.businessId);
    const connection = await loadConnection(sql, owner, data.businessId);
    if (connection) {
      await removeConnection(sql, connection);
      await recordAuditForBusiness(sql, owner, data.businessId, {
        actorUserId: context.userId,
        event: "quickbooks_disconnected",
      });
    }
    return { ok: true as const };
  });
