import type { Sql } from "@/lib/db";
import { inTransaction } from "@/lib/sql-transaction";
import { toIsoTimestamp, toIsoTimestampOrNull } from "../iso-time";
import { formatDay } from "../dates";
import { RequestError } from "@/lib/request-errors";
import { SUPPORT_EMAIL } from "../legal/operator";
import type { FirmSnapshot } from "./store";
import {
  assertEngagementOpen,
  loadEngagement,
  lockEngagementWriteAccess,
} from "./engagement-store";

/**
 * Locked report versions. Locking freezes the business as the account holds
 * it (the saved row, not whatever the browser has unsaved) under the next
 * version number, with the preparer's name, and, for a firm client, the
 * firm's name and letterhead as they were that day. The preparer asks for
 * review; a reviewer of the same firm, who is not the preparer, reviews it
 * for issuance or returns it with a note, and the preparer then locks a new
 * one. Nothing on a version changes afterwards except those stamps and the
 * sent stamp; until it is sent, the firm owner or its reviewer can withdraw
 * the review (withdrawReportVersionReview).
 *
 * The review rules the versions panel reads (listReports returns them):
 * - issueAloneFor: whether a preparer may issue alone, with its reason;
 * - assignedReviewerFor: the engagement's reviewer, whom anyone else
 *   reviewing in their place must explain with an override note
 *   (OVERRIDE_NOTE_MIN characters or more), printed from
 *   `reviewOverrideNote`;
 * - withdrawReportVersionReview and its refusals.
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
  /**
   * Why someone other than the engagement's assigned reviewer reviewed it for
   * issuance (migration 0056); null when the assigned reviewer, or nobody
   * assigned, reviewed it, and on every version reviewed before then.
   */
  reviewOverrideNote: string | null;
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
   * letterhead with `logoDataUrl` null (up to REPORT_LIST_LIMIT rows,
   * nothing prints the logo there); only the single-version load carries it.
   */
  firm: FirmSnapshot | null;
  /**
   * The client's engagement (scope and period) as it stood at lock; null
   * when all three were empty, and for every version locked before
   * migration 0045. Printed from here only.
   */
  engagement: VersionEngagement | null;
  /** When the preparer or firm owner asked for review; null when nobody asked. */
  reviewRequestedAt: string | null;
  /**
   * Who the request went to; null on a request when every eligible reviewer
   * of the firm may take it (and when nobody asked).
   */
  reviewRequestedFrom: string | null;
  reviewRequestedFromName: string | null;
  /** When a reviewer returned the version to its preparer; a returned version is never reviewed. */
  returnedAt: string | null;
  returnedBy: string | null;
  returnedByName: string | null;
  /** What the reviewer asked the preparer to change; empty unless returned. */
  returnNote: string;
}

/** The engagement frozen into a locked version. */
export interface VersionEngagement {
  scope: string;
  /** "YYYY-MM-DD", or null. */
  periodStart: string | null;
  periodEnd: string | null;
}

/** The refusals of the request-and-return workflow, pinned in reports.test.ts and review-server.test.ts. */
export const REVIEW_REQUEST_REFUSED =
  "Only the preparer or the firm owner can ask for review of this version.";
export const ALREADY_REVIEWED = "This version has already been reviewed for issuance.";
export const VERSION_RETURNED =
  "This version was returned to its preparer. Lock a new version for review.";
export const NO_ELIGIBLE_REVIEWER =
  "No one else at the firm can review this version. Give a member the reviewer role on the Firm page, then ask again.";
export const RETURN_NOTE_REQUIRED = "Add a note saying what to change.";
export const RETURN_NOTE_TOO_LONG = "Keep the note to 600 characters or fewer.";
export const PREPARER_CANNOT_RETURN = "The preparer cannot return their own version.";
export const REVIEW_BEFORE_SENT = "Review this version for issuance before marking it sent.";
/** The longest return note, after trimming. */
export const RETURN_NOTE_MAX = 600;

/**
 * The stamp of a version its preparer issued alone. It prefixes the stored
 * review note and ends the printed provenance line.
 */
export const NOT_INDEPENDENT = "Not an independent review";
/** Why the preparer cannot issue alone: another member holds the owner or reviewer role. */
export const ISSUE_ALONE_REFUSED =
  "A different person at the firm must review this report for issuance";
/** Why the preparer can issue alone. */
export const ISSUE_ALONE_ALLOWED = `No one else at the firm holds the owner or reviewer role, so you can issue this version alone. It prints as "${NOT_INDEPENDENT}".`;
/** The fewest characters of the note that explains reviewing in the assigned reviewer's place. */
export const OVERRIDE_NOTE_MIN = 10;
/** The refusal of a review in the assigned reviewer's place without that note. */
export const OVERRIDE_NOTE_REQUIRED = `Someone else at the firm is this client's assigned reviewer. To review this version in their place, add a note of at least ${OVERRIDE_NOTE_MIN} characters saying why.`;
/** The refusals of withdrawing a review for issuance. */
export const WITHDRAW_AFTER_SENT =
  "This version was already sent, so its review cannot be withdrawn.";
export const WITHDRAW_REFUSED =
  "Only the firm owner or the person who reviewed this version can withdraw its review.";
/** The refusal of a signer whose role at the firm no longer reviews (see withdrawReportVersionReview). */
export const WITHDRAW_ROLE_REFUSED =
  "Your role at the firm no longer lets you withdraw this review. Ask the firm owner to withdraw it.";
export const NOTHING_TO_WITHDRAW =
  "This version has not been reviewed for issuance, so there is no review to withdraw.";

export class ReportVersionError extends RequestError {
  constructor(status: number, message: string) {
    super(status, message);
    this.name = "ReportVersionError";
  }
}

const VERSION_COLUMNS = `
  v.id, v.business_id, v.version_no, v.revision, v.scope_note,
  v.prepared_by, p.name as prepared_by_name, v.prepared_at,
  v.reviewed_by, r.name as reviewed_by_name, v.reviewed_at, v.review_note,
  v.review_override_note, v.sent_at,
  v.report_model is not null as has_figures,
  v.firm_name, v.firm_letterhead,
  v.engagement_scope, v.engagement_period_start, v.engagement_period_end,
  v.review_requested_at, v.review_requested_from, q.name as review_requested_from_name,
  v.returned_at, v.returned_by, t.name as returned_by_name, v.return_note
`;
const VERSION_JOINS = `
  left join "user" p on p.id = v.prepared_by
  left join "user" r on r.id = v.reviewed_by
  left join "user" q on q.id = v.review_requested_from
  left join "user" t on t.id = v.returned_by
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
  review_override_note: string | null;
  sent_at: string | null;
  has_figures: boolean;
  firm_name: string | null;
  firm_letterhead: string | null;
  engagement_scope: string | null;
  engagement_period_start: string | null;
  engagement_period_end: string | null;
  review_requested_at: string | null;
  review_requested_from: string | null;
  review_requested_from_name: string | null;
  returned_at: string | null;
  returned_by: string | null;
  returned_by_name: string | null;
  return_note: string;
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
    reviewOverrideNote: r.review_override_note,
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
    reviewRequestedAt: toIsoTimestampOrNull(r.review_requested_at),
    reviewRequestedFrom: r.review_requested_from,
    reviewRequestedFromName: r.review_requested_from_name,
    returnedAt: toIsoTimestampOrNull(r.returned_at),
    returnedBy: r.returned_by,
    returnedByName: r.returned_by_name,
    returnNote: r.return_note,
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
 * Why a lock is refused when the figures are past the stored cap
 * (REPORT_MODEL_MAX_CHARS). The stored figures grow with the team: each active
 * person adds duty-conflict rows and coverage rows, and someone marked as left
 * adds none. Map versions and the size of the profile do not count.
 */
export const REPORT_TOO_LARGE_MESSAGE = `This report is too large to lock: the team has more people, and more duty conflicts between them, than a locked version can keep. On the Team tab, mark anyone who no longer works here as left, then lock again. Need help? Write to ${SUPPORT_EMAIL}.`;

/**
 * Freezes the saved business as the next version. The business row is locked
 * while the number is chosen, so two simultaneous locks get consecutive
 * numbers instead of one failing on the unique constraint. `freeze` builds
 * the report's figures from the profile being locked; a null result locks the
 * version without them, and a result marked `tooLarge` refuses the lock (413,
 * REPORT_TOO_LARGE_MESSAGE) so that no version is stored.
 */
export async function lockReportVersion(
  sql: Sql,
  input: {
    ownerUserId: string;
    businessId: string;
    preparedBy: string;
    scopeNote: string;
    id: string;
    freeze?: (profile: unknown) => (FrozenReportRow & { tooLarge?: boolean }) | null;
    /** Additional server-side admission, evaluated under the same write locks. */
    authorize?: (tx: Sql) => Promise<void>;
  },
): Promise<ReportVersionRow> {
  let row;
  try {
    row = await inTransaction(sql, async (tx) => {
      await lockEngagementWriteAccess(tx, input.ownerUserId, input.businessId, input.preparedBy);
      await input.authorize?.(tx);
      const business = await tx<{ id: string; profile: unknown }>`
        select id, profile from businesses
        where user_id = ${input.ownerUserId} and id = ${input.businessId} and deleted_at is null
      `;
      const frozen = input.freeze?.(business[0].profile) ?? null;
      // A version never locks without figures for being large: the lock
      // refuses and says what to remove.
      if (frozen?.tooLarge) throw new ReportVersionError(413, REPORT_TOO_LARGE_MESSAGE);
      // The firm's name and letterhead are copied in as they are today, from
      // the business's firm (the join `versionFirmName` makes), so a solo
      // business freezes none; the engagement's scope and period likewise (an
      // empty scope as null).
      // The firm it was locked for is kept, so that firm alone reads it among
      // firms (a business its owner shares can work with another firm later).
      await tx`
      insert into report_versions
        (id, user_id, business_id, version_no, revision, profile, scope_note, prepared_by,
         scoring_version, layout_version, report_model,
         firm_name, firm_letterhead, firm_logo_data_url,
         engagement_scope, engagement_period_start, engagement_period_end, firm_user_id)
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
        e.period_end,
        b.firm_user_id
      from businesses b
      left join firms f on f.user_id = b.firm_user_id
      left join engagement_marks e on e.user_id = b.user_id and e.business_id = b.id
      where b.user_id = ${input.ownerUserId} and b.id = ${input.businessId}
    `;
      return loadReportVersion(tx, input.ownerUserId, input.id);
    });
  } catch (error) {
    if (error instanceof RequestError && error.status === 404) {
      throw new ReportVersionError(404, "That client is not on this account");
    }
    throw error;
  }
  if (!row) throw new Error("Unable to lock the report");
  return row.version;
}

/**
 * Which versions a member of the business's firm reads: the ones locked for
 * that firm, and those locked before Precog kept the firm (migration 0046)
 * on a business its owner never shared, which only its firm can have
 * locked. The business's own account reads every version. A SQL fragment
 * over `report_versions v` and `businesses b`, for `sql.query` text (never
 * a tagged template, which would send it as a bound value); the digest's
 * count of versions awaiting review reads the same rule.
 */
export const FIRM_READS_VERSION = `(v.firm_user_id = b.firm_user_id
  or (v.firm_user_id is null and b.granted_at is null))`;

/**
 * The most versions `listReportVersions` returns, newest first. The
 * engagement archive, which reads that list, says it may leave older ones
 * out when it receives this many.
 */
export const REPORT_LIST_LIMIT = 50;

/**
 * The newest REPORT_LIST_LIMIT versions of one business, newest first.
 * `viewerUserId` (the caller) other than the business's own account reads
 * only its firm's versions (FIRM_READS_VERSION); omitted, every version.
 */
export async function listReportVersions(
  sql: Sql,
  ownerUserId: string,
  businessId: string,
  viewerUserId: string = ownerUserId,
): Promise<ReportVersionRow[]> {
  const rows = await sql.query<RawVersion>(
    `select ${VERSION_COLUMNS} from report_versions v ${VERSION_JOINS}
     join businesses b on b.user_id = v.user_id and b.id = v.business_id
     where v.user_id = $1 and v.business_id = $2
       and ($3 = v.user_id or ${FIRM_READS_VERSION})
     order by v.version_no desc limit ${REPORT_LIST_LIMIT}`,
    [ownerUserId, businessId, viewerUserId],
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
 * owner, or a member of the firm that owns the business row when the version
 * is that firm's (FIRM_READS_VERSION). Null otherwise, including for a
 * caller whose own business merely shares the id.
 */
export async function reportVersionFor(
  sql: Sql,
  userId: string,
  id: string,
): Promise<{ ownerUserId: string; businessId: string } | null> {
  const rows = await sql.query<{ user_id: string; business_id: string }>(
    `select v.user_id, v.business_id
    from report_versions v
    join businesses b on b.user_id = v.user_id and b.id = v.business_id
    where v.id = $1
      and b.deleted_at is null
      and (
        v.user_id = $2
        or (
          b.firm_user_id is not null
          and b.firm_user_id in (
            select firm_user_id from firm_members where member_user_id = $2
          )
          and ${FIRM_READS_VERSION}
        )
      )`,
    [id, userId],
  );
  return rows[0] ? { ownerUserId: rows[0].user_id, businessId: rows[0].business_id } : null;
}

/**
 * The refusal when a guarded write matched no row because someone acted
 * between the read and the write: the version is read again and refused as
 * the read would have refused it then, `reviewed` for a version reviewed
 * meanwhile and VERSION_RETURNED for one returned meanwhile.
 */
async function refusalAfterRace(
  sql: Sql,
  ownerUserId: string,
  id: string,
  reviewed: string,
): Promise<ReportVersionError> {
  const now = await loadReportVersion(sql, ownerUserId, id);
  if (!now) return new ReportVersionError(404, "That report version does not exist");
  return new ReportVersionError(
    409,
    now.version.returnedAt && !now.version.reviewedAt ? VERSION_RETURNED : reviewed,
  );
}

/** The sign-off's own refusal of a version already reviewed for issuance. */
const SOMEONE_REVIEWED = "Someone has already reviewed this version for issuance";

/**
 * Reviews a version for issuance. Someone other than the preparer reviews
 * it; the preparer issues it alone (`issueWithoutIndependentReview`) only
 * when issueAloneFor allows it, and the note then starts with
 * NOT_INDEPENDENT. When the client's engagement names a reviewer who may
 * review this version (assignedReviewerFor) and someone else reviews it,
 * that person gives `overrideNote` (OVERRIDE_NOTE_MIN to RETURN_NOTE_MAX
 * characters after trimming), stored as `reviewOverrideNote`; otherwise the
 * override note is ignored and stored as null.
 */
export async function signOffReportVersion(
  sql: Sql,
  input: {
    ownerUserId: string;
    id: string;
    reviewedBy: string;
    note: string;
    /** The preparer is issuing the file alone. Refused unless issueAloneFor allows it. */
    issueWithoutIndependentReview?: boolean;
    /** Why the signer reviews in the assigned reviewer's place. */
    overrideNote?: string;
  },
): Promise<ReportVersionRow> {
  const current = await loadReportVersion(sql, input.ownerUserId, input.id);
  if (!current) throw new ReportVersionError(404, "That report version does not exist");
  if (current.version.reviewedAt) throw new ReportVersionError(409, SOMEONE_REVIEWED);
  if (current.version.returnedAt) throw new ReportVersionError(409, VERSION_RETURNED);
  const businessId = current.version.businessId;
  const self = current.version.preparedBy === input.reviewedBy;
  if (self) {
    if (!input.issueWithoutIndependentReview) {
      throw new ReportVersionError(409, "The preparer cannot review their own report for issuance");
    }
    const alone = await issueAloneFor(sql, {
      ownerUserId: input.ownerUserId,
      businessId,
      preparedBy: input.reviewedBy,
    });
    if (!alone.canIssueAlone) throw new ReportVersionError(409, alone.reason);
  }
  const assigned = await assignedReviewerFor(sql, {
    ownerUserId: input.ownerUserId,
    businessId,
    preparedBy: current.version.preparedBy,
  });
  let overrideNote: string | null = null;
  if (assigned !== null && assigned !== input.reviewedBy) {
    overrideNote = (input.overrideNote ?? "").trim();
    if (overrideNote.length < OVERRIDE_NOTE_MIN) {
      throw new ReportVersionError(400, OVERRIDE_NOTE_REQUIRED);
    }
    if (overrideNote.length > RETURN_NOTE_MAX) {
      throw new ReportVersionError(400, RETURN_NOTE_TOO_LONG);
    }
  }
  const note = self
    ? `${NOT_INDEPENDENT}. ${input.note}`.trim().slice(0, RETURN_NOTE_MAX)
    : input.note;
  const rows = await sql`
    update report_versions
    set reviewed_by = ${input.reviewedBy}, reviewed_at = now(), review_note = ${note},
      review_override_note = ${overrideNote}
    where user_id = ${input.ownerUserId} and id = ${input.id}
      and reviewed_at is null and returned_at is null
    returning id
  `;
  // Another reviewer acted between the read and the write. Throwing here
  // keeps signOffReport from logging a review that was never stored.
  if (!rows.length) {
    throw await refusalAfterRace(sql, input.ownerUserId, input.id, SOMEONE_REVIEWED);
  }
  const updated = await loadReportVersion(sql, input.ownerUserId, input.id);
  if (!updated) throw new Error("Unable to record the review");
  return updated.version;
}

/** Whether a preparer may issue a version alone, and the words that say why. */
export interface IssueAloneStatus {
  canIssueAlone: boolean;
  /** ISSUE_ALONE_ALLOWED, or ISSUE_ALONE_REFUSED. */
  reason: string;
}

/**
 * Whether `preparedBy` may issue a version of this business alone, marked
 * NOT_INDEPENDENT: yes for a business with no firm, and for a firm client
 * when no other member of its firm holds the owner or reviewer role (for
 * example a firm owner whose only colleague is a preparer). The version's
 * own state (reviewed, returned, prepared by someone else) is the caller's
 * to check; signOffReportVersion checks both.
 */
export async function issueAloneFor(
  sql: Sql,
  input: { ownerUserId: string; businessId: string; preparedBy: string },
): Promise<IssueAloneStatus> {
  const firmUserId = await businessFirm(sql, input.ownerUserId, input.businessId);
  const others = firmUserId ? await eligibleReviewers(sql, firmUserId, input.preparedBy) : [];
  return others.length === 0
    ? { canIssueAlone: true, reason: ISSUE_ALONE_ALLOWED }
    : { canIssueAlone: false, reason: ISSUE_ALONE_REFUSED };
}

/**
 * The engagement's assigned reviewer when that person may review a version
 * `preparedBy` prepared: still a member of the business's firm, holding the
 * owner or reviewer role, and not the preparer. Null otherwise, and for a
 * business with no firm. A review by anyone else needs an override note.
 */
export async function assignedReviewerFor(
  sql: Sql,
  input: { ownerUserId: string; businessId: string; preparedBy: string | null },
): Promise<string | null> {
  const firmUserId = await businessFirm(sql, input.ownerUserId, input.businessId);
  if (!firmUserId) return null;
  const engagement = await loadEngagement(sql, input.ownerUserId, input.businessId);
  const assigned = engagement?.reviewerUserId ?? null;
  if (!assigned) return null;
  const eligible = await eligibleReviewers(sql, firmUserId, input.preparedBy);
  return eligible.includes(assigned) ? assigned : null;
}

/** The firm of a business, or null for a solo business. */
async function businessFirm(
  sql: Sql,
  ownerUserId: string,
  businessId: string,
): Promise<string | null> {
  const firms = await sql<{ firm_user_id: string | null }>`
    select firm_user_id from businesses
    where user_id = ${ownerUserId} and id = ${businessId}
  `;
  return firms[0]?.firm_user_id ?? null;
}

/**
 * Withdraws the review for issuance of a version not yet sent: clears who
 * reviewed it, when, and both notes, so the version reads as locked and
 * unreviewed again and can be reviewed (or returned) anew. On a version
 * that is its firm's work (FIRM_READS_VERSION), the firm owner may
 * withdraw, and so may the person who reviewed it while they still hold
 * the owner or reviewer role there; someone who issued it alone (its
 * preparer) may while they are still a member, whatever their role. Any
 * other signer is refused (403, WITHDRAW_ROLE_REFUSED), for example a
 * reviewer since made a preparer or removed. On any other version (a
 * business with no firm, or a version its owner locked before sharing the
 * business with a firm) the person who reviewed it may. Anyone else is
 * refused (403, WITHDRAW_REFUSED). A sent version is refused (409,
 * WITHDRAW_AFTER_SENT), and an unreviewed one (409, NOTHING_TO_WITHDRAW).
 * A firm member is refused on an ended engagement (assertEngagementOpen).
 * The business row is share-locked first, then the version row, the order
 * the lock and the ownership transfer take, so a transfer or a send at the
 * same moment runs wholly before or after the check and the write (the
 * engagement row is read, never locked: a send locks the version, then
 * the engagement). Returns the version as it now reads and who had reviewed
 * it, for the activity log.
 */
export async function withdrawReportVersionReview(
  sql: Sql,
  input: { ownerUserId: string; id: string; withdrawnBy: string },
): Promise<{ version: ReportVersionRow; withdrawnReviewer: string | null }> {
  return inTransaction(sql, async (tx) => {
    const found = await tx<{ business_id: string }>`
      select business_id from report_versions
      where user_id = ${input.ownerUserId} and id = ${input.id}
    `;
    if (!found[0]) throw new ReportVersionError(404, "That report version does not exist");
    const businessId = found[0].business_id;
    const business = await tx<{ firm_user_id: string | null }>`
      select firm_user_id from businesses
      where user_id = ${input.ownerUserId} and id = ${businessId} and deleted_at is null
      for share
    `;
    if (!business[0]) throw new ReportVersionError(404, "That report version does not exist");
    await assertEngagementOpen(tx, input.ownerUserId, businessId, input.withdrawnBy);
    const rows = await tx.query<{
      reviewed_by: string | null;
      prepared_by: string | null;
      reviewed_at: string | null;
      sent_at: string | null;
      firm_version: boolean;
    }>(
      `select v.reviewed_by, v.prepared_by, v.reviewed_at, v.sent_at,
         (b.firm_user_id is not null and ${FIRM_READS_VERSION}) as firm_version
       from report_versions v
       join businesses b on b.user_id = v.user_id and b.id = v.business_id
       where v.user_id = $1 and v.id = $2
       for update of v`,
      [input.ownerUserId, input.id],
    );
    const row = rows[0];
    if (!row) throw new ReportVersionError(404, "That report version does not exist");
    // The firm whose work the version is; null when it is the account's own.
    const firmUserId = row.firm_version ? business[0].firm_user_id : null;
    const roles = firmUserId
      ? await tx<{ role: string }>`
          select role from firm_members
          where firm_user_id = ${firmUserId} and member_user_id = ${input.withdrawnBy}
        `
      : [];
    const role = roles[0]?.role ?? null;
    const firmOwner = firmUserId === input.withdrawnBy && role === "owner";
    if (!firmOwner && row.reviewed_by !== input.withdrawnBy) {
      throw new ReportVersionError(403, WITHDRAW_REFUSED);
    }
    const issuedAlone = row.prepared_by === row.reviewed_by;
    const mayWithdraw =
      firmUserId === null ||
      role === "owner" ||
      role === "reviewer" ||
      (issuedAlone && role !== null);
    if (!firmOwner && !mayWithdraw) throw new ReportVersionError(403, WITHDRAW_ROLE_REFUSED);
    if (row.sent_at) throw new ReportVersionError(409, WITHDRAW_AFTER_SENT);
    if (!row.reviewed_at) throw new ReportVersionError(409, NOTHING_TO_WITHDRAW);
    await tx`
      update report_versions
      set reviewed_by = null, reviewed_at = null, review_note = '', review_override_note = null
      where user_id = ${input.ownerUserId} and id = ${input.id}
    `;
    const updated = await loadReportVersion(tx, input.ownerUserId, input.id);
    if (!updated) throw new Error("Unable to withdraw the review");
    return { version: updated.version, withdrawnReviewer: row.reviewed_by };
  });
}

/**
 * Stamps a version as sent, and the client's engagement with the first sent
 * report, so the client list and the pilot figures read the same fact.
 * Refused until the version is reviewed for issuance: delivery metrics never
 * include unreviewed work. The sole-issuer path stays open through the
 * review, which a one-partner firm records before sending.
 */
export async function markReportVersionSent(
  sql: Sql,
  ownerUserId: string,
  id: string,
): Promise<void> {
  const current = await loadReportVersion(sql, ownerUserId, id);
  if (!current) throw new ReportVersionError(404, "That report version does not exist");
  if (!current.version.reviewedAt) {
    throw new ReportVersionError(409, REVIEW_BEFORE_SENT);
  }
  // The update repeats the review check, so a review withdrawn between the
  // read and the write leaves the version unsent.
  const sent = await sql<{ n: number | string }>`
    with sent as (
      update report_versions set sent_at = coalesce(sent_at, now())
      where user_id = ${ownerUserId} and id = ${id} and reviewed_at is not null
      returning user_id, business_id, sent_at
    ), marked as (
      insert into engagement_marks (user_id, business_id, report_sent_at)
      select user_id, business_id, sent_at from sent
      on conflict (user_id, business_id) do update set
        report_sent_at = coalesce(engagement_marks.report_sent_at, excluded.report_sent_at)
    )
    select count(*) as n from sent
  `;
  if (Number(sent[0]?.n ?? 0) === 0) throw new ReportVersionError(409, REVIEW_BEFORE_SENT);
}

/**
 * The members of a firm who may review a version for issuance: the owner and
 * the reviewers, never the version's preparer. The owner comes first.
 */
export async function eligibleReviewers(
  sql: Sql,
  firmUserId: string,
  preparedBy: string | null,
): Promise<string[]> {
  const rows = await sql<{ member_user_id: string }>`
    select member_user_id from firm_members
    where firm_user_id = ${firmUserId}
      and role in ('owner', 'reviewer')
      and member_user_id is distinct from ${preparedBy}::text
    order by (member_user_id = ${firmUserId}) desc, member_user_id
  `;
  return rows.map((r) => r.member_user_id);
}

/** The version and the firm of its business, or a 404. */
async function versionAndFirm(
  sql: Sql,
  ownerUserId: string,
  id: string,
): Promise<{ version: ReportVersionRow; firmUserId: string | null }> {
  const current = await loadReportVersion(sql, ownerUserId, id);
  if (!current) throw new ReportVersionError(404, "That report version does not exist");
  return {
    version: current.version,
    firmUserId: await businessFirm(sql, ownerUserId, current.version.businessId),
  };
}

/**
 * The preparer, or the firm owner, asks for review of a version. The request
 * goes to the engagement's reviewer when that person may review it now, else
 * to the firm owner when the owner may, else to every eligible reviewer of
 * the firm (stored as null). Refused when nobody else at the firm can review
 * it, and on a version already reviewed or returned. Asking again re-stamps.
 */
export async function requestReportVersionReview(
  sql: Sql,
  input: { ownerUserId: string; id: string; requestedBy: string },
): Promise<ReportVersionRow> {
  const { version, firmUserId } = await versionAndFirm(sql, input.ownerUserId, input.id);
  if (version.preparedBy !== input.requestedBy && firmUserId !== input.requestedBy) {
    throw new ReportVersionError(403, REVIEW_REQUEST_REFUSED);
  }
  if (version.reviewedAt) throw new ReportVersionError(409, ALREADY_REVIEWED);
  if (version.returnedAt) throw new ReportVersionError(409, VERSION_RETURNED);
  const eligible = firmUserId ? await eligibleReviewers(sql, firmUserId, version.preparedBy) : [];
  if (!firmUserId || eligible.length === 0) {
    throw new ReportVersionError(409, NO_ELIGIBLE_REVIEWER);
  }
  const engagement = await loadEngagement(sql, input.ownerUserId, version.businessId);
  const assigned = engagement?.reviewerUserId ?? null;
  const from =
    assigned && eligible.includes(assigned)
      ? assigned
      : eligible.includes(firmUserId)
        ? firmUserId
        : null;
  const rows = await sql`
    update report_versions
    set review_requested_at = now(), review_requested_by = ${input.requestedBy},
      review_requested_from = ${from}
    where user_id = ${input.ownerUserId} and id = ${input.id}
      and reviewed_at is null and returned_at is null
    returning id
  `;
  // A reviewer acted between the read and the write.
  if (!rows.length) {
    throw await refusalAfterRace(sql, input.ownerUserId, input.id, ALREADY_REVIEWED);
  }
  const updated = await loadReportVersion(sql, input.ownerUserId, input.id);
  if (!updated) throw new Error("Unable to record the request");
  return updated.version;
}

/**
 * A reviewer returns a version to its preparer with a note saying what to
 * change. The version stays as it was locked and can no longer be reviewed;
 * the preparer locks a new one. Refused for the preparer, and on a version
 * already reviewed or returned.
 */
export async function returnReportVersion(
  sql: Sql,
  input: { ownerUserId: string; id: string; returnedBy: string; note: string },
): Promise<ReportVersionRow> {
  const note = input.note.trim();
  if (!note) throw new ReportVersionError(400, RETURN_NOTE_REQUIRED);
  if (note.length > RETURN_NOTE_MAX) throw new ReportVersionError(400, RETURN_NOTE_TOO_LONG);
  const current = await loadReportVersion(sql, input.ownerUserId, input.id);
  if (!current) throw new ReportVersionError(404, "That report version does not exist");
  if (current.version.preparedBy === input.returnedBy) {
    throw new ReportVersionError(409, PREPARER_CANNOT_RETURN);
  }
  if (current.version.reviewedAt) throw new ReportVersionError(409, ALREADY_REVIEWED);
  if (current.version.returnedAt) throw new ReportVersionError(409, VERSION_RETURNED);
  const rows = await sql`
    update report_versions
    set returned_at = now(), returned_by = ${input.returnedBy}, return_note = ${note}
    where user_id = ${input.ownerUserId} and id = ${input.id}
      and reviewed_at is null and returned_at is null
    returning id
  `;
  // Another reviewer acted between the read and the write.
  if (!rows.length) {
    throw await refusalAfterRace(sql, input.ownerUserId, input.id, ALREADY_REVIEWED);
  }
  const updated = await loadReportVersion(sql, input.ownerUserId, input.id);
  if (!updated) throw new Error("Unable to record the return");
  return updated.version;
}

/**
 * The firm's name for the "Prepared for … by …" line of a version that froze
 * none (locked before migration 0041): the name of the business's firm
 * today, only when that firm reads the version (FIRM_READS_VERSION). Null for
 * a solo business, even when its owner holds a `firms` row of their own (the
 * join is on `firm_user_id` alone), and for a version the owner locked alone
 * before sharing the business with a firm, which that firm never prepared.
 */
export async function versionFirmName(
  sql: Sql,
  ownerUserId: string,
  versionId: string,
): Promise<string | null> {
  const rows = await sql.query<{ name: string }>(
    `select f.name from report_versions v
     join businesses b on b.user_id = v.user_id and b.id = v.business_id
     join firms f on f.user_id = b.firm_user_id
     where v.user_id = $1 and v.id = $2 and ${FIRM_READS_VERSION}`,
    [ownerUserId, versionId],
  );
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
    ? v.returnedAt
      ? ` · Returned by ${v.returnedByName ?? "a reviewer"} on ${formatDay(v.returnedAt)}`
      : v.reviewRequestedAt
        ? ` · Review requested from ${
            v.reviewRequestedFrom === null
              ? "the firm's reviewers"
              : (v.reviewRequestedFromName ?? "a reviewer")
          } on ${formatDay(v.reviewRequestedAt)}`
        : " · Not yet reviewed"
    : v.reviewedBy && v.preparedBy === v.reviewedBy
      ? ` · Issued by ${v.reviewedByName ?? "the preparer"} on ${formatDay(v.reviewedAt)}. ${NOT_INDEPENDENT}`
      : ` · Reviewed for issuance by ${v.reviewedByName ?? "a reviewer"} on ${formatDay(v.reviewedAt)}`;
  return `Version ${v.versionNo} · ${prepared}${reviewed}`;
}

/**
 * The version as a report link hands it to whoever holds the link: without
 * the firm's own request-and-return routing (who a review was asked of, by
 * account id and name, and any return and its note) and without the note
 * saying why someone reviewed in the assigned reviewer's place. A link opens
 * only a version reviewed for issuance, whose printed line names the
 * preparer and the reviewer alone, so the link carries nothing more. For the
 * share loader (`share/share-store.ts` `loadSharedReport`).
 */
export function withoutReviewRouting(v: ReportVersionRow): ReportVersionRow {
  return {
    ...v,
    reviewOverrideNote: null,
    reviewRequestedAt: null,
    reviewRequestedFrom: null,
    reviewRequestedFromName: null,
    returnedAt: null,
    returnedBy: null,
    returnedByName: null,
    returnNote: "",
  };
}
