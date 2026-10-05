import type { ControlExecution } from "./controls/executions/model";
import type { Sql } from "@/lib/db";
import { RequestError } from "@/lib/request-errors";
import { inTransaction } from "@/lib/sql-transaction";
import { ACTIVE_SUBSCRIPTION_STATUSES } from "./firm/billing-store";
import { toIsoTimestamp, toIsoTimestampOrNull } from "./iso-time";
import { SUPPORT_EMAIL } from "./legal/operator";
import { userScope } from "./llm/daily-usage";
import { usageTotalsFor, type UsageTotal } from "./llm/usage-log.server";
import { count } from "./text";
import { pictureUrl } from "./procedures/image-pipeline";
import { resetEngagement } from "./firm/grant-store";
import { listFirmActivity, withAuditBypass, type FirmActivityRow } from "./firm/audit.server";

/**
 * Everything the app holds for one account, in one JSON document the owner can
 * keep. Left out on purpose: share passcode hashes and salts, invite link
 * tokens, and the encrypted QuickBooks tokens. Step pictures are listed with
 * everything stored about them and the address that serves each one, not
 * their bytes: hundreds of them, inline, would make one very large response.
 * Past versions of each business download separately (exportBusinessHistoryPage):
 * up to 200 versions of up to 2 MB each would pass Vercel's 4.5 MB response limit.
 */
interface AccountExport {
  exportedAt: string;
  /** Server-recorded control work and review history; no evidence-file contents. */
  controlExecutions: Array<{ businessId: string; record: ControlExecution }>;
  user: { id: string; name: string; email: string; createdAt: string } | null;
  businesses: Array<{
    id: string;
    name: string;
    industry: string;
    revision: number;
    updatedAt: string;
    deletedAt: string | null;
    /** When the account shared the business with a firm (migration 0046); null otherwise. */
    grantedAt: string | null;
    profile: unknown;
  }>;
  /**
   * The account's invitations to firms to work on its businesses, accepted
   * or not, with the firm's name once one accepted. Never the link's token.
   */
  firmGrants: Array<{
    businessId: string;
    invitedEmail: string;
    createdAt: string;
    expiresAt: string;
    acceptedAt: string | null;
    revokedAt: string | null;
    firmName: string | null;
  }>;
  /** Businesses deleted for good; only the id and the day are kept. */
  deletedBusinesses: Array<{ businessId: string; deletedAt: string }>;
  /**
   * For a firm owner: the firm's client businesses that members set up, as
   * summaries (the profiles are the members' rows; each one's past versions
   * download through the history download, which lists them too). Empty for
   * everyone else.
   */
  firmClients: Array<{
    id: string;
    name: string;
    industry: string;
    ownerUserId: string;
    revision: number;
    updatedAt: string;
    deletedAt: string | null;
  }>;
  reportVersions: Array<{
    id: string;
    businessId: string;
    versionNo: number;
    revision: number | null;
    scopeNote: string;
    preparedBy: string | null;
    preparedAt: string;
    reviewedBy: string | null;
    reviewedAt: string | null;
    reviewNote: string;
    sentAt: string | null;
    /** The firm's name and letterhead as frozen at lock; null before migration 0041 and for a solo business. */
    firm: { name: string; letterhead: string; logoDataUrl: string | null } | null;
    /** The engagement's scope and period as frozen at lock; null before migration 0045 or when empty. */
    engagement: { scope: string; periodStart: string | null; periodEnd: string | null } | null;
    /** Request and return (migration 0047); null and empty when never asked or returned. */
    reviewRequestedAt: string | null;
    reviewRequestedBy: string | null;
    reviewRequestedFrom: string | null;
    returnedAt: string | null;
    returnedBy: string | null;
    returnNote: string;
    profile: unknown;
  }>;
  snapshots: Array<{
    id: string;
    title: string;
    practiceName: string;
    createdAt: string;
    profile: unknown;
    powerMap: unknown;
    valueCase: unknown;
    valueEvidence: unknown;
  }>;
  shares: Array<{
    token: string;
    businessName: string;
    createdAt: string;
    expiresAt: string | null;
    revokedAt: string | null;
    redacted: boolean;
    payload: unknown;
  }>;
  firm: {
    name: string;
    plan: string;
    letterhead: string;
    logoDataUrl: string | null;
    coverPage: boolean;
    /** How long the firm keeps a deleted client's records, in years. */
    retentionYears: number;
    updatedAt: string;
  } | null;
  /** Firms this account belongs to, its own included. */
  firmMemberships: Array<{ firmUserId: string; role: string; joinedAt: string }>;
  /** People in the firm this account owns. */
  firmMembers: Array<{ userId: string; email: string; role: string; joinedAt: string }>;
  firmInvites: Array<{
    email: string;
    role: string;
    createdAt: string;
    expiresAt: string;
    acceptedAt: string | null;
  }>;
  engagements: Array<{
    businessId: string;
    startedAt: string | null;
    mapCompletedAt: string | null;
    reportSentAt: string | null;
    /** Null when the count was never recorded (migration 0024), not zero. */
    openFindings: number | null;
    acceptedFindings: number;
    /** The client owner's email, kept for reminders. */
    ownerEmail: string | null;
    /** The engagement (migration 0045): what the firm was engaged to do, for when, by whom. */
    scope: string;
    periodStart: string | null;
    periodEnd: string | null;
    status: string;
    endedAt: string | null;
    preparerUserId: string | null;
    reviewerUserId: string | null;
  }>;
  reviews: Array<{
    businessId: string;
    period: string;
    itemKey: string;
    ownerName: string;
    dueOn: string | null;
    result: string;
    notes: string;
    recordedAt: string;
    recordedBy: string | null;
  }>;
  /** Pictures attached to procedure steps; `path` serves the picture while the account exists. */
  procedureImages: Array<{
    id: string;
    businessId: string;
    contentType: string;
    byteSize: number;
    width: number;
    height: number;
    sha256: string;
    uploadedBy: string | null;
    createdAt: string;
    /** When no step named it any more; it is deleted 30 days after. */
    unreferencedSince: string | null;
    path: string;
  }>;
  reminderSettings: { weeklyDigest: boolean; ownerReminders: boolean } | null;
  remindersSent: Array<{
    businessId: string;
    itemKey: string;
    dueOn: string | null;
    recipient: string;
    sentAt: string;
  }>;
  /** What Stripe last reported; no card details are stored here. */
  billing: {
    stripeCustomerId: string | null;
    subscriptionId: string | null;
    subscriptionStatus: string | null;
    assessmentPaidAt: string | null;
    assessmentPaymentIntentId: string | null;
    assessmentRefundedAt: string | null;
    assessmentDisputedAt: string | null;
    currentPeriodEnd: string | null;
    /** The Stripe price the subscription runs on (migration 0044); null until an event names it. */
    subscriptionPriceId: string | null;
  } | null;
  quickBooksConnections: Array<{
    businessId: string;
    realmId: string;
    connectedAt: string;
    /** The account that finished the connect flow; null before it was recorded. */
    connectedBy: string | null;
    lastSyncedAt: string | null;
    lastError: string | null;
  }>;
  quickBooksSnapshots: Array<{
    businessId: string;
    takenAt: string;
    vendors: unknown;
    employees: unknown;
  }>;
  /** The account's milestones (first business, first locked version, first report sent, first monthly review). */
  activity: Array<{ event: string; businessId: string | null; occurredAt: string }>;
  /** Model calls the account made, per feature: calls and tokens, never the text. */
  modelUsage: UsageTotal[];
  /**
   * For a firm owner: the firm's activity log (migration 0048), newest
   * first, with each actor's name as it was. Empty for everyone else.
   */
  firmActivity: FirmActivityRow[];
}

/** What account deletion removed that still has to be undone outside the database. */
interface DeletedAccount {
  /** Encrypted QuickBooks refresh tokens to revoke at Intuit. */
  quickBooksRefreshTokens: string[];
  /** The Stripe customer to delete at Stripe, when the account had one. */
  stripeCustomerId: string | null;
}

/**
 * Reads the account's rows from one consistent snapshot, so a save landing
 * mid-export cannot make one part of the file disagree with another.
 * `firmUserId` is the firm the caller owns (null otherwise): its members'
 * client businesses come along as summaries.
 */
export async function exportAccountRows(
  sql: Sql,
  userId: string,
  firmUserId: string | null = null,
): Promise<AccountExport> {
  return inTransaction(sql, async (tx) => {
    await tx`set transaction isolation level repeatable read`;
    const [
      user,
      businesses,
      firmGrants,
      deletedBusinesses,
      firmClients,
      reportVersions,
      snapshots,
      shares,
      firm,
      firmMemberships,
      firmMembers,
      firmInvites,
      engagements,
      reviews,
      reminderSettings,
      remindersSent,
      billing,
      quickBooksConnections,
      quickBooksSnapshots,
      procedureImages,
      controlExecutions,
      activity,
      modelUsage,
      firmActivity,
    ] = await Promise.all([
      readUser(tx, userId),
      readBusinesses(tx, userId),
      readFirmGrants(tx, userId),
      readDeletedBusinesses(tx, userId),
      readFirmClients(tx, userId, firmUserId),
      readReportVersions(tx, userId),
      readSnapshots(tx, userId),
      readShares(tx, userId),
      readFirm(tx, userId),
      readFirmMemberships(tx, userId),
      readFirmMembers(tx, userId),
      readFirmInvites(tx, userId),
      readEngagements(tx, userId),
      readReviews(tx, userId),
      readReminderSettings(tx, userId),
      readRemindersSent(tx, userId),
      readBilling(tx, userId),
      readQuickBooksConnections(tx, userId),
      readQuickBooksSnapshots(tx, userId),
      readProcedureImages(tx, userId),
      tx<{
        businessId: string;
        record: ControlExecution;
      }>`select business_id as "businessId", record from control_execution_log where user_id=${userId} order by created_at,id`,
      readActivity(tx, userId),
      usageTotalsFor(tx, userId),
      firmUserId ? listFirmActivity(tx, firmUserId) : Promise.resolve([]),
    ]);
    return {
      exportedAt: new Date().toISOString(),
      controlExecutions,
      user,
      businesses,
      firmGrants,
      deletedBusinesses,
      firmClients,
      reportVersions,
      snapshots,
      shares,
      firm,
      firmMemberships,
      firmMembers,
      firmInvites,
      engagements,
      reviews,
      reminderSettings,
      remindersSent,
      billing,
      quickBooksConnections,
      quickBooksSnapshots,
      procedureImages,
      activity,
      modelUsage,
      firmActivity,
    };
  });
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
 * businesses it set up for someone else's firm: the firm owner removes the
 * member first, which hands those clients to the firm (see removeMember).
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
 * and stays.
 */
export async function deleteAccountRows(sql: Sql, userId: string): Promise<DeletedAccount> {
  return inTransaction(sql, async (tx) => {
    const stripeCustomerId = await refuseWhileBilling(tx, userId);
    await refuseWhileHoldingFirmClients(tx, userId);
    const connections = await tx<{ refresh_token_enc: string }>`
      select refresh_token_enc from integration_connections where user_id = ${userId}
    `;
    // Members' and owners' businesses leave the deleted firm. A business its
    // owner shared with the firm goes back to the owner with a fresh
    // engagement and without the links the firm's members made on it, as a
    // hand-back leaves it, and invitations still waiting on this address close.
    const granted = await tx<{ user_id: string; id: string }>`
      select user_id, id from businesses
      where firm_user_id = ${userId} and user_id <> ${userId} and granted_at is not null
      for update
    `;
    await tx`
      update businesses set firm_user_id = null, granted_at = null
      where firm_user_id = ${userId} and user_id <> ${userId}
    `;
    for (const row of granted) {
      await resetEngagement(tx, row.user_id, row.id);
      await tx`
        update map_shares set revoked_at = now()
        where business_owner_id = ${row.user_id} and business_id = ${row.id}
          and user_id <> ${row.user_id} and revoked_at is null
      `;
    }
    await tx`
      update business_firm_grants set revoked_at = now()
      where revoked_at is null and accepted_at is null
        and lower(invited_email) = lower((select email from "user" where id = ${userId}))
    `;
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

/** Refuses while the Firm plan runs; otherwise the Stripe customer id to delete, if any. */
async function refuseWhileBilling(tx: Sql, userId: string): Promise<string | null> {
  const rows = await tx<{ subscription_status: string | null; stripe_customer_id: string | null }>`
    select subscription_status, stripe_customer_id from billing_accounts where user_id = ${userId}
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

async function refuseWhileHoldingFirmClients(tx: Sql, userId: string): Promise<void> {
  const rows = await tx<{ firm_name: string; n: number | string }>`
    select f.name as firm_name, count(*) as n
    from businesses b join firms f on f.user_id = b.firm_user_id
    where b.user_id = ${userId} and b.firm_user_id <> ${userId} and b.deleted_at is null
      and b.granted_at is null
    group by f.name
    order by count(*) desc
    limit 1
  `;
  const held = rows[0];
  if (!held) return;
  throw new RequestError(
    409,
    `You set up ${count(Number(held.n), "client business", "client businesses")} for ${held.firm_name}. Ask the firm owner to remove you from the firm first (your client businesses stay with the firm), then delete your account. Need help? Write to ${SUPPORT_EMAIL}.`,
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

async function readBusinesses(tx: Sql, userId: string): Promise<AccountExport["businesses"]> {
  const rows = await tx<{
    id: string;
    name: string;
    industry: string;
    revision: number | string;
    updated_at: string;
    deleted_at: string | null;
    granted_at: string | null;
    profile: unknown;
  }>`
    select id, name, industry, revision, updated_at, deleted_at, granted_at, profile
    from businesses where user_id = ${userId} order by updated_at desc
  `;
  return rows.map((b) => ({
    id: b.id,
    name: b.name,
    industry: b.industry,
    revision: Number(b.revision),
    updatedAt: toIsoTimestamp(b.updated_at),
    deletedAt: toIsoTimestampOrNull(b.deleted_at),
    grantedAt: toIsoTimestampOrNull(b.granted_at),
    profile: b.profile,
  }));
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

async function readReportVersions(
  tx: Sql,
  userId: string,
): Promise<AccountExport["reportVersions"]> {
  const rows = await tx<{
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
    sent_at: string | null;
    firm_name: string | null;
    firm_letterhead: string | null;
    firm_logo_data_url: string | null;
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
  }>`
    select id, business_id, version_no, revision, scope_note, prepared_by, prepared_at,
      reviewed_by, reviewed_at, review_note, sent_at, firm_name, firm_letterhead,
      firm_logo_data_url, engagement_scope, engagement_period_start, engagement_period_end,
      review_requested_at, review_requested_by, review_requested_from, returned_at,
      returned_by, return_note, profile
    from report_versions where user_id = ${userId}
    order by business_id, version_no desc
  `;
  return rows.map((r) => ({
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
    sentAt: toIsoTimestampOrNull(r.sent_at),
    firm:
      r.firm_name === null
        ? null
        : {
            name: r.firm_name,
            letterhead: r.firm_letterhead ?? "",
            logoDataUrl: r.firm_logo_data_url,
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
    reviewRequestedBy: r.review_requested_by,
    reviewRequestedFrom: r.review_requested_from,
    returnedAt: toIsoTimestampOrNull(r.returned_at),
    returnedBy: r.returned_by,
    returnNote: r.return_note,
    profile: r.profile,
  }));
}

async function readSnapshots(tx: Sql, userId: string): Promise<AccountExport["snapshots"]> {
  const rows = await tx<{
    id: string;
    title: string;
    practice_name: string;
    created_at: string;
    profile_json: unknown;
    power_map_json: unknown;
    value_case_json: unknown;
    value_evidence_json: unknown;
  }>`
    select id, title, practice_name, created_at, profile_json, power_map_json,
      value_case_json, value_evidence_json
    from assessment_snapshots where user_id = ${userId} order by created_at desc
  `;
  return rows.map((s) => ({
    id: s.id,
    title: s.title,
    practiceName: s.practice_name,
    createdAt: toIsoTimestamp(s.created_at),
    profile: s.profile_json,
    powerMap: s.power_map_json,
    valueCase: s.value_case_json,
    valueEvidence: s.value_evidence_json,
  }));
}

async function readShares(tx: Sql, userId: string): Promise<AccountExport["shares"]> {
  const rows = await tx<{
    token: string;
    business_name: string;
    created_at: string;
    expires_at: string | null;
    revoked_at: string | null;
    redacted: boolean;
    payload: unknown;
  }>`
    select token, business_name, created_at, expires_at, revoked_at, redacted, payload
    from map_shares where user_id = ${userId} order by created_at desc
  `;
  return rows.map((s) => ({
    token: s.token,
    businessName: s.business_name,
    createdAt: toIsoTimestamp(s.created_at),
    expiresAt: toIsoTimestampOrNull(s.expires_at),
    revokedAt: toIsoTimestampOrNull(s.revoked_at),
    redacted: Boolean(s.redacted),
    payload: s.payload,
  }));
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

async function readReviews(tx: Sql, userId: string): Promise<AccountExport["reviews"]> {
  const rows = await tx<{
    business_id: string;
    period: string;
    item_key: string;
    owner_name: string;
    due_on: string | null;
    result: string;
    notes: string;
    recorded_at: string;
    recorded_by: string | null;
  }>`
    select business_id, period, item_key, owner_name, due_on, result, notes, recorded_at,
      recorded_by
    from review_events where user_id = ${userId} order by recorded_at desc
  `;
  return rows.map((r) => ({
    businessId: r.business_id,
    period: r.period,
    itemKey: r.item_key,
    ownerName: r.owner_name,
    dueOn: r.due_on ?? null,
    result: r.result,
    notes: r.notes,
    recordedAt: toIsoTimestamp(r.recorded_at),
    recordedBy: r.recorded_by ?? null,
  }));
}

async function readProcedureImages(
  tx: Sql,
  userId: string,
): Promise<AccountExport["procedureImages"]> {
  const rows = await tx<{
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
  }>`
    select id, business_id, content_type, byte_size, width, height, sha256, uploaded_by,
      created_at, unreferenced_since
    from procedure_images where user_id = ${userId} order by business_id, created_at, id
  `;
  return rows.map((i) => ({
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

async function readRemindersSent(tx: Sql, userId: string): Promise<AccountExport["remindersSent"]> {
  const rows = await tx<{
    business_id: string;
    item_key: string;
    due_on: string | null;
    recipient: string;
    sent_at: string;
  }>`
    select business_id, item_key, due_on::text as due_on, recipient, sent_at
    from reminder_log where user_id = ${userId} order by sent_at desc
  `;
  return rows.map((r) => ({
    businessId: r.business_id,
    itemKey: r.item_key,
    dueOn: r.due_on,
    recipient: r.recipient,
    sentAt: toIsoTimestamp(r.sent_at),
  }));
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

async function readQuickBooksSnapshots(
  tx: Sql,
  userId: string,
): Promise<AccountExport["quickBooksSnapshots"]> {
  const rows = await tx<{
    business_id: string;
    taken_at: string;
    vendors: unknown;
    employees: unknown;
  }>`
    select business_id, taken_at, vendors, employees
    from integration_snapshots where user_id = ${userId} and provider = 'qbo'
    order by business_id, taken_at desc
  `;
  return rows.map((s) => ({
    businessId: s.business_id,
    takenAt: toIsoTimestamp(s.taken_at),
    vendors: s.vendors,
    employees: s.employees,
  }));
}
