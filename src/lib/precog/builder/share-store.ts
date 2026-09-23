import type { Sql } from "@/lib/db";
import { toIsoTimestamp, toIsoTimestampOrNull } from "../iso-time";

/**
 * Share-link rows, kept free of `createServerFn` so they run against PGLite in
 * a unit test. Every query is scoped by the owner's verified user id.
 */

/** Live (not revoked, not expired) links one account may hold at once. */
export const MAX_LIVE_SHARES = 50;
/** Revoked or expired links still listed for reference, newest first. */
export const INACTIVE_SHARES_LISTED = 20;

export class ShareLimitError extends Error {
  readonly status = 409;
  constructor() {
    super(
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
      redacted, passcode_salt, passcode_hash
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
      ${share.passcodeHash}::text
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
};

/**
 * The owner's links: every live one, however many, then the newest revoked
 * or expired ones. The share panel only offers "revoke" for a listed link, so
 * a live link must never drop off the list behind newer dead ones.
 */
export async function listMapShareSummaries(sql: Sql, userId: string): Promise<ShareSummary[]> {
  const live = await sql<ShareListRow>`
    select
      token, created_at, expires_at, revoked_at, redacted,
      passcode_hash is not null as has_passcode,
      (select count(*)::int from map_share_views v where v.token = s.token) as views,
      (select max(viewed_at) from map_share_views v where v.token = s.token) as last_viewed_at
    from map_shares s
    where user_id = ${userId}
      and revoked_at is null
      and (expires_at is null or expires_at > now())
    order by created_at desc
  `;
  const inactive = await sql<ShareListRow>`
    select
      token, created_at, expires_at, revoked_at, redacted,
      passcode_hash is not null as has_passcode,
      (select count(*)::int from map_share_views v where v.token = s.token) as views,
      (select max(viewed_at) from map_share_views v where v.token = s.token) as last_viewed_at
    from map_shares s
    where user_id = ${userId}
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
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
