import type { Sql } from "@/lib/db";
import { toIsoTimestamp, toIsoTimestampOrNull } from "../iso-time";
import { RequestError } from "@/lib/request-errors";

/**
 * Share-link rows, kept free of `createServerFn` so they run against PGLite in
 * a unit test. Every query is scoped by the owner's verified user id; the
 * firm owner also reaches the links on the firm's clients.
 */

/** Live (not revoked, not expired) links one account may hold at once. */
export const MAX_LIVE_SHARES = 50;
/** Revoked or expired links still listed for reference, newest first. */
export const INACTIVE_SHARES_LISTED = 20;

export class ShareLimitError extends RequestError {
  constructor() {
    super(
      409,
      `You already have ${MAX_LIVE_SHARES} live share links. Revoke one you no longer need, then try again.`,
    );
    this.name = "ShareLimitError";
  }
}

export interface NewMapShare {
  token: string;
  userId: string;
  businessName: string;
  industry: string;
  payloadJson: string;
  expiresAt: string;
  redacted: boolean;
  passcodeSalt: string | null;
  passcodeHash: string | null;
  /** The business the link copies (its owner and id), checked by the caller. */
  businessOwnerId?: string | null;
  businessId?: string | null;
}

/**
 * Stores a new link unless the owner already holds `limit` live ones. The
 * count and the insert are one statement, so a refused link leaves no row.
 * Two creates racing at the limit can both pass; the list below never hides
 * a live link, so an overshoot stays visible and revocable.
 */
export async function insertMapShare(
  sql: Sql,
  share: NewMapShare,
  limit = MAX_LIVE_SHARES,
): Promise<boolean> {
  const rows = await sql<{ token: string }>`
    insert into map_shares (
      token, user_id, business_name, industry, payload, expires_at,
      redacted, passcode_salt, passcode_hash, business_owner_id, business_id
    )
    select
      ${share.token}::text,
      ${share.userId}::text,
      ${share.businessName}::text,
      ${share.industry}::text,
      ${share.payloadJson}::jsonb,
      ${share.expiresAt}::timestamptz,
      ${share.redacted}::boolean,
      ${share.passcodeSalt}::text,
      ${share.passcodeHash}::text,
      ${share.businessOwnerId ?? null}::text,
      ${share.businessId ?? null}::text
    where (
      select count(*) from map_shares
      where user_id = ${share.userId}
        and revoked_at is null
        and (expires_at is null or expires_at > now())
    ) < ${limit}::int
    returning token
  `;
  return rows.length > 0;
}

export interface ShareSummary {
  token: string;
  createdAt: string;
  expiresAt: string | null;
  revoked: boolean;
  redacted: boolean;
  hasPasscode: boolean;
  views: number;
  lastViewedAt: string | null;
  /** Who made the link when a colleague did (the firm owner sees those); null for the caller's own. */
  createdBy: string | null;
}

type ShareListRow = {
  token: string;
  created_at: unknown;
  expires_at: unknown;
  revoked_at: unknown;
  redacted: boolean;
  has_passcode: boolean;
  views: number | string | null;
  last_viewed_at: unknown;
  created_by: string | null;
};

/**
 * The owner's links: every live one, however many, then the newest revoked
 * or expired ones. The share panel only offers "revoke" for a listed link, so
 * a live link must never drop off the list behind newer dead ones. A firm
 * owner also sees the links colleagues made on the firm's clients, so they
 * can revoke them.
 */
export async function listMapShareSummaries(sql: Sql, userId: string): Promise<ShareSummary[]> {
  const live = await sql<ShareListRow>`
    select
      token, created_at, expires_at, revoked_at, redacted,
      passcode_hash is not null as has_passcode,
      (select count(*)::int from map_share_views v where v.token = s.token) as views,
      (select max(viewed_at) from map_share_views v where v.token = s.token) as last_viewed_at,
      case when s.user_id = ${userId} then null
        else (select u.name from "user" u where u.id = s.user_id) end as created_by
    from map_shares s
    where (
        s.user_id = ${userId}
        or exists (
          select 1 from businesses b
          where b.user_id = s.business_owner_id and b.id = s.business_id
            and b.firm_user_id = ${userId}
        )
      )
      and revoked_at is null
      and (expires_at is null or expires_at > now())
    order by created_at desc
  `;
  const inactive = await sql<ShareListRow>`
    select
      token, created_at, expires_at, revoked_at, redacted,
      passcode_hash is not null as has_passcode,
      (select count(*)::int from map_share_views v where v.token = s.token) as views,
      (select max(viewed_at) from map_share_views v where v.token = s.token) as last_viewed_at,
      case when s.user_id = ${userId} then null
        else (select u.name from "user" u where u.id = s.user_id) end as created_by
    from map_shares s
    where s.user_id = ${userId}
      and (revoked_at is not null or (expires_at is not null and expires_at <= now()))
    order by created_at desc
    limit ${INACTIVE_SHARES_LISTED}::int
  `;
  return [...live, ...inactive]
    .map((r) => ({
      token: r.token,
      createdAt: toIsoTimestamp(r.created_at),
      expiresAt: toIsoTimestampOrNull(r.expires_at),
      revoked: Boolean(r.revoked_at),
      redacted: Boolean(r.redacted),
      hasPasscode: Boolean(r.has_passcode),
      views: Number(r.views ?? 0),
      lastViewedAt: toIsoTimestampOrNull(r.last_viewed_at),
      createdBy: r.created_by ?? null,
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Revokes one link for the account that made it, or for the firm owner when
 * the link copies one of the firm's clients. Returns false when the caller
 * may not revoke it (or it does not exist).
 */
export async function revokeShare(sql: Sql, userId: string, token: string): Promise<boolean> {
  const rows = await sql<{ token: string }>`
    update map_shares s set revoked_at = coalesce(s.revoked_at, now())
    where s.token = ${token}
      and (
        s.user_id = ${userId}
        or exists (
          select 1 from businesses b
          where b.user_id = s.business_owner_id and b.id = s.business_id
            and b.firm_user_id = ${userId}
        )
      )
    returning s.token
  `;
  return rows.length > 0;
}

/**
 * True while the link's maker can still reach the business it copies: the
 * business exists and is not deleted, and the maker owns it or is in its
 * firm. A link made before links recorded their business passes. Catches
 * what a missed revocation would leave open (an account deleted, a business
 * purged).
 */
export async function shareStillReachable(sql: Sql, token: string): Promise<boolean> {
  const rows = await sql<{ reachable: boolean }>`
    select s.business_id is null or exists (
      select 1 from businesses b
      where b.user_id = s.business_owner_id and b.id = s.business_id and b.deleted_at is null
        and (
          b.user_id = s.user_id
          or b.firm_user_id = s.user_id
          or exists (
            select 1 from firm_members m
            where m.firm_user_id = b.firm_user_id and m.member_user_id = s.user_id
          )
        )
    ) or (
      -- The maker's own business, made before its first save reached the
      -- account: no row yet. Deleting a saved one revokes its links outright.
      s.business_owner_id = s.user_id
      and not exists (
        select 1 from businesses b
        where b.user_id = s.business_owner_id and b.id = s.business_id
      )
    ) as reachable
    from map_shares s where s.token = ${token}
  `;
  return rows[0]?.reachable === true;
}

/** Revokes every link to a business, whoever made it; run when the business is deleted. */
export async function revokeBusinessShares(
  sql: Sql,
  businessOwnerId: string,
  businessId: string,
): Promise<void> {
  await sql`
    update map_shares set revoked_at = now()
    where business_owner_id = ${businessOwnerId} and business_id = ${businessId}
      and revoked_at is null
  `;
}

/**
 * A member leaves the firm (or is removed): revokes every link they made on
 * the firm's clients, the ones they set up included (those stay with the
 * firm, and the member loses access), and the member's links made before
 * links recorded their business (which cannot be told apart). Colleagues'
 * links to the clients the member set up keep working. Run before the
 * member's clients are handed to the owner, while the rows still name them.
 */
export async function revokeDepartingMemberShares(
  sql: Sql,
  firmUserId: string,
  memberUserId: string,
): Promise<void> {
  await sql`
    update map_shares s set revoked_at = now()
    where s.revoked_at is null
      and s.user_id = ${memberUserId}
      and (
        s.business_id is null
        or exists (
          select 1 from businesses b
          where b.user_id = s.business_owner_id and b.id = s.business_id
            and b.firm_user_id = ${firmUserId}
        )
      )
  `;
}

/** Share view logs older than this are purged by the weekly job (routes/api/cron/digest.ts). */
export const SHARE_VIEW_RETENTION_DAYS = 90;

export async function purgeOldShareViews(sql: Sql): Promise<void> {
  await sql`
    delete from map_share_views
    where viewed_at < now() - make_interval(days => ${SHARE_VIEW_RETENTION_DAYS})
  `;
}

/**
 * Logs one view of a shared map, at most one per address per minute: a
 * crawler or a looping tab would otherwise add a row per request, inflating
 * the owner's view count and the table until the next purge.
 */
export async function recordShareView(
  sql: Sql,
  view: { token: string; ipHash: string; userAgent: string | null },
): Promise<void> {
  await sql`
    insert into map_share_views (token, ip_hash, user_agent)
    select ${view.token}::text, ${view.ipHash}::text, ${view.userAgent}::text
    where not exists (
      select 1 from map_share_views
      where token = ${view.token}
        and ip_hash = ${view.ipHash}
        and viewed_at > now() - interval '1 minute'
    )
  `;
}
