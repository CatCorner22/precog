import type { Sql } from "@/lib/db";
import { RequestError } from "@/lib/request-errors";
import { resolveBusinessOwner } from "../business-store";
import { reportVersionFor } from "./reports";
import { loadFirmFor, type FirmContext, type FirmRole } from "./store";

/**
 * Who may touch what, for every server function that names a business: the
 * caller's own rows and the rows of the firm they belong to. Anything else is
 * a 404, so an outsider cannot tell a foreign business from a missing one.
 */
export async function requireBusinessOwner(
  sql: Sql,
  userId: string,
  businessId: string,
): Promise<string> {
  const owner = await resolveBusinessOwner(sql, userId, businessId);
  if (!owner) throw new RequestError(404, "That client is not on this account");
  return owner;
}

/**
 * The business a locked report version belongs to, checked against the
 * version's own owner: a caller whose own business merely shares the id gets
 * the same 404 as an outsider.
 */
export async function requireReportVersion(
  sql: Sql,
  userId: string,
  id: string,
): Promise<{ ownerUserId: string; businessId: string }> {
  const where = await reportVersionFor(sql, userId, id);
  if (!where) throw new RequestError(404, "That report version does not exist");
  return where;
}

export async function requireFirm(sql: Sql, userId: string): Promise<FirmContext> {
  const firm = await loadFirmFor(sql, userId);
  if (!firm) throw new RequestError(404, "Set up the firm first");
  return firm;
}

export async function requireFirmRole(
  sql: Sql,
  userId: string,
  roles: readonly FirmRole[],
): Promise<FirmContext> {
  const firm = await requireFirm(sql, userId);
  if (!roles.includes(firm.role)) {
    throw new RequestError(403, `Only a firm ${roles.join(" or ")} can do that`);
  }
  return firm;
}

/**
 * Who may connect, sync apart, or disconnect a financial integration: the
 * account holding the business always, otherwise a firm owner or reviewer.
 * A preparer keeps read and sync access through the status and sync calls,
 * but connecting or revoking the client's books is never a preparer's action.
 */
export async function requireIntegrationManager(
  sql: Sql,
  userId: string,
  businessId: string,
): Promise<string> {
  const owner = await requireBusinessOwner(sql, userId, businessId);
  if (owner !== userId) await requireFirmRole(sql, userId, ["owner", "reviewer"]);
  return owner;
}
