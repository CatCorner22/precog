import type { ControlExecution } from "./controls/executions/model";
import type { Sql } from "@/lib/db";
import { RequestError } from "@/lib/request-errors";
import { inTransaction } from "@/lib/sql-transaction";
import { ACTIVE_SUBSCRIPTION_STATUSES } from "./firm/billing-store";
import { toIsoTimestamp, toIsoTimestampOrNull } from "./iso-time";
import { userScope } from "./llm/daily-usage";
import { count } from "./text";
import { pictureUrl } from "./procedures/image-pipeline";

/**
 * Everything the app holds for one account, in one JSON document the owner can
 * keep. Left out on purpose: share passcode hashes and salts, invite link
 * tokens, and the encrypted QuickBooks tokens. Step pictures are listed with
 * everything stored about them and the address that serves each one, not
 * their bytes: hundreds of them, inline, would make one very large response.
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
    profile: unknown;
  }>;
  /** Every earlier saved version of each business, newest first. */
  businessHistory: Array<{
    businessId: string;
    revision: number;
    name: string;
    industry: string;
    savedBy: string | null;
    savedAt: string;
    profile: unknown;
  }>;
  /** Businesses deleted for good; only the id and the day are kept. */
  deletedBusinesses: Array<{ businessId: string; deletedAt: string }>;
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
  firm: { name: string; plan: string; updatedAt: string } | null;
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
    currentPeriodEnd: string | null;
  } | null;
  quickBooksConnections: Array<{
    businessId: string;
    realmId: string;
    connectedAt: string;
    lastSyncedAt: string | null;
    lastError: string | null;
  }>;
  quickBooksSnapshots: Array<{
    businessId: string;
    takenAt: string;
    vendors: unknown;
    employees: unknown;
  }>;
}

/** What account deletion removed that still has to be undone outside the database. */
interface DeletedAccount {
  /** Encrypted QuickBooks refresh tokens to revoke at Intuit. */
  quickBooksRefreshTokens: string[];
}

/**
 * Reads the account's rows from one consistent snapshot, so a save landing
 * mid-export cannot make one part of the file disagree with another.
 */
export async function exportAccountRows(sql: Sql, userId: string): Promise<AccountExport> {
  return inTransaction(sql, async (tx) => {
    await tx`set transaction isolation level repeatable read`;
    const [
      user,
      businesses,
      businessHistory,
      deletedBusinesses,
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
    ] = await Promise.all([
      readUser(tx, userId),
      readBusinesses(tx, userId),
      readBusinessHistory(tx, userId),
      readDeletedBusinesses(tx, userId),
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
    ]);
    return {
      exportedAt: new Date().toISOString(),
      controlExecutions,
      user,
      businesses,
      businessHistory,
      deletedBusinesses,
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
    };
  });
}

/**
 * Removes every row the account owns and then the account itself, in one
 * transaction. Refused (409) while a firm plan is still billing, so Stripe
 * never keeps charging a deleted account, and while the account holds client
 * businesses it set up for someone else's firm, so a departing member cannot
 * take the firm's clients with them.
 *
 * Snapshots and the per-user model-usage counts carry no foreign key to the
 * user, so they are deleted explicitly; everything else (businesses and their
 * history, report versions and QuickBooks rows, shares, the firm, reminders,
 * billing, sessions and linked accounts) cascades from the user row. Client
 * businesses that members of this account's firm set up stay with those
 * members and leave the firm. The app-wide usage count is not the account's
 * and stays.
 */
export async function deleteAccountRows(sql: Sql, userId: string): Promise<DeletedAccount> {
  return inTransaction(sql, async (tx) => {
    await refuseWhileBilling(tx, userId);
    await refuseWhileHoldingFirmClients(tx, userId);
    const connections = await tx<{ refresh_token_enc: string }>`
      select refresh_token_enc from integration_connections where user_id = ${userId}
    `;
    await tx`
      update businesses set firm_user_id = null
      where firm_user_id = ${userId} and user_id <> ${userId}
    `;
    await tx`delete from assessment_snapshots where user_id = ${userId}`;
    await tx`delete from llm_daily_usage where scope = ${userScope(userId)}`;
    await tx`delete from "user" where "id" = ${userId}`;
    return { quickBooksRefreshTokens: connections.map((c) => c.refresh_token_enc) };
  });
}

async function refuseWhileBilling(tx: Sql, userId: string): Promise<void> {
  const rows = await tx<{ subscription_status: string | null }>`
    select subscription_status from billing_accounts where user_id = ${userId}
  `;
  const status = rows[0]?.subscription_status;
  if (status && ACTIVE_SUBSCRIPTION_STATUSES.has(status)) {
    throw new RequestError(
      409,
      "Your firm plan is still active. Cancel it with Manage billing on the Firm page, then delete your account.",
    );
  }
}

async function refuseWhileHoldingFirmClients(tx: Sql, userId: string): Promise<void> {
  const rows = await tx<{ firm_name: string; n: number | string }>`
    select f.name as firm_name, count(*) as n
    from businesses b join firms f on f.user_id = b.firm_user_id
    where b.user_id = ${userId} and b.firm_user_id <> ${userId} and b.deleted_at is null
    group by f.name
    order by count(*) desc
    limit 1
  `;
  const held = rows[0];
  if (!held) return;
  throw new RequestError(
    409,
    `You set up ${count(Number(held.n), "client business", "client businesses")} for ${held.firm_name}. Deleting your account would delete them too. Ask the firm owner what to keep, delete those businesses yourself, then delete your account.`,
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
    profile: unknown;
  }>`
    select id, name, industry, revision, updated_at, deleted_at, profile
    from businesses where user_id = ${userId} order by updated_at desc
  `;
  return rows.map((b) => ({
    id: b.id,
    name: b.name,
    industry: b.industry,
    revision: Number(b.revision),
    updatedAt: toIsoTimestamp(b.updated_at),
    deletedAt: toIsoTimestampOrNull(b.deleted_at),
    profile: b.profile,
  }));
}

async function readBusinessHistory(
  tx: Sql,
  userId: string,
): Promise<AccountExport["businessHistory"]> {
  const rows = await tx<{
    business_id: string;
    revision: number | string;
    name: string;
    industry: string;
    saved_by: string | null;
    saved_at: string;
    profile: unknown;
  }>`
    select business_id, revision, name, industry, saved_by, saved_at, profile
    from business_history where user_id = ${userId}
    order by business_id, revision desc
  `;
  return rows.map((h) => ({
    businessId: h.business_id,
    revision: Number(h.revision),
    name: h.name,
    industry: h.industry,
    savedBy: h.saved_by,
    savedAt: toIsoTimestamp(h.saved_at),
    profile: h.profile,
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
    profile: unknown;
  }>`
    select id, business_id, version_no, revision, scope_note, prepared_by, prepared_at,
      reviewed_by, reviewed_at, review_note, sent_at, profile
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
  const rows = await tx<{ name: string; plan: string; updated_at: string }>`
    select name, plan, updated_at from firms where user_id = ${userId}
  `;
  const firm = rows[0];
  return firm
    ? { name: firm.name, plan: firm.plan, updatedAt: toIsoTimestamp(firm.updated_at) }
    : null;
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
  }>`
    select business_id, started_at, map_completed_at, report_sent_at, open_findings,
      accepted_findings, owner_email
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
    current_period_end: string | null;
  }>`
    select stripe_customer_id, subscription_id, subscription_status, assessment_paid_at,
      current_period_end
    from billing_accounts where user_id = ${userId}
  `;
  const b = rows[0];
  return b
    ? {
        stripeCustomerId: b.stripe_customer_id,
        subscriptionId: b.subscription_id,
        subscriptionStatus: b.subscription_status,
        assessmentPaidAt: toIsoTimestampOrNull(b.assessment_paid_at),
        currentPeriodEnd: toIsoTimestampOrNull(b.current_period_end),
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
    last_synced_at: string | null;
    last_error: string | null;
  }>`
    select business_id, realm_id, connected_at, last_synced_at, last_error
    from integration_connections where user_id = ${userId} and provider = 'qbo'
    order by business_id
  `;
  return rows.map((c) => ({
    businessId: c.business_id,
    realmId: c.realm_id,
    connectedAt: toIsoTimestamp(c.connected_at),
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
