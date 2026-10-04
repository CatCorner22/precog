import type { Sql } from "@/lib/db";
import { inTransaction } from "@/lib/sql-transaction";
import { RequestError } from "@/lib/request-errors";
import { randomHex } from "@/lib/web-crypto";
import { toIsoTimestamp } from "../iso-time";
import { businessLimitMessage } from "../business-lifecycle";
import { countClients, loadEntitlements } from "./entitlements.server";
import { GRANT_CLOSED, GRANT_CONFIRM } from "./grant-texts";
import { accountFit, FirmMembershipError, loadFirmFor, maskEmail } from "./store";

export { GRANT_CLOSED, GRANT_CONFIRM };

/**
 * A business owner's grant of their business to a firm (migration 0046).
 * The owner invites the firm owner by address; the firm owner accepts on
 * `/join/client/{token}`, and the business joins the firm's client list
 * while staying the owner's (`businesses.user_id` never changes). Either
 * side ends it: the business owner ("End the firm's access") or the firm
 * owner ("Hand back to its owner"). The firm then loses the business, its
 * links on it, and the versions it locked; the owner keeps them all.
 */

/** How long a client invitation stays open. */
export const GRANT_TTL_DAYS = 14;
/** Firm invitations one business may send in a day. */
export const MAX_GRANTS_PER_BUSINESS_PER_DAY = 5;

export const ALREADY_WITH_FIRM =
  "This business already works with a firm. End that firm's access first.";
export const GRANT_LIMIT = "Precog sends at most five firm invitations a day for one business.";
export const ONLY_FIRM_OWNER_ACCEPTS =
  "Only a firm's owner can accept a client invitation. Set up your firm on the Firm page first, then open this link again.";
export const OWN_BUSINESS_GRANT =
  "This invitation is for your own business, so there is nothing to accept. Send the link to the firm owner it names.";
export const END_ACCESS_REFUSED =
  "Only the business's owner or the owner of the firm working on it can end the firm's access.";
export const NOT_GRANTED =
  "Its owner did not share this business with the firm, so there is no access to end.";

/** "This invitation was sent to a***@cpa.com. Sign in with that address to accept it." */
export function grantMismatch(maskedEmail: string): string {
  return `This invitation was sent to ${maskedEmail}. Sign in with that address to accept it.`;
}

export type GrantStatus = "open" | "expired" | "used";

export interface CreatedGrant {
  token: string;
  email: string;
  createdAt: string;
  expiresAt: string;
}

/** What `/join/client/{token}` shows before anyone accepts; the address comes back masked. */
export interface GrantPeek {
  businessName: string;
  ownerName: string;
  invitedEmailMasked: string;
  status: GrantStatus;
}

/** The business's grant as its owner sees it: the firm working on it, or the invitation waiting. */
export type GrantState =
  { firmName: string; since: string } | { pendingEmail: string; expiresAt: string } | null;

/**
 * An invitation from the business's own account to a firm owner's address.
 * Refused when the business already works with a firm, and past five
 * invitations a day for one business. A new invitation replaces the open one.
 */
export async function createGrant(
  sql: Sql,
  input: { ownerUserId: string; businessId: string; email: string },
): Promise<CreatedGrant> {
  const email = input.email.trim().toLowerCase();
  return inTransaction(sql, async (tx) => {
    const rows = await tx<{ firm_user_id: string | null }>`
      select firm_user_id from businesses
      where user_id = ${input.ownerUserId} and id = ${input.businessId} and deleted_at is null
      for update
    `;
    if (!rows[0]) throw new RequestError(404, "That client is not on this account");
    if (rows[0].firm_user_id) throw new RequestError(409, ALREADY_WITH_FIRM);
    const recent = await tx<{ n: number | string }>`
      select count(*) as n from business_firm_grants
      where business_owner_id = ${input.ownerUserId} and business_id = ${input.businessId}
        and created_at > now() - interval '1 day'
    `;
    if (Number(recent[0]?.n ?? 0) >= MAX_GRANTS_PER_BUSINESS_PER_DAY) {
      throw new RequestError(429, GRANT_LIMIT);
    }
    await revokeOpenGrants(tx, input.ownerUserId, input.businessId);
    const token = randomHex(24);
    const created = await tx<{ created_at: string; expires_at: string }>`
      insert into business_firm_grants
        (token, business_owner_id, business_id, kind, invited_email, expires_at)
      values (${token}, ${input.ownerUserId}, ${input.businessId}, 'grant', ${email},
        now() + make_interval(days => ${GRANT_TTL_DAYS}::int))
      returning created_at, expires_at
    `;
    return {
      token,
      email,
      createdAt: toIsoTimestamp(created[0].created_at),
      expiresAt: toIsoTimestamp(created[0].expires_at),
    };
  });
}

/** The invitation as anyone holding the link sees it; null for an unknown token. */
export async function peekGrant(sql: Sql, token: string): Promise<GrantPeek | null> {
  const rows = await sql<{
    business_name: string;
    owner_name: string | null;
    owner_email: string;
    invited_email: string;
    used: boolean;
    expired: boolean;
  }>`
    select b.name as business_name, u.name as owner_name, u.email as owner_email,
      g.invited_email,
      (g.accepted_at is not null or g.revoked_at is not null) as used,
      g.expires_at <= now() as expired
    from business_firm_grants g
    join businesses b on b.user_id = g.business_owner_id and b.id = g.business_id
    join "user" u on u.id = g.business_owner_id
    where g.token = ${token} and g.kind = 'grant' and b.deleted_at is null
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    businessName: row.business_name,
    ownerName: row.owner_name || maskEmail(row.owner_email),
    invitedEmailMasked: maskEmail(row.invited_email),
    status: row.used ? "used" : row.expired ? "expired" : "open",
  };
}

/** What acceptance did, for the page's toast. */
export interface AcceptedGrant {
  businessName: string;
  ownerUserId: string;
  businessId: string;
  firmUserId: string;
}

/**
 * The firm owner accepts: the business joins the firm's client list. Only
 * the owner of a firm whose confirmed address is the invited one may accept,
 * and only while the firm's plan holds one more client. The engagement row
 * starts afresh, keeping its stamps, counts and the owner's address.
 */
export async function acceptGrant(sql: Sql, token: string, userId: string): Promise<AcceptedGrant> {
  return inTransaction(sql, async (tx) => {
    const grants = await tx<{
      business_owner_id: string;
      business_id: string;
      invited_email: string;
    }>`
      select business_owner_id, business_id, invited_email from business_firm_grants
      where token = ${token} and kind = 'grant' and accepted_at is null and revoked_at is null
        and expires_at > now()
      for update
    `;
    const grant = grants[0];
    if (!grant) throw new FirmMembershipError(GRANT_CLOSED);
    if (grant.business_owner_id === userId) throw new FirmMembershipError(OWN_BUSINESS_GRANT);
    const firm = await loadFirmFor(tx, userId);
    if (!firm || firm.role !== "owner") throw new FirmMembershipError(ONLY_FIRM_OWNER_ACCEPTS);
    const { fit } = await accountFit(tx, userId, grant.invited_email);
    if (fit === "mismatch") {
      throw new FirmMembershipError(grantMismatch(maskEmail(grant.invited_email)));
    }
    if (fit === "confirm") throw new FirmMembershipError(GRANT_CONFIRM);
    const businesses = await tx<{ name: string; firm_user_id: string | null }>`
      select name, firm_user_id from businesses
      where user_id = ${grant.business_owner_id} and id = ${grant.business_id}
        and deleted_at is null
      for update
    `;
    const business = businesses[0];
    if (!business || business.firm_user_id) throw new FirmMembershipError(GRANT_CLOSED);
    // A granted business counts toward the firm's client limit and tier.
    const e = await loadEntitlements(tx, userId);
    const held = await countClients(tx, userId, firm);
    if (held >= e.clientLimit) {
      throw new RequestError(
        402,
        businessLimitMessage({ plan: e.plan, limit: e.clientLimit, tier: e.tier }),
      );
    }
    await tx`
      update businesses set firm_user_id = ${firm.firmUserId}, granted_at = now()
      where user_id = ${grant.business_owner_id} and id = ${grant.business_id}
    `;
    await tx`
      update business_firm_grants
      set accepted_by = ${userId}, accepted_at = now(), firm_user_id = ${firm.firmUserId}
      where token = ${token}
    `;
    await revokeOpenGrants(tx, grant.business_owner_id, grant.business_id);
    await resetEngagement(tx, grant.business_owner_id, grant.business_id);
    return {
      businessName: business.name,
      ownerUserId: grant.business_owner_id,
      businessId: grant.business_id,
      firmUserId: firm.firmUserId,
    };
  });
}

/**
 * Ends a firm's access to a business its owner shared: the business's own
 * account or the owner of the firm working on it. The business leaves the
 * firm, the engagement starts afresh, the links the firm's members made on
 * it are revoked (the owner's own stay), and open invitations close. With no
 * firm on the row, it only closes the open invitation.
 */
export async function endGrant(
  sql: Sql,
  input: { ownerUserId: string; businessId: string; actorUserId: string },
): Promise<{ firmUserId: string | null }> {
  return inTransaction(sql, async (tx) => {
    const rows = await tx<{ firm_user_id: string | null; granted: boolean }>`
      select firm_user_id, granted_at is not null as granted from businesses
      where user_id = ${input.ownerUserId} and id = ${input.businessId}
      for update
    `;
    const row = rows[0];
    if (!row) throw new RequestError(404, "That client is not on this account");
    const own = input.actorUserId === input.ownerUserId;
    if (!own && (row.firm_user_id === null || input.actorUserId !== row.firm_user_id)) {
      throw new RequestError(403, END_ACCESS_REFUSED);
    }
    if (row.firm_user_id === null) {
      await revokeOpenGrants(tx, input.ownerUserId, input.businessId);
      return { firmUserId: null };
    }
    if (!row.granted) throw new RequestError(409, NOT_GRANTED);
    await tx`
      update businesses set firm_user_id = null, granted_at = null
      where user_id = ${input.ownerUserId} and id = ${input.businessId} and granted_at is not null
    `;
    await resetEngagement(tx, input.ownerUserId, input.businessId);
    await tx`
      update map_shares set revoked_at = now()
      where business_owner_id = ${input.ownerUserId} and business_id = ${input.businessId}
        and user_id <> ${input.ownerUserId} and revoked_at is null
    `;
    await revokeOpenGrants(tx, input.ownerUserId, input.businessId);
    return { firmUserId: row.firm_user_id };
  });
}

/** The business's grant for its owner's card: the firm working on it, the open invitation, or null. */
export async function loadGrantFor(
  sql: Sql,
  ownerUserId: string,
  businessId: string,
): Promise<GrantState> {
  const granted = await sql<{ firm_name: string; granted_at: string }>`
    select f.name as firm_name, b.granted_at
    from businesses b join firms f on f.user_id = b.firm_user_id
    where b.user_id = ${ownerUserId} and b.id = ${businessId} and b.granted_at is not null
  `;
  if (granted[0]) {
    return { firmName: granted[0].firm_name, since: toIsoTimestamp(granted[0].granted_at) };
  }
  const open = await sql<{ invited_email: string; expires_at: string }>`
    select invited_email, expires_at from business_firm_grants
    where business_owner_id = ${ownerUserId} and business_id = ${businessId}
      and kind = 'grant' and accepted_at is null and revoked_at is null and expires_at > now()
    order by created_at desc
    limit 1
  `;
  return open[0]
    ? { pendingEmail: open[0].invited_email, expiresAt: toIsoTimestamp(open[0].expires_at) }
    : null;
}

/**
 * Starts the business's engagement afresh for a new firm, or for none:
 * scope, period, preparer and reviewer cleared, active. The row's stamps,
 * finding counts and owner address stay. A firm that later works on the
 * business never inherits another firm's engagement.
 */
export async function resetEngagement(
  tx: Sql,
  ownerUserId: string,
  businessId: string,
): Promise<void> {
  await tx`
    insert into engagement_marks (user_id, business_id)
    values (${ownerUserId}, ${businessId})
    on conflict (user_id, business_id) do update set
      scope = '', period_start = null, period_end = null,
      preparer_user_id = null, reviewer_user_id = null,
      status = 'active', ended_at = null
  `;
}

async function revokeOpenGrants(tx: Sql, ownerUserId: string, businessId: string): Promise<void> {
  await tx`
    update business_firm_grants set revoked_at = now()
    where business_owner_id = ${ownerUserId} and business_id = ${businessId}
      and accepted_at is null and revoked_at is null
  `;
}
