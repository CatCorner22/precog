import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { RequestError, requireObject } from "@/lib/request-errors";
import { isBusinessId } from "../../profile-input";
import { requireBusinessOwner } from "../../firm/access.server";
import { authorizeUrl, signState } from "./oauth";
import {
  decryptSecret,
  qboClientId,
  qboConfigured,
  revokeToken,
  stateSecret,
} from "./client.server";
import { diffSnapshots, type IntegrationDrift } from "./model";
import { deleteConnection, listSnapshots, loadConnection, statusOf } from "./store";
import { syncConnection } from "./sync.server";
import type { PracticeProfile } from "../../practice-profile";
import { normalizeProfile } from "../../practice-profile";
import { resolveTemplate } from "../../active-template";

function businessInput(input: { businessId: string }) {
  const raw = requireObject(input);
  if (!isBusinessId(raw.businessId)) throw new RequestError(400, "Unknown business id");
  return { businessId: raw.businessId };
}

/** The connection's state and the newest drift, for the firm workspace. */
export const getQuickBooksStatus = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(businessInput)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const owner = await requireBusinessOwner(sql, context.userId, data.businessId);
    const connection = await loadConnection(sql, owner, data.businessId);
    if (!connection) {
      return {
        configured: qboConfigured(),
        connection: null,
        drift: null as IntegrationDrift | null,
      };
    }
    const [current, previous] = await listSnapshots(sql, owner, data.businessId, 2);
    let drift: IntegrationDrift | null = null;
    if (current) {
      const rows = await sql<{ profile: PracticeProfile }>`
        select profile from businesses where user_id = ${owner} and id = ${data.businessId}
      `;
      const people = rows[0] ? resolveTemplate(normalizeProfile(rows[0].profile)).people : [];
      drift = diffSnapshots(previous ?? null, current, people);
    }
    return { configured: qboConfigured(), connection: statusOf(connection), drift };
  });

/** Where the browser goes to authorize; the callback finishes the connection. */
export const startQuickBooksConnect = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(businessInput)
  .handler(async ({ context, data }) => {
    if (!qboConfigured())
      throw new RequestError(409, "QuickBooks is not connected on this deployment");
    const sql = await getSql();
    await requireBusinessOwner(sql, context.userId, data.businessId);
    const state = await signState(
      { userId: context.userId, businessId: data.businessId, issuedAt: Date.now() },
      stateSecret(),
    );
    const { qboCallbackUrl } = await import("@/lib/request-origin.server");
    return { url: authorizeUrl({ clientId: qboClientId(), redirectUri: qboCallbackUrl(), state }) };
  });

export const syncQuickBooksNow = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(businessInput)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const owner = await requireBusinessOwner(sql, context.userId, data.businessId);
    const connection = await loadConnection(sql, owner, data.businessId);
    if (!connection) throw new RequestError(404, "This client is not connected to QuickBooks");
    return { drift: await syncConnection(sql, connection) };
  });

export const disconnectQuickBooks = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(businessInput)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const owner = await requireBusinessOwner(sql, context.userId, data.businessId);
    const connection = await loadConnection(sql, owner, data.businessId);
    if (connection) {
      await revokeToken(decryptSecret(connection.refreshTokenEnc)).catch(() => undefined);
      await deleteConnection(sql, owner, data.businessId);
    }
    return { ok: true as const };
  });
