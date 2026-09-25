import type { Sql } from "@/lib/db";
import { RequestError } from "@/lib/request-errors";
import { resolveBusinessOwner } from "../business-store";
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
