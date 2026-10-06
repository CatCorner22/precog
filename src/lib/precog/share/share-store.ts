import type { Sql } from "@/lib/db";
import { toIsoTimestamp, toIsoTimestampOrNull } from "../iso-time";
import { RequestError } from "@/lib/request-errors";
import {
  loadFrozenReport,
  loadReportVersion,
  versionFirmName,
  withoutReviewRouting,
  type FrozenReportRow,
  type ReportVersionRow,
} from "../firm/reports";
import type { FirmSnapshot } from "../firm/store";
import type { StoredReportModel } from "../report/stored-model";
import type { PracticeProfile } from "../practice-profile";
import { mergeProfile } from "../profile-merge";
import { shareReportProfile } from "./report-share-profile";

/**
 * Share-link rows, kept free of `createServerFn` so they run against PGLite in
 * a unit test. Every query is scoped by the owner's verified user id; the
 * firm owner also reaches the links on the firm's clients, and a business's
 * own account the links anyone made on its business.
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
  /** The locked report version a report link prints; null for a map link. */
  reportVersionId?: string | null;
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
      redacted, passcode_salt, passcode_hash, business_owner_id, business_id, report_version_id
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
      ${share.businessId ?? null}::text,
      ${share.reportVersionId ?? null}::text
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
  /**
   * Who made the link when someone else did: a colleague (the firm owner sees
   * those) or a firm's member (the business's own account sees those); null
   * for the caller's own.
   */
  createdBy: string | null;
  /** The firm `createdBy` made the link for, when they are its member; null otherwise. */
  createdByFirm: string | null;
  /** A map link carries a copy of the map; a report link prints a locked version. */
  kind: "map" | "report";
  /** The business the link copies; null for a link made before links recorded it. */
  businessId: string | null;
  /** The locked version a report link prints, and its number; null for a map link. */
  reportVersionId: string | null;
  versionNo: number | null;
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
  created_by_firm: string | null;
  business_id: string | null;
  report_version_id: string | null;
  version_no: number | string | null;
};

const SHARE_LIST_COLUMNS = `
  s.token, s.created_at, s.expires_at, s.revoked_at, s.redacted,
  s.passcode_hash is not null as has_passcode,
  (select count(*)::int from map_share_views v where v.token = s.token) as views,
  (select max(viewed_at) from map_share_views v where v.token = s.token) as last_viewed_at,
  case when s.user_id = $1 then null
    else (select u.name from "user" u where u.id = s.user_id) end as created_by,
  case when s.user_id = $1 then null
    else (
      select f.name from businesses b
      join firms f on f.user_id = b.firm_user_id
      where b.user_id = s.business_owner_id and b.id = s.business_id
        and exists (
          select 1 from firm_members m
          where m.firm_user_id = b.firm_user_id and m.member_user_id = s.user_id
        )
    ) end as created_by_firm,
  s.business_id, s.report_version_id, rv.version_no
`;
const SHARE_LIST_JOINS = `left join report_versions rv on rv.id = s.report_version_id`;

/**
 * Whether account `caller` (a query placeholder, such as `$1`) reaches link
 * `s` it did not make, to list it and revoke it:
 *
 * - the business's own account reaches every link to its business, the ones
 *   a firm's member made on a business it shared with the firm included, so
 *   the owner sees and ends them without ending the firm's access;
 * - the firm owner reaches the links to the firm's clients, except one the
 *   business's own account made to a business it shared with the firm. That
 *   link stays the account's alone, as ending the firm's access leaves it
 *   (endGrant).
 */
const callerReaches = (caller: string) => `exists (
  select 1 from businesses b
  where b.user_id = s.business_owner_id and b.id = s.business_id
    and (
      b.user_id = ${caller}
      or (
        b.firm_user_id = ${caller}
        and not (b.granted_at is not null and s.user_id = b.user_id)
      )
    )
)`;

/**
 * The owner's links: every live one, however many, then the newest revoked
 * or expired ones. The share panel only offers "revoke" for a listed link, so
 * a live link must never drop off the list behind newer dead ones. A firm
 * owner also sees the links colleagues made on the firm's clients, and the
 * business's own account the links a firm's member made on its business,
 * live and past, so they can revoke the live ones and audit the rest
 * (`callerReaches`).
 */
export async function listMapShareSummaries(sql: Sql, userId: string): Promise<ShareSummary[]> {
  const live = await sql.query<ShareListRow>(
    `select ${SHARE_LIST_COLUMNS}
     from map_shares s ${SHARE_LIST_JOINS}
     where (s.user_id = $1 or ${callerReaches("$1")})
       and s.revoked_at is null
       and (s.expires_at is null or s.expires_at > now())
     order by s.created_at desc`,
    [userId],
  );
  const inactive = await sql.query<ShareListRow>(
    `select ${SHARE_LIST_COLUMNS}
     from map_shares s ${SHARE_LIST_JOINS}
     where (s.user_id = $1 or ${callerReaches("$1")})
       and (s.revoked_at is not null or (s.expires_at is not null and s.expires_at <= now()))
     order by s.created_at desc
     limit $2`,
    [userId, INACTIVE_SHARES_LISTED],
  );
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
      createdByFirm: r.created_by_firm ?? null,
      kind: r.report_version_id ? ("report" as const) : ("map" as const),
      businessId: r.business_id ?? null,
      reportVersionId: r.report_version_id ?? null,
      versionNo: r.version_no === null || r.version_no === undefined ? null : Number(r.version_no),
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Why a locked version cannot be shared as an issued report, or null when it
 * can: report links are for a firm's client businesses (or, with
 * `allowSolo`, a business whose owner is in no firm and whose plan allows
 * locked versions; the caller decides that), only a version reviewed for
 * issuance, and only one that stores the figures it printed (a version
 * without them recalculates with today's scoring, which is not what was
 * issued). The caller has already checked that `ownerUserId` may open the
 * version.
 */
export const REPORT_SHARE_REFUSAL = {
  solo: "Report links are for a firm's client businesses. Add the business to your firm to share its report.",
  unreviewed: "Only a version reviewed for issuance can be shared. Review it for issuance first.",
  noFigures:
    "This version was locked without its stored figures, so Precog cannot share it as issued. Lock a new version and review it.",
} as const;

export async function reportShareRefusal(
  sql: Sql,
  ownerUserId: string,
  versionId: string,
  { allowSolo = false }: { allowSolo?: boolean } = {},
): Promise<string | null> {
  const rows = await sql<{ firm_client: boolean; reviewed: boolean; has_figures: boolean }>`
    select b.firm_user_id is not null as firm_client,
      v.reviewed_at is not null as reviewed,
      v.report_model is not null as has_figures
    from report_versions v
    join businesses b on b.user_id = v.user_id and b.id = v.business_id
    where v.user_id = ${ownerUserId} and v.id = ${versionId}
  `;
  const row = rows[0];
  if (!row) return "That report version does not exist";
  if (!row.firm_client && !allowSolo) return REPORT_SHARE_REFUSAL.solo;
  if (!row.reviewed) return REPORT_SHARE_REFUSAL.unreviewed;
  if (!row.has_figures) return REPORT_SHARE_REFUSAL.noFigures;
  return null;
}

/** A share row with the locked version it prints, for the public report page. */
export interface ReportShareRow {
  token: string;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  passcodeSalt: string | null;
  passcodeHash: string | null;
  reportVersionId: string;
  /** The version's owner account and business, which `loadReportVersion` is keyed by. */
  ownerUserId: string;
  businessId: string;
  versionNo: number;
  reviewedAt: string | null;
}

/**
 * The share row for a report link with its version's keys, or null when the
 * token is unknown or names a map link. The version row is joined, so a
 * version deleted with its business (the cascade also removes the share)
 * reads as missing.
 */
export async function loadReportShareRow(sql: Sql, token: string): Promise<ReportShareRow | null> {
  const rows = await sql<{
    token: string;
    created_at: unknown;
    expires_at: unknown;
    revoked_at: unknown;
    passcode_salt: string | null;
    passcode_hash: string | null;
    report_version_id: string;
    user_id: string;
    business_id: string;
    version_no: number | string;
    reviewed_at: unknown;
  }>`
    select s.token, s.created_at, s.expires_at, s.revoked_at, s.passcode_salt, s.passcode_hash,
      s.report_version_id, v.user_id, v.business_id, v.version_no, v.reviewed_at
    from map_shares s
    join report_versions v on v.id = s.report_version_id
    where s.token = ${token}
  `;
  const r = rows[0];
  if (!r) return null;
  return {
    token: r.token,
    createdAt: toIsoTimestamp(r.created_at),
    expiresAt: toIsoTimestampOrNull(r.expires_at),
    revokedAt: toIsoTimestampOrNull(r.revoked_at),
    passcodeSalt: r.passcode_salt,
    passcodeHash: r.passcode_hash,
    reportVersionId: r.report_version_id,
    ownerUserId: r.user_id,
    businessId: r.business_id,
    versionNo: Number(r.version_no),
    reviewedAt: toIsoTimestampOrNull(r.reviewed_at),
  };
}

/** What a revoke did, and the business the link copies (null on a link made before links recorded it). */
export interface RevokedShare {
  outcome: "revoked" | "already";
  businessOwnerId: string | null;
  businessId: string | null;
}

/**
 * Revokes one link for the account that made it, for the business's own
 * account, or for the firm owner when the link copies one of the firm's
 * clients (`callerReaches`), and says
 * whether this call ended the link: "revoked" when it was live until now,
 * "already" when it was revoked before, null when the caller may not revoke
 * it (or it does not exist). The row lock makes two revokes at once read one
 * "revoked" and one "already". The business comes from the row the update
 * touched, for the activity log.
 */
export async function revokeShareOnce(
  sql: Sql,
  userId: string,
  token: string,
): Promise<RevokedShare | null> {
  const rows = await sql.query<{
    was_live: boolean;
    business_owner_id: string | null;
    business_id: string | null;
  }>(
    `update map_shares s set revoked_at = coalesce(s.revoked_at, now())
     from (select token, revoked_at from map_shares where token = $1 for update) prev
     where s.token = prev.token
       and (s.user_id = $2 or ${callerReaches("$2")})
     returning prev.revoked_at is null as was_live, s.business_owner_id, s.business_id`,
    [token, userId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    outcome: row.was_live ? "revoked" : "already",
    businessOwnerId: row.business_owner_id,
    businessId: row.business_id,
  };
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
 * links to the clients the member set up keep working, and so do the
 * member's links to their own business they shared with the firm, which
 * stays theirs (decision 29). Run before the
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
            -- The member's own business, shared with the firm, stays theirs
            -- when they go, and so do their links to it.
            and not (b.granted_at is not null and b.user_id = ${memberUserId})
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

/** What the public report page prints for a report link. */
export interface SharedReport {
  version: ReportVersionRow;
  frozen: FrozenReportRow<StoredReportModel> | null;
  /**
   * The firm as frozen at lock, else its live name alone for a version locked
   * before 0041 that the firm reads (`versionFirmName`).
   */
  firm: FirmSnapshot | null;
  /** The slice of the business the printed report reads (report-share-profile.ts). */
  profile: PracticeProfile;
}

/**
 * The version a report link prints, as `getReport` loads it for a signed-in
 * viewer, with the profile cut down to what the report reads: the link hands
 * the version's names, duties and the month's review results to whoever
 * holds it, and nothing the business wrote for itself (process notes and
 * earlier months' review notes included), nor the firm's review routing
 * (withoutReviewRouting). Null when the version is gone or
 * not reviewed for issuance: a link never prints what issuance never cleared,
 * even if the review was cleared after the link was minted.
 */
export async function loadSharedReport(
  sql: Sql,
  row: Pick<ReportShareRow, "ownerUserId" | "businessId" | "reportVersionId">,
  today: string,
): Promise<SharedReport | null> {
  const loaded = await loadReportVersion<PracticeProfile>(
    sql,
    row.ownerUserId,
    row.reportVersionId,
  );
  if (!loaded || !loaded.version.reviewedAt) return null;
  const [frozen, name] = await Promise.all([
    loadFrozenReport<StoredReportModel>(sql, row.ownerUserId, row.reportVersionId),
    versionFirmName(sql, row.ownerUserId, row.reportVersionId),
  ]);
  const merged = mergeProfile(
    {
      profile: loaded.profile,
      industry: loaded.profile.industry,
      name: loaded.profile.practiceName,
    },
    today,
  );
  return {
    // Who a review was requested from, who returned it and the return note
    // are the firm's own working notes: a public link never names them.
    version: withoutReviewRouting(loaded.version),
    frozen,
    firm: loaded.version.firm ?? (name ? { name, letterhead: "", logoDataUrl: null } : null),
    // Projected as the link is opened, never stored: a link made before the
    // projection last narrowed sends no more than one made today.
    profile: shareReportProfile(
      { ...merged, businessId: row.businessId },
      loaded.version.preparedAt,
    ),
  };
}
