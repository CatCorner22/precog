import type { Sql } from "@/lib/db";
import { inTransaction } from "@/lib/sql-transaction";
import { toIsoTimestamp, toIsoTimestampOrNull } from "../iso-time";
import { formatDay } from "../dates";
import { RequestError } from "@/lib/request-errors";
import type { FirmSnapshot } from "./store";

/**
 * Locked report versions. Locking freezes the business as the account holds
 * it (the saved row, not whatever the browser has unsaved) under the next
 * version number, with the preparer's name, and, for a firm client, the
 * firm's name and letterhead as they were that day. A reviewer of the same
 * firm, who is not the preparer, reviews it for issuance. Nothing on a
 * version changes afterwards except the sent stamp.
 */
export interface ReportVersionRow {
  id: string;
  businessId: string;
  versionNo: number;
  revision: number | null;
  scopeNote: string;
  preparedBy: string | null;
  preparedByName: string | null;
  preparedAt: string;
  reviewedBy: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  reviewNote: string;
  sentAt: string | null;
  /**
   * Whether the version stores the figures it printed. False for a version
   * locked before Precog stored them or whose model was past the cap; such
   * a version recalculates when opened, so it cannot be shared as issued.
   */
  hasFigures: boolean;
  /**
   * The firm as frozen at lock; null for a solo business and for versions
   * locked before migration 0041. The versions list carries the name and
   * letterhead with `logoDataUrl` null (up to 50 rows, nothing prints the
   * logo there); only the single-version load carries the logo.
   */
  firm: FirmSnapshot | null;
  /**
   * The client's engagement (scope and period) as it stood at lock; null
   * when all three were empty, and for every version locked before
   * migration 0045. Printed from here only.
   */
  engagement: VersionEngagement | null;
}

/** The engagement frozen into a locked version. */
export interface VersionEngagement {
  scope: string;
  /** "YYYY-MM-DD", or null. */
  periodStart: string | null;
  periodEnd: string | null;
}

export class ReportVersionError extends RequestError {
  constructor(status: number, message: string) {
    super(status, message);
    this.name = "ReportVersionError";
  }
}

const VERSION_COLUMNS = `
  v.id, v.business_id, v.version_no, v.revision, v.scope_note,
  v.prepared_by, p.name as prepared_by_name, v.prepared_at,
  v.reviewed_by, r.name as reviewed_by_name, v.reviewed_at, v.review_note, v.sent_at,
  v.report_model is not null as has_figures,
  v.firm_name, v.firm_letterhead,
  v.engagement_scope, v.engagement_period_start, v.engagement_period_end
`;
const VERSION_JOINS = `
  left join "user" p on p.id = v.prepared_by
  left join "user" r on r.id = v.reviewed_by
`;

interface RawVersion {
  id: string;
  business_id: string;
  version_no: number | string;
  revision: number | string | null;
  scope_note: string;
  prepared_by: string | null;
  prepared_by_name: string | null;
  prepared_at: string;
  reviewed_by: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  review_note: string;
  sent_at: string | null;
  has_figures: boolean;
  firm_name: string | null;
  firm_letterhead: string | null;
  engagement_scope: string | null;
  engagement_period_start: string | null;
  engagement_period_end: string | null;
  /** Selected by the single-version load only; the list leaves it out. */
  firm_logo_data_url?: string | null;
}

function toRow(r: RawVersion): ReportVersionRow {
  return {
    id: r.id,
    businessId: r.business_id,
    versionNo: Number(r.version_no),
    revision: r.revision === null ? null : Number(r.revision),
    scopeNote: r.scope_note,
    preparedBy: r.prepared_by,
    preparedByName: r.prepared_by_name,
    preparedAt: toIsoTimestamp(r.prepared_at),
    reviewedBy: r.reviewed_by,
    reviewedByName: r.reviewed_by_name,
    reviewedAt: toIsoTimestampOrNull(r.reviewed_at),
    reviewNote: r.review_note,
    sentAt: toIsoTimestampOrNull(r.sent_at),
    hasFigures: Boolean(r.has_figures),
    firm:
      r.firm_name === null
        ? null
        : {
            name: r.firm_name,
            letterhead: r.firm_letterhead ?? "",
            logoDataUrl: r.firm_logo_data_url ?? null,
          },
    engagement:
      r.engagement_scope === null &&
      r.engagement_period_start === null &&
      r.engagement_period_end === null
        ? null
        : {
            scope: r.engagement_scope ?? "",
            periodStart: r.engagement_period_start,
            periodEnd: r.engagement_period_end,
          },
  };
}

/**
 * The figures a version printed when it was locked, with the scoring and
 * layout versions that produced them. The model is JSON the caller shapes;
 * this store only keeps it. A null model means the lock ran with these
 * versions but did not store the figures.
 */
export interface FrozenReportRow<TModel = unknown> {
  scoringVersion: string;
  layoutVersion: number;
  model: TModel | null;
}

/**
 * Freezes the saved business as the next version. The business row is locked
 * while the number is chosen, so two simultaneous locks get consecutive
 * numbers instead of one failing on the unique constraint. `freeze` builds
 * the report's figures from the profile being locked; a null result locks the
 * version without them.
 */
export async function lockReportVersion(
  sql: Sql,
  input: {
    ownerUserId: string;
    businessId: string;
    preparedBy: string;
    scopeNote: string;
    id: string;
    freeze?: (profile: unknown) => FrozenReportRow | null;
  },
): Promise<ReportVersionRow> {
  const row = await inTransaction(sql, async (tx) => {
    const business = await tx<{ id: string; profile: unknown }>`
      select id, profile from businesses
      where user_id = ${input.ownerUserId} and id = ${input.businessId} and deleted_at is null
      for update
    `;
    if (!business[0]) throw new ReportVersionError(404, "That client is not on this account");
    const frozen = input.freeze?.(business[0].profile) ?? null;
    // The firm's name and letterhead are copied in as they are today, through
    // the same join `reportFirmName` uses, so a solo business freezes none;
    // the engagement's scope and period likewise (an empty scope as null).
    await tx`
      insert into report_versions
        (id, user_id, business_id, version_no, revision, profile, scope_note, prepared_by,
         scoring_version, layout_version, report_model,
         firm_name, firm_letterhead, firm_logo_data_url,
         engagement_scope, engagement_period_start, engagement_period_end)
      select
        ${input.id},
        b.user_id,
        b.id,
        coalesce((
          select max(version_no) from report_versions
          where user_id = b.user_id and business_id = b.id
        ), 0) + 1,
        b.revision,
        b.profile,
        ${input.scopeNote},
        ${input.preparedBy},
        ${frozen?.scoringVersion ?? null},
        ${frozen?.layoutVersion ?? null},
        ${frozen?.model ? JSON.stringify(frozen.model) : null}::jsonb,
        f.name,
        f.letterhead,
        f.logo_data_url,
        nullif(e.scope, ''),
        e.period_start,
        e.period_end
      from businesses b
      left join firms f on f.user_id = b.firm_user_id
      left join engagement_marks e on e.user_id = b.user_id and e.business_id = b.id
      where b.user_id = ${input.ownerUserId} and b.id = ${input.businessId}
    `;
    return loadReportVersion(tx, input.ownerUserId, input.id);
  });
  if (!row) throw new Error("Unable to lock the report");
  return row.version;
}

export async function listReportVersions(
  sql: Sql,
  ownerUserId: string,
  businessId: string,
): Promise<ReportVersionRow[]> {
  const rows = await sql.query<RawVersion>(
    `select ${VERSION_COLUMNS} from report_versions v ${VERSION_JOINS}
     where v.user_id = $1 and v.business_id = $2
     order by v.version_no desc limit 50`,
    [ownerUserId, businessId],
  );
  return rows.map(toRow);
}

/** One version with its frozen profile and the firm's frozen logo, or null. */
export async function loadReportVersion<TProfile = unknown>(
  sql: Sql,
  ownerUserId: string,
  id: string,
): Promise<{ version: ReportVersionRow; profile: TProfile } | null> {
  const rows = await sql.query<RawVersion & { profile: TProfile }>(
    `select ${VERSION_COLUMNS}, v.firm_logo_data_url, v.profile from report_versions v ${VERSION_JOINS}
     where v.user_id = $1 and v.id = $2`,
    [ownerUserId, id],
  );
  const row = rows[0];
  return row ? { version: toRow(row), profile: row.profile } : null;
}

/**
 * The figures stored with a version, or null for a version locked before
 * Precog stored them. A version locked since then whose figures were not
 * stored (past the size cap) comes back with a null model.
 */
export async function loadFrozenReport<TModel = unknown>(
  sql: Sql,
  ownerUserId: string,
  id: string,
): Promise<FrozenReportRow<TModel> | null> {
  const rows = await sql<{
    scoring_version: string | null;
    layout_version: number | string | null;
    report_model: TModel | null;
  }>`
    select scoring_version, layout_version, report_model from report_versions
    where user_id = ${ownerUserId} and id = ${id}
  `;
  const row = rows[0];
  if (!row || row.scoring_version === null) return null;
  return {
    scoringVersion: row.scoring_version,
    layoutVersion: Number(row.layout_version ?? 1),
    model: row.report_model ?? null,
  };
}

/**
 * The business a version belongs to, when `userId` may open it: the version's
 * owner, or a member of the firm that owns the business row. Null otherwise,
 * including for a caller whose own business merely shares the id.
 */
export async function reportVersionFor(
  sql: Sql,
  userId: string,
  id: string,
): Promise<{ ownerUserId: string; businessId: string } | null> {
  const rows = await sql<{ user_id: string; business_id: string }>`
    select v.user_id, v.business_id
    from report_versions v
    join businesses b on b.user_id = v.user_id and b.id = v.business_id
    where v.id = ${id}
      and b.deleted_at is null
      and (
        v.user_id = ${userId}
        or (
          b.firm_user_id is not null
          and b.firm_user_id in (
            select firm_user_id from firm_members where member_user_id = ${userId}
          )
        )
      )
  `;
  return rows[0] ? { ownerUserId: rows[0].user_id, businessId: rows[0].business_id } : null;
}

export async function signOffReportVersion(
  sql: Sql,
  input: {
    ownerUserId: string;
    id: string;
    reviewedBy: string;
    note: string;
    /** The preparer is issuing the file alone. Refused when another firm member exists. */
    issueWithoutIndependentReview?: boolean;
  },
): Promise<ReportVersionRow> {
  const current = await loadReportVersion(sql, input.ownerUserId, input.id);
  if (!current) throw new ReportVersionError(404, "That report version does not exist");
  if (current.version.reviewedAt) {
    throw new ReportVersionError(409, "Someone has already reviewed this version for issuance");
  }
  const self = current.version.preparedBy === input.reviewedBy;
  if (self) {
    if (!input.issueWithoutIndependentReview) {
      throw new ReportVersionError(409, "The preparer cannot review their own report for issuance");
    }
    const firms = await sql<{ firm_user_id: string | null }>`
      select firm_user_id from businesses
      where user_id = ${input.ownerUserId} and id = ${current.version.businessId}
    `;
    const firmId = firms[0]?.firm_user_id;
    if (firmId) {
      const others = await sql`
        select 1 from firm_members
        where firm_user_id = ${firmId} and member_user_id <> ${input.reviewedBy}
        limit 1
      `;
      if (others.length) {
        throw new ReportVersionError(
          409,
          "A different person at the firm must review this report for issuance",
        );
      }
    }
  }
  const note = self ? `Not an independent review. ${input.note}`.trim().slice(0, 600) : input.note;
  await sql`
    update report_versions
    set reviewed_by = ${input.reviewedBy}, reviewed_at = now(), review_note = ${note}
    where user_id = ${input.ownerUserId} and id = ${input.id} and reviewed_at is null
  `;
  const updated = await loadReportVersion(sql, input.ownerUserId, input.id);
  if (!updated) throw new Error("Unable to record the review");
  return updated.version;
}

/**
 * Stamps a version as sent, and the client's engagement with the first sent
 * report, so the client list and the pilot figures read the same fact.
 * Refused until the version is signed off: delivery metrics never include
 * unreviewed work. The sole-issuer path stays open through sign-off, which a
 * one-partner firm records before sending.
 */
export async function markReportVersionSent(
  sql: Sql,
  ownerUserId: string,
  id: string,
): Promise<void> {
  const current = await loadReportVersion(sql, ownerUserId, id);
  if (!current) throw new ReportVersionError(404, "That report version does not exist");
  if (!current.version.reviewedAt) {
    throw new ReportVersionError(409, "Sign off this report before marking it sent.");
  }
  await sql`
    with sent as (
      update report_versions set sent_at = coalesce(sent_at, now())
      where user_id = ${ownerUserId} and id = ${id}
      returning user_id, business_id, sent_at
    )
    insert into engagement_marks (user_id, business_id, report_sent_at)
    select user_id, business_id, sent_at from sent
    on conflict (user_id, business_id) do update set
      report_sent_at = coalesce(engagement_marks.report_sent_at, excluded.report_sent_at)
  `;
}

/**
 * The name of the firm a business is a client of, for the report's
 * "Prepared for … by …" line; null for a solo business, even when its owner
 * holds a `firms` row of their own (the join is on `firm_user_id` alone).
 */
export async function reportFirmName(
  sql: Sql,
  ownerUserId: string,
  businessId: string,
): Promise<string | null> {
  const rows = await sql<{ name: string }>`
    select f.name from businesses b
    join firms f on f.user_id = b.firm_user_id
    where b.user_id = ${ownerUserId} and b.id = ${businessId}
  `;
  return rows[0]?.name ?? null;
}

/**
 * The engagement line a locked version prints: "Engagement: {scope} · {from}
 * to {to}", leaving out a missing part and its separator. Null when the
 * version froze no engagement.
 */
export function engagementLine(v: Pick<ReportVersionRow, "engagement">): string | null {
  const e = v.engagement;
  if (!e) return null;
  const from = e.periodStart ? formatDay(e.periodStart) : null;
  const to = e.periodEnd ? formatDay(e.periodEnd) : null;
  const period = from && to ? `${from} to ${to}` : from ? `from ${from}` : to ? `to ${to}` : "";
  const parts = [e.scope.trim(), period].filter(Boolean);
  return parts.length ? `Engagement: ${parts.join(" · ")}` : null;
}

/** One line of provenance for a locked version, printed in the report header. */
export function versionProvenance(v: ReportVersionRow): string {
  const prepared = `Prepared by ${v.preparedByName ?? "a firm member"} on ${formatDay(v.preparedAt)}`;
  const reviewed = !v.reviewedAt
    ? " · Not yet reviewed"
    : v.reviewedBy && v.preparedBy === v.reviewedBy
      ? ` · Issued by ${v.reviewedByName ?? "the preparer"} on ${formatDay(v.reviewedAt)}. Not an independent review`
      : ` · Reviewed for issuance by ${v.reviewedByName ?? "a reviewer"} on ${formatDay(v.reviewedAt)}`;
  return `Version ${v.versionNo} · ${prepared}${reviewed}`;
}
