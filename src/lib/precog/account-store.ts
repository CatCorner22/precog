import type { ControlExecution } from "./controls/executions/model";
import type { Sql } from "@/lib/db";
import { RequestError } from "@/lib/request-errors";
import { inTransaction } from "@/lib/sql-transaction";
import { ACTIVE_SUBSCRIPTION_STATUSES } from "./firm/billing-store";
import { toIsoTimestamp, toIsoTimestampOrNull } from "./iso-time";
import { SUPPORT_EMAIL } from "./legal/operator";
import { userScope } from "./llm/daily-usage";
import { usageTotalsFor } from "./llm/usage-log.server";
import { count } from "./text";
import { pictureUrl } from "./procedures/image-pipeline";
import { handBackGranted } from "./firm/grant-store";
import { insertAudits, withAuditBypass, type FirmActivityRow } from "./firm/audit.server";
import {
  assembleAccountExport,
  inlineReportLogos,
  PAGED_EXPORT_SECTIONS,
  type AccountExport,
  type AccountExportFile,
  type AccountExportPart,
  type ExportPage,
  type ExportPartRequest,
  type FirmExportPart,
  type PagedExportSection,
} from "./account-export";

/** What account deletion removed that still has to be undone outside the database. */
interface DeletedAccount {
  /** Encrypted QuickBooks refresh tokens to revoke at Intuit. */
  quickBooksRefreshTokens: string[];
  /** The Stripe customer to delete at Stripe, when the account had one. */
  stripeCustomerId: string | null;
}

/**
 * The whole export in one read, from one consistent snapshot, with each
 * version's logo in place: what the paged download (exportAccountPage)
 * assembles to once its logos are written back (inlineReportLogos). Too
 * large for one response once a firm has real volume, so no server function
 * sends it. `firmUserId` is the firm the caller owns (null otherwise): its
 * members' client businesses come along as summaries, and its activity log.
 */
export async function exportAccountRows(
  sql: Sql,
  userId: string,
  firmUserId: string | null = null,
): Promise<AccountExport> {
  return inTransaction(sql, async (tx) => {
    await tx`set transaction isolation level repeatable read`;
    const [account, firm, ...sections] = await Promise.all([
      readAccountPart(tx, userId),
      readFirmPart(tx, userId, firmUserId),
      ...PAGED_EXPORT_SECTIONS.map(async (section) => {
        const scope = scopeOf(section, userId, firmUserId);
        const rows = scope === null ? [] : await readPagedRows(tx, section, scope, null);
        return { section, rows } as ExportPage;
      }),
    ]);
    return inlineReportLogos(
      assembleAccountExport([
        { section: "account", data: account },
        { section: "firm", data: firm },
        ...sections,
      ]),
    );
  });
}

/**
 * One part of the account export, for the download that joins them in the
 * browser. The first part (`account`) holds the account's small sections
 * and lists every other part: the firm part, then each paged section's rows
 * in pages that hold up to `budgetBytes` of JSON each (a row larger than
 * that gets a page of its own: a profile is at most 2 MB, a snapshot about
 * 2.5 MB), each business alone. Each part reads its own snapshot, so a
 * save landing during the download shows in the parts read after it; the
 * plan comes from the same snapshot as the first part. Only the caller's own rows, and for a
 * firm owner (`firmUserId`) the firm's: the keys in a request only choose
 * among those, so a made-up key reads nothing that is not the caller's.
 */
export async function exportAccountPage(
  sql: Sql,
  userId: string,
  firmUserId: string | null,
  request: ExportPartRequest,
  budgetBytes = HISTORY_PAGE_BYTES,
): Promise<{ page: ExportPage; parts: ExportPartRequest[] | null }> {
  if (request.section === "account") {
    return inTransaction(sql, async (tx) => {
      await tx`set transaction isolation level repeatable read`;
      const [data, planned] = await Promise.all([
        readAccountPart(tx, userId),
        Promise.all(
          PAGED_EXPORT_SECTIONS.map(async (section) => {
            const scope = scopeOf(section, userId, firmUserId);
            return scope === null ? [] : planPages(tx, section, scope, budgetBytes);
          }),
        ),
      ]);
      const parts: ExportPartRequest[] = [{ section: "firm" }, ...planned.flat()];
      return { page: { section: "account", data }, parts };
    });
  }
  if (request.section === "firm") {
    return {
      page: { section: "firm", data: await readFirmPart(sql, userId, firmUserId) },
      parts: null,
    };
  }
  const scope = scopeOf(request.section, userId, firmUserId);
  const rows =
    scope === null
      ? []
      : await readPagedRows(sql, request.section, scope, {
          first: request.first,
          last: request.last,
        });
  return { page: { section: request.section, rows } as ExportPage, parts: null };
}

/** An export part as the server function sends it: its JSON in base64 (see encodeHistoryPage). */
export function encodeExportPage(page: ExportPage): string {
  return Buffer.from(JSON.stringify(page), "utf8").toString("base64");
}

async function readAccountPart(tx: Sql, userId: string): Promise<AccountExportPart> {
  const [
    user,
    firmGrants,
    deletedBusinesses,
    firmMemberships,
    engagements,
    reminderSettings,
    billing,
    quickBooksConnections,
    activity,
    modelUsage,
  ] = await Promise.all([
    readUser(tx, userId),
    readFirmGrants(tx, userId),
    readDeletedBusinesses(tx, userId),
    readFirmMemberships(tx, userId),
    readEngagements(tx, userId),
    readReminderSettings(tx, userId),
    readBilling(tx, userId),
    readQuickBooksConnections(tx, userId),
    readActivity(tx, userId),
    usageTotalsFor(tx, userId),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    user,
    firmGrants,
    deletedBusinesses,
    firmMemberships,
    engagements,
    reminderSettings,
    billing,
    quickBooksConnections,
    activity,
    modelUsage,
  };
}

async function readFirmPart(
  tx: Sql,
  userId: string,
  firmUserId: string | null,
): Promise<FirmExportPart> {
  const [firm, firmMembers, firmInvites, firmClients] = await Promise.all([
    readFirm(tx, userId),
    readFirmMembers(tx, userId),
    readFirmInvites(tx, userId),
    readFirmClients(tx, userId, firmUserId),
  ]);
  return { firm, firmMembers, firmInvites, firmClients };
}

/**
 * A section whose rows page by size. `from` is the table and its filter,
 * with `$1` the scope's id (the account's, or the owned firm's). `key` is a
 * text unique within the section that sorts the rows, byte by byte, in the
 * export's order (`desc` reverses it); a page names its first and last key.
 * `alone` puts each row on a page of its own.
 */
interface PagedSection<T> {
  scope: "account" | "firm";
  from: string;
  key: string;
  desc: boolean;
  alone?: boolean;
  columns: string;
  map(row: Record<string, unknown>): T;
}

function paged<R, T>(section: Omit<PagedSection<T>, "map"> & { map(row: R): T }): PagedSection<T> {
  return section as PagedSection<T>;
}

/** A timestamp as a key part: fixed width, so it sorts as text in time order. */
const TS = (column: string) => `to_char(${column} at time zone 'UTC', 'YYYYMMDDHH24MISSUS')`;
/** A non-negative whole number as a key part. */
const NUM = (expression: string) => `lpad((${expression})::text, 20, '0')`;
/** Between key parts: below every printable character, so a shorter id sorts first. */
const SEP = " || chr(1) || ";

/** What a row adds to its page beyond its JSON as Postgres prints it: commas and a picture's address. */
const ROW_OVERHEAD_BYTES = 256;
/** A page's own JSON around its rows. */
const PAGE_OVERHEAD_BYTES = 64;

const PAGED: { [S in PagedExportSection]: PagedSection<AccountExportFile[S][number]> } = {
  businesses: paged({
    scope: "account",
    from: "businesses where user_id = $1",
    key: `${TS("updated_at")}${SEP}id`,
    desc: true,
    alone: true,
    columns: "id, name, industry, revision, updated_at, deleted_at, granted_at, profile",
    map: (b: {
      id: string;
      name: string;
      industry: string;
      revision: number | string;
      updated_at: string;
      deleted_at: string | null;
      granted_at: string | null;
      profile: unknown;
    }) => ({
      id: b.id,
      name: b.name,
      industry: b.industry,
      revision: Number(b.revision),
      updatedAt: toIsoTimestamp(b.updated_at),
      deletedAt: toIsoTimestampOrNull(b.deleted_at),
      grantedAt: toIsoTimestampOrNull(b.granted_at),
      profile: b.profile,
    }),
  }),
  reportVersions: paged({
    scope: "account",
    from: "report_versions where user_id = $1",
    key: `business_id${SEP}lpad((2147483647 - version_no)::text, 10, '0')`,
    desc: false,
    columns: `id, business_id, version_no, revision, scope_note, prepared_by, prepared_at,
      reviewed_by, reviewed_at, review_note, review_override_note, sent_at, firm_name,
      firm_letterhead, md5(firm_logo_data_url) as firm_logo_id, engagement_scope, engagement_period_start,
      engagement_period_end, review_requested_at, review_requested_by, review_requested_from,
      returned_at, returned_by, return_note, profile`,
    map: (r: {
      id: string;
      business_id: string;
      version_no: number | string;
      revision: number | string | null;
      scope_note: string;
      prepared_by: string | null;
      prepared_at: string;
      reviewed_by: string | null;
      reviewed_at: string | null;
      review_note: string;
      review_override_note: string | null;
      sent_at: string | null;
      firm_name: string | null;
      firm_letterhead: string | null;
      firm_logo_id: string | null;
      engagement_scope: string | null;
      engagement_period_start: string | null;
      engagement_period_end: string | null;
      review_requested_at: string | null;
      review_requested_by: string | null;
      review_requested_from: string | null;
      returned_at: string | null;
      returned_by: string | null;
      return_note: string;
      profile: unknown;
    }) => ({
      id: r.id,
      businessId: r.business_id,
      versionNo: Number(r.version_no),
      revision: r.revision === null ? null : Number(r.revision),
      scopeNote: r.scope_note,
      preparedBy: r.prepared_by,
      preparedAt: toIsoTimestamp(r.prepared_at),
      reviewedBy: r.reviewed_by,
      reviewedAt: toIsoTimestampOrNull(r.reviewed_at),
      reviewNote: r.review_note,
      reviewOverrideNote: r.review_override_note,
      sentAt: toIsoTimestampOrNull(r.sent_at),
      firm:
        r.firm_name === null
          ? null
          : { name: r.firm_name, letterhead: r.firm_letterhead ?? "", logoId: r.firm_logo_id },
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
      reviewRequestedBy: r.review_requested_by,
      reviewRequestedFrom: r.review_requested_from,
      returnedAt: toIsoTimestampOrNull(r.returned_at),
      returnedBy: r.returned_by,
      returnNote: r.return_note,
      profile: r.profile,
    }),
  }),
  // Each distinct logo the account's versions froze, once, named by its digest.
  reportLogos: paged({
    scope: "account",
    from: `(select distinct firm_logo_data_url from report_versions
      where user_id = $1 and firm_logo_data_url is not null) l`,
    key: "md5(firm_logo_data_url)",
    desc: false,
    columns: "md5(firm_logo_data_url) as id, firm_logo_data_url as data_url",
    map: (l: { id: string; data_url: string }) => ({ id: l.id, dataUrl: l.data_url }),
  }),
  snapshots: paged({
    scope: "account",
    from: "assessment_snapshots where user_id = $1",
    key: `${TS("created_at")}${SEP}id`,
    desc: true,
    columns: `id, title, practice_name, created_at, profile_json, power_map_json,
      value_case_json, value_evidence_json`,
    map: (s: {
      id: string;
      title: string;
      practice_name: string;
      created_at: string;
      profile_json: unknown;
      power_map_json: unknown;
      value_case_json: unknown;
      value_evidence_json: unknown;
    }) => ({
      id: s.id,
      title: s.title,
      practiceName: s.practice_name,
      createdAt: toIsoTimestamp(s.created_at),
      profile: s.profile_json,
      powerMap: s.power_map_json,
      valueCase: s.value_case_json,
      valueEvidence: s.value_evidence_json,
    }),
  }),
  shares: paged({
    scope: "account",
    from: "map_shares where user_id = $1",
    key: `${TS("created_at")}${SEP}token`,
    desc: true,
    columns: "token, business_name, created_at, expires_at, revoked_at, redacted, payload",
    map: (s: {
      token: string;
      business_name: string;
      created_at: string;
      expires_at: string | null;
      revoked_at: string | null;
      redacted: boolean;
      payload: unknown;
    }) => ({
      token: s.token,
      businessName: s.business_name,
      createdAt: toIsoTimestamp(s.created_at),
      expiresAt: toIsoTimestampOrNull(s.expires_at),
      revokedAt: toIsoTimestampOrNull(s.revoked_at),
      redacted: Boolean(s.redacted),
      payload: s.payload,
    }),
  }),
  controlExecutions: paged({
    scope: "account",
    from: "control_execution_log where user_id = $1",
    key: `${TS("created_at")}${SEP}id${SEP}business_id`,
    desc: false,
    columns: "business_id, record",
    map: (c: { business_id: string; record: ControlExecution }) => ({
      businessId: c.business_id,
      record: c.record,
    }),
  }),
  quickBooksSnapshots: paged({
    scope: "account",
    from: "integration_snapshots where user_id = $1 and provider = 'qbo'",
    // Newest first within each business: the time counted down from a far one.
    key: `business_id${SEP}${NUM("99999999999999999 - (extract(epoch from taken_at) * 1000000)::bigint")}${SEP}${NUM("id")}`,
    desc: false,
    columns: "business_id, taken_at, vendors, employees",
    map: (s: { business_id: string; taken_at: string; vendors: unknown; employees: unknown }) => ({
      businessId: s.business_id,
      takenAt: toIsoTimestamp(s.taken_at),
      vendors: s.vendors,
      employees: s.employees,
    }),
  }),
  procedureImages: paged({
    scope: "account",
    from: "procedure_images where user_id = $1",
    key: `business_id${SEP}${TS("created_at")}${SEP}id`,
    desc: false,
    columns: `id, business_id, content_type, byte_size, width, height, sha256, uploaded_by,
      created_at, unreferenced_since`,
    map: (i: {
      id: string;
      business_id: string;
      content_type: string;
      byte_size: number | string;
      width: number;
      height: number;
      sha256: string;
      uploaded_by: string | null;
      created_at: string;
      unreferenced_since: string | null;
    }) => ({
      id: i.id,
      businessId: i.business_id,
      contentType: i.content_type,
      byteSize: Number(i.byte_size),
      width: Number(i.width),
      height: Number(i.height),
      sha256: i.sha256,
      uploadedBy: i.uploaded_by ?? null,
      createdAt: toIsoTimestamp(i.created_at),
      unreferencedSince: toIsoTimestampOrNull(i.unreferenced_since),
      path: pictureUrl(i.business_id, i.id),
    }),
  }),
  reviews: paged({
    scope: "account",
    from: "review_events where user_id = $1",
    key: `${TS("recorded_at")}${SEP}${NUM("id")}`,
    desc: true,
    columns: `business_id, period, item_key, owner_name, due_on, result, notes, recorded_at,
      recorded_by`,
    map: (r: {
      business_id: string;
      period: string;
      item_key: string;
      owner_name: string;
      due_on: string | null;
      result: string;
      notes: string;
      recorded_at: string;
      recorded_by: string | null;
    }) => ({
      businessId: r.business_id,
      period: r.period,
      itemKey: r.item_key,
      ownerName: r.owner_name,
      dueOn: r.due_on ?? null,
      result: r.result,
      notes: r.notes,
      recordedAt: toIsoTimestamp(r.recorded_at),
      recordedBy: r.recorded_by ?? null,
    }),
  }),
  remindersSent: paged({
    scope: "account",
    from: "reminder_log where user_id = $1",
    key: `${TS("sent_at")}${SEP}${NUM("id")}`,
    desc: true,
    columns: "business_id, item_key, due_on::text as due_on, recipient, sent_at",
    map: (r: {
      business_id: string;
      item_key: string;
      due_on: string | null;
      recipient: string;
      sent_at: string;
    }) => ({
      businessId: r.business_id,
      itemKey: r.item_key,
      dueOn: r.due_on,
      recipient: r.recipient,
      sentAt: toIsoTimestamp(r.sent_at),
    }),
  }),
  // The firm owner's copy of the firm's activity log (migration 0048), newest first.
  firmActivity: paged({
    scope: "firm",
    from: "firm_audit_log where firm_user_id = $1",
    key: `${TS("occurred_at")}${SEP}${NUM("id")}`,
    desc: true,
    columns: "actor_name, event, business_id, subject_user_id, detail, occurred_at",
    map: (r: {
      actor_name: string;
      event: string;
      business_id: string | null;
      subject_user_id: string | null;
      detail: unknown;
      occurred_at: string;
    }): FirmActivityRow => ({
      actorName: r.actor_name,
      event: r.event,
      businessId: r.business_id,
      subjectUserId: r.subject_user_id,
      detail: r.detail,
      occurredAt: toIsoTimestamp(r.occurred_at),
    }),
  }),
};

/** Whose rows a section reads: the account's, or the firm's it owns; null for none. */
function scopeOf(
  section: PagedExportSection,
  userId: string,
  firmUserId: string | null,
): string | null {
  return PAGED[section].scope === "firm" ? firmUserId : userId;
}

/** The section's rows with their keys, as one query; the caller adds the order and range. */
function sectionQuery(section: PagedExportSection): string {
  const s = PAGED[section];
  return `select ${s.key} as k, ${s.columns} from ${s.from}`;
}

/** Ascending or descending by key, compared byte by byte so Postgres and the plan agree. */
function keyOrder(section: PagedExportSection): string {
  return `order by x.k collate "C" ${PAGED[section].desc ? "desc" : "asc"}`;
}

/**
 * The section's pages: each one's first and last key, holding rows until
 * their JSON as Postgres prints it (larger than the file's, never smaller)
 * would pass `budgetBytes`, and always at least one row.
 */
async function planPages(
  tx: Sql,
  section: PagedExportSection,
  scope: string,
  budgetBytes: number,
): Promise<ExportPartRequest[]> {
  const rows = await tx.query<{ k: string; n: number | string }>(
    `select x.k, octet_length(row_to_json(x)::text) as n from (${sectionQuery(section)}) x
     ${keyOrder(section)}`,
    [scope],
  );
  const parts: Array<{ section: PagedExportSection; first: string; last: string }> = [];
  let used = 0;
  for (const row of rows) {
    const bytes = Number(row.n) + ROW_OVERHEAD_BYTES;
    const page = parts.at(-1);
    if (page && !PAGED[section].alone && used + bytes <= budgetBytes) {
      page.last = row.k;
      used += bytes;
    } else {
      parts.push({ section, first: row.k, last: row.k });
      used = PAGE_OVERHEAD_BYTES + bytes;
    }
  }
  return parts;
}

/** The section's rows from `range.first` to `range.last`, both included; every row without one. */
async function readPagedRows<S extends PagedExportSection>(
  tx: Sql,
  section: S,
  scope: string,
  range: { first: string; last: string } | null,
): Promise<AccountExportFile[S]> {
  const s = PAGED[section];
  const bounds = !range ? [] : s.desc ? [range.last, range.first] : [range.first, range.last];
  const rows = await tx.query<Record<string, unknown>>(
    range
      ? `select * from (${sectionQuery(section)}) x
         where x.k collate "C" >= $2 and x.k collate "C" <= $3 ${keyOrder(section)}`
      : `select * from (${sectionQuery(section)}) x ${keyOrder(section)}`,
    [scope, ...bounds],
  );
  return rows.map((row) => s.map(row)) as AccountExportFile[S];
}

/** One earlier saved version of a business, as the history download writes it. */
export interface BusinessHistoryExportRow {
  businessId: string;
  revision: number;
  name: string;
  industry: string;
  savedBy: string | null;
  savedAt: string;
  profile: unknown;
}

/**
 * The account's businesses that have past versions, deleted ones included,
 * by name; for a firm owner (`firmUserId` set) the firm's client businesses
 * its members set up as well, each with the account that holds the row.
 */
export async function listAccountHistoryBusinesses(
  sql: Sql,
  userId: string,
  firmUserId: string | null = null,
): Promise<Array<{ businessId: string; name: string; versions: number; ownerUserId: string }>> {
  const rows = await sql<{
    business_id: string;
    user_id: string;
    name: string;
    versions: number | string;
  }>`
    select h.business_id, h.user_id, coalesce(max(b.name), max(h.name)) as name, count(*) as versions
    from business_history h
    left join businesses b on b.user_id = h.user_id and b.id = h.business_id
    where h.user_id = ${userId}
      or (${firmUserId}::text is not null and b.firm_user_id = ${firmUserId})
    group by h.business_id, h.user_id
    order by 3, 1, (h.user_id = ${userId}) desc
  `;
  return rows.map((r) => ({
    businessId: r.business_id,
    name: r.name,
    versions: Number(r.versions),
    ownerUserId: r.user_id,
  }));
}

/**
 * Whose row a history download reads for `businessId`. With `ownerUserId`
 * named (the list row the caller chose): the caller's own rows when it is
 * theirs, else that account's row only when it is that firm's client and the
 * account is a member of the firm the caller owns (`firmUserId`) or shared
 * the business with it (a granted business), so the
 * owner's and a member's rows under one id download apart. Without it: the
 * caller's own row when they hold one, else the firm's. The membership is
 * read here, never trusted from what the client sends. Null when nothing
 * resolves, and the page is then empty.
 */
async function historyOwnerFor(
  sql: Sql,
  userId: string,
  businessId: string,
  firmUserId: string | null,
  ownerUserId: string | null,
): Promise<string | null> {
  if (ownerUserId === userId) return userId;
  if (ownerUserId !== null) {
    if (firmUserId === null) return null;
    const rows = await sql<{ user_id: string }>`
      select b.user_id from businesses b
      left join firm_members m on m.firm_user_id = b.firm_user_id and m.member_user_id = b.user_id
      where b.id = ${businessId} and b.user_id = ${ownerUserId} and b.firm_user_id = ${firmUserId}
        and (m.member_user_id is not null or b.granted_at is not null)
      limit 1
    `;
    return rows[0]?.user_id ?? null;
  }
  const rows = await sql<{ user_id: string }>`
    select b.user_id from businesses b
    where b.id = ${businessId}
      and (b.user_id = ${userId}
        or (${firmUserId}::text is not null and b.firm_user_id = ${firmUserId}))
    order by (b.user_id = ${userId}) desc
    limit 1
  `;
  return rows[0]?.user_id ?? userId;
}

/**
 * What one history page may hold, measured as Postgres prints each profile.
 * The page travels base64-encoded (see encodeHistoryPage), 4/3 of this, so a
 * full page reaches the browser at about 4 MB, under Vercel's 4.5 MB response
 * limit, whatever characters the profiles hold.
 */
export const HISTORY_PAGE_BYTES = 3 * 1024 * 1024;

/**
 * One page of a business's past versions, newest first, below `beforeRevision`
 * when given. A page holds versions until their profiles reach `budgetBytes`,
 * and always at least one (a profile is at most 2 MB, under 2.7 MB encoded).
 * `nextBeforeRevision` is null on the last page. Only the caller's own rows,
 * or, for a firm owner (`firmUserId`), a row a member set up for the firm,
 * named by `ownerUserId` when the owner's and a member's rows share the id
 * (see historyOwnerFor): another account's id returns an empty page.
 *
 * The walk prints one version at a time and stops at the first one past the
 * budget, so a request measures only its own page and that one extra version,
 * which also tells it whether another page follows.
 */
export async function exportBusinessHistoryPage(
  sql: Sql,
  callerUserId: string,
  businessId: string,
  beforeRevision: number | null,
  budgetBytes = HISTORY_PAGE_BYTES,
  firmUserId: string | null = null,
  ownerUserId: string | null = null,
): Promise<{ rows: BusinessHistoryExportRow[]; nextBeforeRevision: number | null }> {
  const userId = await historyOwnerFor(sql, callerUserId, businessId, firmUserId, ownerUserId);
  if (userId === null) return { rows: [], nextBeforeRevision: null };
  const rows = await sql<{
    business_id: string;
    revision: number | string;
    name: string;
    industry: string;
    saved_by: string | null;
    saved_at: string;
    profile: unknown;
    on_page: boolean;
  }>`
    with recursive walk as (
      (
        select revision, octet_length(profile::text)::bigint as running, 1 as n
        from business_history
        where user_id = ${userId} and business_id = ${businessId}
          and (${beforeRevision}::bigint is null or revision < ${beforeRevision}::bigint)
        order by revision desc
        limit 1
      )
      union all
      select h.revision, w.running + octet_length(h.profile::text), w.n + 1
      from walk w
      cross join lateral (
        select revision, profile from business_history
        where user_id = ${userId} and business_id = ${businessId} and revision < w.revision
        order by revision desc
        limit 1
      ) h
      where w.n = 1 or w.running <= ${budgetBytes}::bigint
    ),
    sized as (
      select revision, (n = 1 or running <= ${budgetBytes}::bigint) as on_page from walk
    )
    select h.business_id, h.revision, h.name, h.industry, h.saved_by, h.saved_at,
      case when s.on_page then h.profile end as profile, s.on_page
    from business_history h join sized s on s.revision = h.revision
    where h.user_id = ${userId} and h.business_id = ${businessId}
    order by h.revision desc
  `;
  const page = rows
    .filter((h) => h.on_page)
    .map((h) => ({
      businessId: h.business_id,
      revision: Number(h.revision),
      name: h.name,
      industry: h.industry,
      savedBy: h.saved_by,
      savedAt: toIsoTimestamp(h.saved_at),
      profile: h.profile,
    }));
  const more = rows.length > page.length;
  return { rows: page, nextBeforeRevision: more ? (page.at(-1)?.revision ?? null) : null };
}

/**
 * A history page as the server function sends it: the rows' JSON in base64.
 * A JSON string inside the transport's own JSON is escaped twice, so quotes,
 * backslashes and `<` grow four to five times on the wire; base64 holds every
 * page at 4/3 of its JSON, which HISTORY_PAGE_BYTES relies on.
 */
export function encodeHistoryPage(rows: BusinessHistoryExportRow[]): string {
  return Buffer.from(JSON.stringify(rows), "utf8").toString("base64");
}

/**
 * Removes every row the account owns and then the account itself, in one
 * transaction. Refused (409) while a firm plan is still billing, so Stripe
 * never keeps charging a deleted account, and while the account holds client
 * businesses it set up for someone else's firm, removed ones included: the
 * firm owner removes the member first, which hands those clients to the firm
 * (see removeMember). The account's row is locked first, so a billing
 * webhook, a client save or a client grant running at the same moment either
 * commits before the checks or finds the account gone.
 *
 * Snapshots and the per-user model-usage counts carry no foreign key to the
 * user, so they are deleted explicitly; everything else (businesses and their
 * history, report versions and QuickBooks rows, shares, the firm, reminders,
 * billing, the activity milestones, the firm's activity log, the
 * model-call records, sessions and
 * linked accounts) cascades
 * from the user row. Client
 * businesses that members of this account's firm set up stay with those
 * members and leave the firm. The app-wide usage count is not the account's
 * and stays. Another firm the account works in, or that works on a business
 * it owns, keeps a member_left or client_handed_back row in its activity log;
 * the log has no key on the actor, so the rows outlive the account.
 */
export async function deleteAccountRows(sql: Sql, userId: string): Promise<DeletedAccount> {
  return inTransaction(sql, async (tx) => {
    // The lock order of every membership write (lockFirmMembershipWrite in
    // firm/store.ts): the account row first, then the firm row, then
    // businesses; the billing row sits between the account and the firm.
    // FOR UPDATE, so a writer that names the account waits: a
    // Stripe webhook inserting its billing row, a client save
    // (lockBusinessOwner), an invitation or a firm save. A writer that got
    // the row first commits before the checks below read, so they see its
    // rows and refuse; one that comes after finds the account gone.
    const account = await tx`select id from "user" where id = ${userId} for update`;
    if (!account.length) throw new RequestError(401, "Unauthorized");
    const stripeCustomerId = await refuseWhileBilling(tx, userId);
    // The account's own firm next: a client grant accepted, a member
    // invited or the plan changed waits, or refuses once the firm is gone.
    await tx`select user_id from firms where user_id = ${userId} for update`;
    await refuseWhileHoldingFirmClients(tx, userId);
    const connections = await tx<{ refresh_token_enc: string }>`
      select refresh_token_enc from integration_connections where user_id = ${userId}
    `;
    // Members' and owners' businesses leave the deleted firm. A business its
    // owner shared with the firm goes back to the owner as a hand-back leaves
    // it (handBackGranted), and invitations still waiting on this address close.
    const granted = await tx<{ user_id: string; id: string }>`
      select user_id, id from businesses
      where firm_user_id = ${userId} and user_id <> ${userId} and granted_at is not null
      for update
    `;
    for (const row of granted) await handBackGranted(tx, row.user_id, row.id);
    // The client businesses members set up for the firm stay theirs.
    await tx`
      update businesses set firm_user_id = null, granted_at = null
      where firm_user_id = ${userId} and user_id <> ${userId}
    `;
    await tx`
      update business_firm_grants set revoked_at = now()
      where revoked_at is null and accepted_at is null
        and lower(invited_email) = lower((select email from "user" where id = ${userId}))
    `;
    await logDeparture(tx, userId);
    await tx`delete from assessment_snapshots where user_id = ${userId}`;
    await tx`delete from llm_daily_usage where scope = ${userScope(userId)}`;
    // A firm owner's account takes its firm's activity log with it; the log
    // refuses that delete outside the bypass (migration 0048).
    await withAuditBypass(tx);
    await tx`delete from "user" where "id" = ${userId}`;
    return {
      quickBooksRefreshTokens: connections.map((c) => c.refresh_token_enc),
      stripeCustomerId,
    };
  });
}

/**
 * Records, in each other firm's activity log, what the account's deletion
 * takes from it: the account leaving a firm it is a member of, and each
 * business it owns that it had shared with a firm. Its own firm's log goes
 * with the account. Inside the deletion's transaction, so the rows and the
 * deletion commit together.
 */
async function logDeparture(tx: Sql, userId: string): Promise<void> {
  const memberships = await tx<{ firm_user_id: string }>`
    select m.firm_user_id from firm_members m join firms f on f.user_id = m.firm_user_id
    where m.member_user_id = ${userId} and m.firm_user_id <> ${userId}
    order by m.joined_at
  `;
  const shared = await tx<{ id: string; firm_user_id: string }>`
    select id, firm_user_id from businesses
    where user_id = ${userId} and firm_user_id is not null and firm_user_id <> ${userId}
      and granted_at is not null
    order by id
  `;
  await insertAudits(tx, [
    ...memberships.map((m) => ({
      firmUserId: m.firm_user_id,
      actorUserId: userId,
      event: "member_left" as const,
      subjectUserId: userId,
      detail: { reason: "account_deleted" },
    })),
    ...shared.map((b) => ({
      firmUserId: b.firm_user_id,
      actorUserId: userId,
      event: "client_handed_back" as const,
      businessId: b.id,
      detail: { by: "owner", reason: "account_deleted" },
    })),
  ]);
}

/** Refuses while the Firm plan runs; otherwise the Stripe customer id to delete, if any. */
async function refuseWhileBilling(tx: Sql, userId: string): Promise<string | null> {
  // Locked before the firm row: a webhook updating a billing row that already
  // exists holds it, then sets the firm's plan, and never needs the account.
  const rows = await tx<{ subscription_status: string | null; stripe_customer_id: string | null }>`
    select subscription_status, stripe_customer_id from billing_accounts where user_id = ${userId}
    for update
  `;
  const status = rows[0]?.subscription_status;
  if (status && ACTIVE_SUBSCRIPTION_STATUSES.has(status)) {
    throw new RequestError(
      409,
      `Your firm plan is still active. Cancel it with Manage billing on the Firm page, or make a colleague the firm's owner, then delete your account. If you cannot, write to ${SUPPORT_EMAIL}.`,
    );
  }
  return rows[0]?.stripe_customer_id ?? null;
}

/**
 * Refuses while the account holds client businesses it set up for another
 * firm. Removed ones count too: a removed client with locked report versions
 * stays for the firm's retention period (KEPT_FOR_RETENTION in
 * business-store.ts), and the account's deletion would cascade it away.
 * Removing the member moves them all to the firm owner (removeMember).
 */
async function refuseWhileHoldingFirmClients(tx: Sql, userId: string): Promise<void> {
  const rows = await tx<{ firm_name: string; n: number | string; removed: number | string }>`
    select f.name as firm_name, count(*) as n, count(b.deleted_at) as removed
    from businesses b join firms f on f.user_id = b.firm_user_id
    where b.user_id = ${userId} and b.firm_user_id <> ${userId} and b.granted_at is null
    group by f.name
    order by count(*) desc
    limit 1
  `;
  const held = rows[0];
  if (!held) return;
  const removed = Number(held.removed);
  const kept =
    removed === 0
      ? ""
      : `, including ${removed === 1 ? "a removed one" : "removed ones"} the firm keeps for its retention period`;
  throw new RequestError(
    409,
    `You set up ${count(Number(held.n), "client business", "client businesses")} for ${held.firm_name}${kept}. Ask the firm owner to remove you from the firm first (your client businesses stay with the firm), then delete your account. Need help? Write to ${SUPPORT_EMAIL}.`,
  );
}

async function readUser(tx: Sql, userId: string): Promise<AccountExport["user"]> {
  const rows = await tx<{ id: string; name: string; email: string; createdAt: string }>`
    select "id", "name", "email", "createdAt" from "user" where "id" = ${userId}
  `;
  const u = rows[0];
  return u
    ? { id: u.id, name: u.name, email: u.email, createdAt: toIsoTimestamp(u.createdAt) }
    : null;
}

async function readFirmGrants(tx: Sql, userId: string): Promise<AccountExport["firmGrants"]> {
  const rows = await tx<{
    business_id: string;
    invited_email: string;
    created_at: string;
    expires_at: string;
    accepted_at: string | null;
    revoked_at: string | null;
    firm_name: string | null;
  }>`
    select g.business_id, g.invited_email, g.created_at, g.expires_at, g.accepted_at,
      g.revoked_at, f.name as firm_name
    from business_firm_grants g
    left join firms f on f.user_id = g.firm_user_id
    where g.business_owner_id = ${userId}
    order by g.created_at desc
  `;
  return rows.map((g) => ({
    businessId: g.business_id,
    invitedEmail: g.invited_email,
    createdAt: toIsoTimestamp(g.created_at),
    expiresAt: toIsoTimestamp(g.expires_at),
    acceptedAt: toIsoTimestampOrNull(g.accepted_at),
    revokedAt: toIsoTimestampOrNull(g.revoked_at),
    firmName: g.firm_name,
  }));
}

async function readFirmClients(
  tx: Sql,
  userId: string,
  firmUserId: string | null,
): Promise<AccountExport["firmClients"]> {
  if (!firmUserId) return [];
  const rows = await tx<{
    id: string;
    name: string;
    industry: string;
    user_id: string;
    revision: number | string;
    updated_at: string;
    deleted_at: string | null;
  }>`
    select id, name, industry, user_id, revision, updated_at, deleted_at
    from businesses where firm_user_id = ${firmUserId} and user_id <> ${userId}
    order by updated_at desc
  `;
  return rows.map((b) => ({
    id: b.id,
    name: b.name,
    industry: b.industry,
    ownerUserId: b.user_id,
    revision: Number(b.revision),
    updatedAt: toIsoTimestamp(b.updated_at),
    deletedAt: toIsoTimestampOrNull(b.deleted_at),
  }));
}

async function readDeletedBusinesses(
  tx: Sql,
  userId: string,
): Promise<AccountExport["deletedBusinesses"]> {
  const rows = await tx<{ business_id: string; deleted_at: string }>`
    select business_id, deleted_at from business_deletion_markers
    where user_id = ${userId} order by deleted_at desc
  `;
  return rows.map((m) => ({ businessId: m.business_id, deletedAt: toIsoTimestamp(m.deleted_at) }));
}

async function readFirm(tx: Sql, userId: string): Promise<AccountExport["firm"]> {
  const rows = await tx<{
    name: string;
    plan: string;
    letterhead: string;
    logo_data_url: string | null;
    cover_page: boolean;
    retention_years: number | string;
    updated_at: string;
  }>`
    select name, plan, letterhead, logo_data_url, cover_page, retention_years, updated_at
    from firms where user_id = ${userId}
  `;
  const firm = rows[0];
  return firm
    ? {
        name: firm.name,
        plan: firm.plan,
        letterhead: firm.letterhead,
        logoDataUrl: firm.logo_data_url,
        coverPage: Boolean(firm.cover_page),
        retentionYears: Number(firm.retention_years),
        updatedAt: toIsoTimestamp(firm.updated_at),
      }
    : null;
}

async function readActivity(tx: Sql, userId: string): Promise<AccountExport["activity"]> {
  const rows = await tx<{ event: string; business_id: string | null; occurred_at: string }>`
    select event, business_id, occurred_at from product_events
    where user_id = ${userId} order by occurred_at
  `;
  return rows.map((r) => ({
    event: r.event,
    businessId: r.business_id,
    occurredAt: toIsoTimestamp(r.occurred_at),
  }));
}

async function readFirmMemberships(
  tx: Sql,
  userId: string,
): Promise<AccountExport["firmMemberships"]> {
  const rows = await tx<{ firm_user_id: string; role: string; joined_at: string }>`
    select firm_user_id, role, joined_at from firm_members
    where member_user_id = ${userId} order by joined_at
  `;
  return rows.map((m) => ({
    firmUserId: m.firm_user_id,
    role: m.role,
    joinedAt: toIsoTimestamp(m.joined_at),
  }));
}

async function readFirmMembers(tx: Sql, userId: string): Promise<AccountExport["firmMembers"]> {
  const rows = await tx<{ member_user_id: string; email: string; role: string; joined_at: string }>`
    select m.member_user_id, u.email, m.role, m.joined_at
    from firm_members m join "user" u on u.id = m.member_user_id
    where m.firm_user_id = ${userId} order by m.joined_at
  `;
  return rows.map((m) => ({
    userId: m.member_user_id,
    email: m.email,
    role: m.role,
    joinedAt: toIsoTimestamp(m.joined_at),
  }));
}

async function readFirmInvites(tx: Sql, userId: string): Promise<AccountExport["firmInvites"]> {
  const rows = await tx<{
    email: string;
    role: string;
    created_at: string;
    expires_at: string;
    accepted_at: string | null;
  }>`
    select email, role, created_at, expires_at, accepted_at from firm_invites
    where firm_user_id = ${userId} order by created_at desc
  `;
  return rows.map((i) => ({
    email: i.email,
    role: i.role,
    createdAt: toIsoTimestamp(i.created_at),
    expiresAt: toIsoTimestamp(i.expires_at),
    acceptedAt: toIsoTimestampOrNull(i.accepted_at),
  }));
}

async function readEngagements(tx: Sql, userId: string): Promise<AccountExport["engagements"]> {
  const rows = await tx<{
    business_id: string;
    started_at: string | null;
    map_completed_at: string | null;
    report_sent_at: string | null;
    open_findings: number | string | null;
    accepted_findings: number | string;
    owner_email: string | null;
    scope: string;
    period_start: string | null;
    period_end: string | null;
    status: string;
    ended_at: string | null;
    preparer_user_id: string | null;
    reviewer_user_id: string | null;
  }>`
    select business_id, started_at, map_completed_at, report_sent_at, open_findings,
      accepted_findings, owner_email, scope, period_start, period_end, status, ended_at,
      preparer_user_id, reviewer_user_id
    from engagement_marks where user_id = ${userId}
  `;
  return rows.map((e) => ({
    businessId: e.business_id,
    startedAt: toIsoTimestampOrNull(e.started_at),
    mapCompletedAt: toIsoTimestampOrNull(e.map_completed_at),
    reportSentAt: toIsoTimestampOrNull(e.report_sent_at),
    openFindings: e.open_findings === null ? null : Number(e.open_findings),
    acceptedFindings: Number(e.accepted_findings),
    ownerEmail: e.owner_email ?? null,
    scope: e.scope,
    periodStart: e.period_start,
    periodEnd: e.period_end,
    status: e.status,
    endedAt: toIsoTimestampOrNull(e.ended_at),
    preparerUserId: e.preparer_user_id,
    reviewerUserId: e.reviewer_user_id,
  }));
}

async function readReminderSettings(
  tx: Sql,
  userId: string,
): Promise<AccountExport["reminderSettings"]> {
  const rows = await tx<{ weekly_digest: boolean; owner_reminders: boolean }>`
    select weekly_digest, owner_reminders from notification_settings where user_id = ${userId}
  `;
  const s = rows[0];
  return s
    ? { weeklyDigest: Boolean(s.weekly_digest), ownerReminders: Boolean(s.owner_reminders) }
    : null;
}

async function readBilling(tx: Sql, userId: string): Promise<AccountExport["billing"]> {
  const rows = await tx<{
    stripe_customer_id: string | null;
    subscription_id: string | null;
    subscription_status: string | null;
    assessment_paid_at: string | null;
    assessment_payment_intent: string | null;
    assessment_refunded_at: string | null;
    assessment_disputed_at: string | null;
    current_period_end: string | null;
    subscription_price_id: string | null;
  }>`
    select stripe_customer_id, subscription_id, subscription_status, assessment_paid_at,
      assessment_payment_intent, assessment_refunded_at, assessment_disputed_at,
      current_period_end, subscription_price_id
    from billing_accounts where user_id = ${userId}
  `;
  const b = rows[0];
  return b
    ? {
        stripeCustomerId: b.stripe_customer_id,
        subscriptionId: b.subscription_id,
        subscriptionStatus: b.subscription_status,
        assessmentPaidAt: toIsoTimestampOrNull(b.assessment_paid_at),
        assessmentPaymentIntentId: b.assessment_payment_intent,
        assessmentRefundedAt: toIsoTimestampOrNull(b.assessment_refunded_at),
        assessmentDisputedAt: toIsoTimestampOrNull(b.assessment_disputed_at),
        currentPeriodEnd: toIsoTimestampOrNull(b.current_period_end),
        subscriptionPriceId: b.subscription_price_id,
      }
    : null;
}

async function readQuickBooksConnections(
  tx: Sql,
  userId: string,
): Promise<AccountExport["quickBooksConnections"]> {
  const rows = await tx<{
    business_id: string;
    realm_id: string;
    connected_at: string;
    connected_by: string | null;
    last_synced_at: string | null;
    last_error: string | null;
  }>`
    select business_id, realm_id, connected_at, connected_by, last_synced_at, last_error
    from integration_connections where user_id = ${userId} and provider = 'qbo'
    order by business_id
  `;
  return rows.map((c) => ({
    businessId: c.business_id,
    realmId: c.realm_id,
    connectedAt: toIsoTimestamp(c.connected_at),
    connectedBy: c.connected_by,
    lastSyncedAt: toIsoTimestampOrNull(c.last_synced_at),
    lastError: c.last_error,
  }));
}
