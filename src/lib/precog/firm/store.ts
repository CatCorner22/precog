import type { Sql } from "@/lib/db";
import { toIsoTimestamp, toIsoTimestampOrNull } from "../iso-time";
import type { FirmPlan } from "./pricing";
import type { ReviewItemKey, ReviewResult } from "./reviews";

/**
 * A firm is keyed by its owner's account: `firms.user_id` is both the owner
 * and the firm id (`firmUserId` everywhere below). Members join through
 * `firm_members`; every member of the firm sees the businesses that carry the
 * firm on their row (`businesses.firm_user_id`).
 */
export type FirmRole = "owner" | "preparer" | "reviewer";
const FIRM_ROLES: readonly FirmRole[] = ["owner", "preparer", "reviewer"];
export const INVITE_ROLES: readonly Exclude<FirmRole, "owner">[] = ["preparer", "reviewer"];
const INVITE_TTL_DAYS = 14;
const MAX_MEMBERS_PER_FIRM = 25;

export interface FirmContext {
  /** The owner's user id, which is the firm's id. */
  firmUserId: string;
  name: string;
  plan: FirmPlan;
  role: FirmRole;
  updatedAt: string;
}

export interface FirmMember {
  userId: string;
  name: string;
  email: string;
  role: FirmRole;
  joinedAt: string;
}

export interface FirmInvite {
  token: string;
  email: string;
  role: Exclude<FirmRole, "owner">;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
}

export interface ClientEngagementRow {
  id: string;
  name: string;
  industry: string;
  updatedAt: string;
  ownerUserId: string;
  shared: boolean;
  startedAt: string | null;
  mapCompletedAt: string | null;
  reportSentAt: string | null;
  openFindings: number;
  acceptedFindings: number;
  lastReviewAt: string | null;
  ownerEmail: string | null;
}

export interface ReviewEventInput {
  businessId: string;
  period: string;
  itemKey: ReviewItemKey;
  ownerName: string;
  dueOn: string | null;
  result: ReviewResult;
  notes: string;
}

function asPlan(value: string): FirmPlan {
  return value === "monthly" ? "monthly" : "assessment";
}

function asRole(value: string): FirmRole {
  return FIRM_ROLES.includes(value as FirmRole) ? (value as FirmRole) : "preparer";
}

/** The firm `userId` works in: their own when they own one, else the one they joined. */
export async function loadFirmFor(sql: Sql, userId: string): Promise<FirmContext | null> {
  const rows = await sql<{
    firm_user_id: string;
    name: string;
    plan: string;
    role: string;
    updated_at: string;
  }>`
    select m.firm_user_id, f.name, f.plan, m.role, f.updated_at
    from firm_members m
    join firms f on f.user_id = m.firm_user_id
    where m.member_user_id = ${userId}
    order by (m.firm_user_id = ${userId}) desc, m.joined_at asc
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    firmUserId: row.firm_user_id,
    name: row.name,
    plan: asPlan(row.plan),
    role: asRole(row.role),
    updatedAt: toIsoTimestamp(row.updated_at),
  };
}

export class FirmMembershipError extends Error {
  readonly status = 409;
  constructor(message: string) {
    super(message);
    this.name = "FirmMembershipError";
  }
}

/** Creates or renames the caller's own firm. A member of another firm cannot start one. */
export async function saveFirm(
  sql: Sql,
  userId: string,
  name: string,
  plan: FirmPlan,
): Promise<FirmContext> {
  const current = await loadFirmFor(sql, userId);
  if (current && current.firmUserId !== userId) {
    throw new FirmMembershipError(
      `You are a member of ${current.name}. Leave it before starting a firm of your own.`,
    );
  }
  const rows = await sql<{ name: string; plan: string; updated_at: string }>`
    insert into firms (user_id, name, plan, updated_at)
    values (${userId}, ${name}, ${plan}, now())
    on conflict (user_id) do update set
      name = excluded.name,
      plan = excluded.plan,
      updated_at = now()
    returning name, plan, updated_at
  `;
  await sql`
    insert into firm_members (firm_user_id, member_user_id, role)
    values (${userId}, ${userId}, 'owner')
    on conflict do nothing
  `;
  // The owner's own businesses become the firm's clients.
  await sql`
    update businesses set firm_user_id = ${userId}
    where user_id = ${userId} and firm_user_id is null
  `;
  const row = rows[0];
  return {
    firmUserId: userId,
    name: row.name,
    plan: asPlan(row.plan),
    role: "owner",
    updatedAt: toIsoTimestamp(row.updated_at),
  };
}

/** Sets the plan alone, as the billing webhook does. */
export async function setFirmPlan(sql: Sql, firmUserId: string, plan: FirmPlan): Promise<void> {
  await sql`update firms set plan = ${plan}, updated_at = now() where user_id = ${firmUserId}`;
}

export async function listMembers(sql: Sql, firmUserId: string): Promise<FirmMember[]> {
  const rows = await sql<{
    member_user_id: string;
    name: string;
    email: string;
    role: string;
    joined_at: string;
  }>`
    select m.member_user_id, u.name, u.email, m.role, m.joined_at
    from firm_members m
    join "user" u on u.id = m.member_user_id
    where m.firm_user_id = ${firmUserId}
    order by (m.role = 'owner') desc, m.joined_at asc
  `;
  return rows.map((r) => ({
    userId: r.member_user_id,
    name: r.name,
    email: r.email,
    role: asRole(r.role),
    joinedAt: toIsoTimestamp(r.joined_at),
  }));
}

export async function setMemberRole(
  sql: Sql,
  firmUserId: string,
  memberUserId: string,
  role: Exclude<FirmRole, "owner">,
): Promise<void> {
  if (memberUserId === firmUserId) throw new FirmMembershipError("The owner's role cannot change.");
  await sql`
    update firm_members set role = ${role}
    where firm_user_id = ${firmUserId} and member_user_id = ${memberUserId} and role <> 'owner'
  `;
}

export async function removeMember(
  sql: Sql,
  firmUserId: string,
  memberUserId: string,
): Promise<void> {
  if (memberUserId === firmUserId) throw new FirmMembershipError("The owner cannot be removed.");
  await sql`
    delete from firm_members
    where firm_user_id = ${firmUserId} and member_user_id = ${memberUserId} and role <> 'owner'
  `;
}

export async function createInvite(
  sql: Sql,
  input: { firmUserId: string; email: string; role: Exclude<FirmRole, "owner">; token: string },
): Promise<FirmInvite> {
  const members = await sql<{ n: number | string }>`
    select count(*) as n from firm_members where firm_user_id = ${input.firmUserId}
  `;
  if (Number(members[0]?.n ?? 0) >= MAX_MEMBERS_PER_FIRM) {
    throw new FirmMembershipError(`A firm holds at most ${MAX_MEMBERS_PER_FIRM} members.`);
  }
  const rows = await sql<{ created_at: string; expires_at: string }>`
    insert into firm_invites (token, firm_user_id, email, role, expires_at)
    values (
      ${input.token}, ${input.firmUserId}, ${input.email.toLowerCase()}, ${input.role},
      now() + make_interval(days => ${INVITE_TTL_DAYS}::int)
    )
    returning created_at, expires_at
  `;
  return {
    token: input.token,
    email: input.email.toLowerCase(),
    role: input.role,
    createdAt: toIsoTimestamp(rows[0].created_at),
    expiresAt: toIsoTimestamp(rows[0].expires_at),
    acceptedAt: null,
  };
}

/** Open invitations of one firm (not yet accepted, not yet expired). */
export async function listInvites(sql: Sql, firmUserId: string): Promise<FirmInvite[]> {
  const rows = await sql<{
    token: string;
    email: string;
    role: string;
    created_at: string;
    expires_at: string;
  }>`
    select token, email, role, created_at, expires_at
    from firm_invites
    where firm_user_id = ${firmUserId} and accepted_at is null and expires_at > now()
    order by created_at desc
  `;
  return rows.map((r) => ({
    token: r.token,
    email: r.email,
    role: r.role === "reviewer" ? "reviewer" : "preparer",
    createdAt: toIsoTimestamp(r.created_at),
    expiresAt: toIsoTimestamp(r.expires_at),
    acceptedAt: null,
  }));
}

export async function revokeInvite(sql: Sql, firmUserId: string, token: string): Promise<void> {
  await sql`delete from firm_invites where firm_user_id = ${firmUserId} and token = ${token}`;
}

/** What an invitation link shows before the visitor accepts it. */
export async function peekInvite(
  sql: Sql,
  token: string,
): Promise<{ firmName: string; role: Exclude<FirmRole, "owner">; email: string } | null> {
  const rows = await sql<{ name: string; role: string; email: string }>`
    select f.name, i.role, i.email
    from firm_invites i join firms f on f.user_id = i.firm_user_id
    where i.token = ${token} and i.accepted_at is null and i.expires_at > now()
  `;
  const row = rows[0];
  return row
    ? {
        firmName: row.name,
        role: row.role === "reviewer" ? "reviewer" : "preparer",
        email: row.email,
      }
    : null;
}

/**
 * The signed-in visitor joins the firm the token names. A person already in
 * another firm (their own included) is refused: one account, one firm.
 */
export async function acceptInvite(sql: Sql, token: string, userId: string): Promise<FirmContext> {
  const invites = await sql<{ firm_user_id: string; role: string }>`
    select firm_user_id, role from firm_invites
    where token = ${token} and accepted_at is null and expires_at > now()
  `;
  const invite = invites[0];
  if (!invite) throw new FirmMembershipError("This invitation has expired or was already used.");
  const current = await loadFirmFor(sql, userId);
  if (current && current.firmUserId !== invite.firm_user_id) {
    throw new FirmMembershipError(
      `You already belong to ${current.name}. Leave it before joining another firm.`,
    );
  }
  await sql`
    insert into firm_members (firm_user_id, member_user_id, role)
    values (${invite.firm_user_id}, ${userId}, ${invite.role})
    on conflict (firm_user_id, member_user_id) do update set role = excluded.role
  `;
  await sql`
    update firm_invites set accepted_by = ${userId}, accepted_at = now() where token = ${token}
  `;
  const joined = await loadFirmFor(sql, userId);
  if (!joined) throw new Error("Unable to join the firm");
  return joined;
}

/** A member leaves; the owner cannot. */
export async function leaveFirm(sql: Sql, firmUserId: string, userId: string): Promise<void> {
  if (firmUserId === userId) throw new FirmMembershipError("The owner cannot leave the firm.");
  await sql`
    delete from firm_members where firm_user_id = ${firmUserId} and member_user_id = ${userId}
  `;
}

export async function upsertEngagementMark(
  sql: Sql,
  ownerUserId: string,
  input: {
    businessId: string;
    startedAt?: string | null;
    mapCompletedAt?: string | null;
    reportSentAt?: string | null;
    openFindings: number;
    acceptedFindings: number;
  },
): Promise<void> {
  await sql`
    insert into engagement_marks (
      user_id, business_id, started_at, map_completed_at, report_sent_at,
      open_findings, accepted_findings
    )
    values (
      ${ownerUserId},
      ${input.businessId},
      ${input.startedAt ?? null},
      ${input.mapCompletedAt ?? null},
      ${input.reportSentAt ?? null},
      ${input.openFindings},
      ${input.acceptedFindings}
    )
    on conflict (user_id, business_id) do update set
      started_at = coalesce(engagement_marks.started_at, excluded.started_at),
      map_completed_at = coalesce(engagement_marks.map_completed_at, excluded.map_completed_at),
      report_sent_at = coalesce(engagement_marks.report_sent_at, excluded.report_sent_at),
      open_findings = excluded.open_findings,
      accepted_findings = excluded.accepted_findings
  `;
}

/** The client owner's address for reminders; empty clears it. */
export async function setOwnerEmail(
  sql: Sql,
  ownerUserId: string,
  businessId: string,
  email: string | null,
): Promise<void> {
  await sql`
    insert into engagement_marks (user_id, business_id, owner_email)
    values (${ownerUserId}, ${businessId}, ${email})
    on conflict (user_id, business_id) do update set owner_email = excluded.owner_email
  `;
}

export async function listClientEngagements(
  sql: Sql,
  userId: string,
  firmUserId: string | null,
): Promise<ClientEngagementRow[]> {
  const rows = await sql<{
    id: string;
    user_id: string;
    name: string;
    industry: string;
    updated_at: string;
    started_at: string | null;
    map_completed_at: string | null;
    report_sent_at: string | null;
    open_findings: number | string | null;
    accepted_findings: number | string | null;
    last_review_at: string | null;
    owner_email: string | null;
  }>`
    select
      b.id, b.user_id, b.name, b.industry, b.updated_at,
      e.started_at, e.map_completed_at, e.report_sent_at,
      e.open_findings, e.accepted_findings, e.owner_email,
      (
        select max(r.recorded_at) from review_events r
        where r.user_id = b.user_id and r.business_id = b.id
      ) as last_review_at
    from businesses b
    left join engagement_marks e
      on e.user_id = b.user_id and e.business_id = b.id
    where b.deleted_at is null
      and (b.user_id = ${userId} or (${firmUserId}::text is not null and b.firm_user_id = ${firmUserId}))
    order by b.updated_at desc
  `;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    industry: r.industry,
    updatedAt: toIsoTimestamp(r.updated_at),
    ownerUserId: r.user_id,
    shared: r.user_id !== userId,
    startedAt: toIsoTimestampOrNull(r.started_at),
    mapCompletedAt: toIsoTimestampOrNull(r.map_completed_at),
    reportSentAt: toIsoTimestampOrNull(r.report_sent_at),
    openFindings: Number(r.open_findings ?? 0),
    acceptedFindings: Number(r.accepted_findings ?? 0),
    lastReviewAt: toIsoTimestampOrNull(r.last_review_at),
    ownerEmail: r.owner_email,
  }));
}

export async function insertReviewEvent(
  sql: Sql,
  ownerUserId: string,
  input: ReviewEventInput,
  recordedBy: string,
): Promise<void> {
  await sql`
    insert into review_events (
      user_id, business_id, period, item_key, owner_name, due_on, result, notes, recorded_by
    )
    values (
      ${ownerUserId},
      ${input.businessId},
      ${input.period},
      ${input.itemKey},
      ${input.ownerName},
      ${input.dueOn},
      ${input.result},
      ${input.notes},
      ${recordedBy}
    )
  `;
}

export interface ReviewEventRow {
  id: number;
  period: string;
  itemKey: string;
  ownerName: string;
  result: string;
  notes: string;
  recordedAt: string;
  recordedByName: string | null;
}

export async function listReviewEvents(
  sql: Sql,
  ownerUserId: string,
  businessId: string,
): Promise<ReviewEventRow[]> {
  const rows = await sql<{
    id: number | string;
    period: string;
    item_key: string;
    owner_name: string;
    result: string;
    notes: string;
    recorded_at: string;
    recorded_by_name: string | null;
  }>`
    select r.id, r.period, r.item_key, r.owner_name, r.result, r.notes, r.recorded_at,
      u.name as recorded_by_name
    from review_events r
    left join "user" u on u.id = r.recorded_by
    where r.user_id = ${ownerUserId} and r.business_id = ${businessId}
    order by r.recorded_at desc
    limit 240
  `;
  return rows.map((r) => ({
    id: Number(r.id),
    period: r.period,
    itemKey: r.item_key,
    ownerName: r.owner_name,
    result: r.result,
    notes: r.notes,
    recordedAt: toIsoTimestamp(r.recorded_at),
    recordedByName: r.recorded_by_name,
  }));
}

/** Drop the audit rows for businesses that no longer exist (run after a purge). */
export async function deleteOrphanedClientAudit(sql: Sql): Promise<void> {
  await sql`
    delete from review_events r
    where not exists (select 1 from businesses b where b.user_id = r.user_id and b.id = r.business_id)
  `;
  await sql`
    delete from engagement_marks e
    where not exists (select 1 from businesses b where b.user_id = e.user_id and b.id = e.business_id)
  `;
}

export interface NotificationSettings {
  weeklyDigest: boolean;
  ownerReminders: boolean;
}

export async function loadNotificationSettings(
  sql: Sql,
  userId: string,
): Promise<NotificationSettings> {
  const rows = await sql<{ weekly_digest: boolean; owner_reminders: boolean }>`
    select weekly_digest, owner_reminders from notification_settings where user_id = ${userId}
  `;
  return {
    weeklyDigest: rows[0]?.weekly_digest ?? true,
    ownerReminders: rows[0]?.owner_reminders ?? true,
  };
}

export async function saveNotificationSettings(
  sql: Sql,
  userId: string,
  settings: NotificationSettings,
): Promise<void> {
  await sql`
    insert into notification_settings (user_id, weekly_digest, owner_reminders, updated_at)
    values (${userId}, ${settings.weeklyDigest}, ${settings.ownerReminders}, now())
    on conflict (user_id) do update set
      weekly_digest = excluded.weekly_digest,
      owner_reminders = excluded.owner_reminders,
      updated_at = now()
  `;
}
