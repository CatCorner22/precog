import type { Sql } from "@/lib/db";
import { inTransaction } from "@/lib/sql-transaction";
import { toIsoTimestamp, toIsoTimestampOrNull } from "../iso-time";
import type { FirmPlan } from "./pricing";
import type { ReviewItemKey, ReviewResult } from "./reviews";
import { RequestError } from "@/lib/request-errors";
import { randomHex } from "@/lib/web-crypto";
import { revokeDepartingMemberShares } from "../share/share-store";

/**
 * A firm is keyed by its owner's account: `firms.user_id` is both the owner
 * and the firm id (`firmUserId` everywhere below). Members join through
 * `firm_members`; every member of the firm sees the businesses that carry the
 * firm on their row (`businesses.firm_user_id`).
 */
export type FirmRole = "owner" | "preparer" | "reviewer";
export type InviteRole = Exclude<FirmRole, "owner">;
export const INVITE_ROLES: readonly InviteRole[] = ["preparer", "reviewer"];

export interface FirmContext {
  /** The owner's user id, which is the firm's id. */
  firmUserId: string;
  name: string;
  plan: FirmPlan;
  role: FirmRole;
}

export interface FirmMember {
  userId: string;
  name: string;
  email: string;
  role: FirmRole;
  joinedAt: string;
}

/** An open invitation: not yet accepted, not yet expired. */
export interface FirmInvite {
  token: string;
  email: string;
  role: InviteRole;
  createdAt: string;
  expiresAt: string;
}

export interface ClientEngagementRow {
  id: string;
  name: string;
  ownerUserId: string;
  shared: boolean;
  /** The engagement stamps as last posted; the firm page posts again when its own differ. */
  startedAt: string | null;
  mapCompletedAt: string | null;
  reportSentAt: string | null;
  /** Null until someone opens the client on the firm page and its conflicts are counted. */
  openFindings: number | null;
  acceptedFindings: number;
  lastReviewAt: string | null;
  ownerEmail: string | null;
  /** Whether reminders reach `ownerEmail`: only after its owner confirms, until they stop them. */
  ownerEmailStatus: OwnerEmailStatus | null;
}

/** "unsent": saved before confirmation existed, so no link has gone out yet. */
export type OwnerEmailStatus = "unsent" | "waiting" | "confirmed" | "stopped";

interface ReviewEventInput {
  businessId: string;
  period: string;
  itemKey: ReviewItemKey;
  ownerName: string;
  dueOn: string | null;
  result: ReviewResult;
  notes: string;
}

export interface NotificationSettings {
  weeklyDigest: boolean;
  ownerReminders: boolean;
}

const INVITE_TTL_DAYS = 14;
const MAX_MEMBERS_PER_FIRM = 25;

/** The firm `userId` works in: their own when they own one, else the one they joined. */
export async function loadFirmFor(sql: Sql, userId: string): Promise<FirmContext | null> {
  const rows = await sql<{ firm_user_id: string; name: string; plan: string; role: string }>`
    select m.firm_user_id, f.name, f.plan, m.role
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
  };
}

export class FirmMembershipError extends RequestError {
  constructor(message: string) {
    super(409, message);
    this.name = "FirmMembershipError";
  }
}

/**
 * Creates or renames the caller's own firm. A null plan keeps the stored one
 * (a new firm starts on the assessment). A member of another firm cannot
 * start one.
 */
export async function saveFirm(
  sql: Sql,
  userId: string,
  name: string,
  plan: FirmPlan | null,
): Promise<FirmContext> {
  const current = await loadFirmFor(sql, userId);
  if (current && current.firmUserId !== userId) {
    throw new FirmMembershipError(
      `You are a member of ${current.name}. Leave it before starting a firm of your own.`,
    );
  }
  const rows = await sql<{ name: string; plan: string }>`
    insert into firms (user_id, name, plan, updated_at)
    values (${userId}, ${name}, coalesce(${plan}::text, 'assessment'), now())
    on conflict (user_id) do update set
      name = excluded.name,
      plan = coalesce(${plan}::text, firms.plan),
      updated_at = now()
    returning name, plan
  `;
  // The owner's membership row always says owner, whatever wrote it last.
  await sql`
    insert into firm_members (firm_user_id, member_user_id, role)
    values (${userId}, ${userId}, 'owner')
    on conflict (firm_user_id, member_user_id) do update set role = 'owner'
  `;
  // The owner's own businesses become the firm's clients.
  await sql`
    update businesses set firm_user_id = ${userId}
    where user_id = ${userId} and firm_user_id is null
  `;
  const row = rows[0];
  return { firmUserId: userId, name: row.name, plan: asPlan(row.plan), role: "owner" };
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
  role: InviteRole,
): Promise<void> {
  if (memberUserId === firmUserId) throw new FirmMembershipError("The owner's role cannot change.");
  await sql`
    update firm_members set role = ${role}
    where firm_user_id = ${firmUserId} and member_user_id = ${memberUserId} and role <> 'owner'
  `;
}

/**
 * Removes a member. The businesses they own leave the firm with them, so the
 * firm keeps no access to a departed colleague's clients.
 */
export async function removeMember(
  sql: Sql,
  firmUserId: string,
  memberUserId: string,
): Promise<void> {
  if (memberUserId === firmUserId) throw new FirmMembershipError("Nobody can remove the owner.");
  await detachMember(sql, firmUserId, memberUserId);
}

/**
 * An open invitation to `email`. Asking again for the same address and role
 * returns the open invitation; a different role replaces it. Open
 * invitations count toward the member limit.
 */
export async function createInvite(
  sql: Sql,
  input: { firmUserId: string; email: string; role: InviteRole; token: string },
): Promise<FirmInvite> {
  const email = input.email.toLowerCase();
  return inTransaction(sql, async (tx) => {
    const open = (await listInvites(tx, input.firmUserId)).find((i) => i.email === email);
    if (open?.role === input.role) return open;
    if (open) await revokeInvite(tx, input.firmUserId, open.token);
    const seats = await tx<{ n: number | string }>`
      select
        (select count(*) from firm_members where firm_user_id = ${input.firmUserId})
        + (select count(*) from firm_invites
           where firm_user_id = ${input.firmUserId} and accepted_at is null and expires_at > now())
        as n
    `;
    if (Number(seats[0]?.n ?? 0) >= MAX_MEMBERS_PER_FIRM) {
      throw new FirmMembershipError(
        `A firm holds at most ${MAX_MEMBERS_PER_FIRM} members, counting open invitations. Revoke an invitation or remove a member first.`,
      );
    }
    const rows = await tx<{ created_at: string; expires_at: string }>`
      insert into firm_invites (token, firm_user_id, email, role, expires_at)
      values (
        ${input.token}, ${input.firmUserId}, ${email}, ${input.role},
        now() + make_interval(days => ${INVITE_TTL_DAYS}::int)
      )
      returning created_at, expires_at
    `;
    return {
      token: input.token,
      email,
      role: input.role,
      createdAt: toIsoTimestamp(rows[0].created_at),
      expiresAt: toIsoTimestamp(rows[0].expires_at),
    };
  });
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
    role: asInviteRole(r.role),
    createdAt: toIsoTimestamp(r.created_at),
    expiresAt: toIsoTimestamp(r.expires_at),
  }));
}

export async function revokeInvite(sql: Sql, firmUserId: string, token: string): Promise<void> {
  await sql`delete from firm_invites where firm_user_id = ${firmUserId} and token = ${token}`;
}

/**
 * What an invitation link shows before the visitor accepts it. Anyone holding
 * the link sees it, so the invited address comes back masked.
 */
export async function peekInvite(
  sql: Sql,
  token: string,
): Promise<{ firmName: string; role: InviteRole; email: string } | null> {
  const rows = await sql<{ name: string; role: string; email: string }>`
    select f.name, i.role, i.email
    from firm_invites i join firms f on f.user_id = i.firm_user_id
    where i.token = ${token} and i.accepted_at is null and i.expires_at > now()
  `;
  const row = rows[0];
  return row
    ? { firmName: row.name, role: asInviteRole(row.role), email: maskEmail(row.email) }
    : null;
}

/** "alice@cpa.com" -> "a***@cpa.com". */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) return "***";
  return `${email[0]}***${email.slice(at)}`;
}

/**
 * How the signed-in account fits an invitation:
 *   - "match": its address is confirmed and is the invited one;
 *   - "mismatch": its address is confirmed and real but another one, so the
 *     invitation is not for it;
 *   - "confirm": Precog cannot vouch for its address (an unconfirmed password
 *     sign-up, or X, whose sign-in carries a made-up address), so the person
 *     must say they are the one invited, and the firm owner hears of it.
 */
export type InviteFit = "match" | "mismatch" | "confirm";

async function accountFit(
  sql: Sql,
  userId: string,
  invitedEmail: string,
): Promise<{ fit: InviteFit; accountEmail: string }> {
  const rows = await sql<{ email: string; real: boolean }>`
    select u.email,
      (u."emailVerified" and (
        exists (
          select 1 from account a
          where a."userId" = u.id and a."providerId" in ('credential', 'grok-google')
        )
        or not exists (
          select 1 from account a where a."userId" = u.id and a."providerId" = 'grok-x'
        )
      )) as real
    from "user" u where u.id = ${userId}
  `;
  const account = rows[0];
  if (!account) throw new FirmMembershipError("Sign in to join the firm.");
  const same = account.email.toLowerCase() === invitedEmail.toLowerCase();
  const fit: InviteFit = !account.real ? "confirm" : same ? "match" : "mismatch";
  return { fit, accountEmail: account.email };
}

/** How the signed-in account fits an open invitation; null when the invitation is not open. */
export async function inviteFit(
  sql: Sql,
  token: string,
  userId: string,
): Promise<{ fit: InviteFit; accountEmail: string } | null> {
  const rows = await sql<{ email: string }>`
    select email from firm_invites
    where token = ${token} and accepted_at is null and expires_at > now()
  `;
  return rows[0] ? accountFit(sql, userId, rows[0].email) : null;
}

export interface AcceptedInvite {
  firm: FirmContext;
  /** Set when Precog could not match the account to the invited address; the firm owner is told. */
  unmatched: { invitedEmail: string; accountEmail: string } | null;
}

/**
 * The signed-in visitor joins the firm the token names only when the
 * account's confirmed email is the invited address. An unconfirmed address,
 * or a confirmed address that is not the invited one, does not join.
 * A person already in another firm is refused (one account, one firm), and
 * so is the firm's own owner, whose role an invitation must never replace.
 * A new member must fit under the member limit.
 */
export async function acceptInvite(
  sql: Sql,
  token: string,
  userId: string,
  _options: { confirmOtherEmail?: boolean } = {},
): Promise<AcceptedInvite> {
  return inTransaction(sql, async (tx) => {
    const invites = await tx<{ firm_user_id: string; role: string; email: string }>`
      select firm_user_id, role, email from firm_invites
      where token = ${token} and accepted_at is null and expires_at > now()
      for update
    `;
    const invite = invites[0];
    if (!invite) {
      throw new FirmMembershipError("This invitation has expired or someone already used it.");
    }
    if (invite.firm_user_id === userId) {
      throw new FirmMembershipError(
        "You own this firm, so this invitation is not for you. Send the link to the firm member it names.",
      );
    }
    const { fit, accountEmail } = await accountFit(tx, userId, invite.email);
    if (fit !== "match") {
      throw new FirmMembershipError(
        fit === "mismatch"
          ? `The firm sent this invitation to ${maskEmail(invite.email)}, and you are signed in as ${accountEmail}. Sign in with the invited address, or ask the firm owner to invite ${accountEmail}.`
          : `Precog cannot match this account to ${maskEmail(invite.email)}. Confirm that email on this account, then open the invitation again.`,
      );
    }
    const current = await loadFirmFor(tx, userId);
    if (current && current.firmUserId !== invite.firm_user_id) {
      throw new FirmMembershipError(
        `You already belong to ${current.name}. Leave it before joining another firm.`,
      );
    }
    if (!current) {
      const members = await tx<{ n: number | string }>`
        select count(*) as n from firm_members where firm_user_id = ${invite.firm_user_id}
      `;
      if (Number(members[0]?.n ?? 0) >= MAX_MEMBERS_PER_FIRM) {
        throw new FirmMembershipError(
          `This firm already has ${MAX_MEMBERS_PER_FIRM} members, the most it can hold. Ask the owner to make room.`,
        );
      }
    }
    await tx`
      insert into firm_members (firm_user_id, member_user_id, role)
      values (${invite.firm_user_id}, ${userId}, ${asInviteRole(invite.role)})
      on conflict (firm_user_id, member_user_id) do update set role = excluded.role
        where firm_members.role <> 'owner'
    `;
    await tx`
      update firm_invites set accepted_by = ${userId}, accepted_at = now() where token = ${token}
    `;
    const joined = await loadFirmFor(tx, userId);
    if (!joined) throw new Error("Unable to join the firm");
    return {
      firm: joined,
      unmatched: null,
    };
  });
}

/** A member leaves, taking the businesses they own with them; the owner cannot leave. */
export async function leaveFirm(sql: Sql, firmUserId: string, userId: string): Promise<void> {
  if (firmUserId === userId) throw new FirmMembershipError("The owner cannot leave the firm.");
  await detachMember(sql, firmUserId, userId);
}

/**
 * Ends a membership and takes the member's own businesses (live and deleted)
 * out of the firm. Share links that crossed the line (the member's links to
 * the firm's clients, colleagues' links to the member's businesses) are
 * revoked first, while the businesses still name the firm.
 */
async function detachMember(sql: Sql, firmUserId: string, memberUserId: string): Promise<void> {
  await inTransaction(sql, async (tx) => {
    await revokeDepartingMemberShares(tx, firmUserId, memberUserId);
    await tx`
      delete from firm_members
      where firm_user_id = ${firmUserId} and member_user_id = ${memberUserId} and role <> 'owner'
    `;
    await tx`
      update businesses set firm_user_id = null
      where user_id = ${memberUserId} and firm_user_id = ${firmUserId}
    `;
    await tx`
      update business_deletion_markers set firm_user_id = null
      where user_id = ${memberUserId} and firm_user_id = ${firmUserId}
    `;
  });
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

/** Confirmation emails one account may cause in a day by setting owner addresses. */
export const MAX_OWNER_EMAIL_REQUESTS_PER_DAY = 20;

/**
 * The client owner's address for reminders; null clears it. A new address,
 * or one not confirmed yet, gets a fresh token, returned so the caller can
 * email the confirmation link; reminders wait until the owner opens it.
 * Each such request counts toward the daily limit of `requestedBy`. Saving
 * the confirmed address again changes nothing, and an address whose owner
 * stopped reminders is saved as stopped, with no email.
 */
export async function setOwnerEmail(
  sql: Sql,
  ownerUserId: string,
  businessId: string,
  email: string | null,
  requestedBy: string,
): Promise<{ confirmToken: string | null; stopped: boolean }> {
  return inTransaction(sql, async (tx) => {
    if (!email) {
      await tx`
        update engagement_marks set owner_email = null, owner_email_token = null,
          owner_email_confirmed_at = null, owner_email_unsubscribed_at = null
        where user_id = ${ownerUserId} and business_id = ${businessId}
      `;
      return { confirmToken: null, stopped: false };
    }
    const current = await tx<{ owner_email: string | null; confirmed: boolean }>`
      select owner_email,
        (owner_email_confirmed_at is not null and owner_email_unsubscribed_at is null) as confirmed
      from engagement_marks
      where user_id = ${ownerUserId} and business_id = ${businessId}
      for update
    `;
    if (current[0]?.owner_email === email && current[0].confirmed) {
      return { confirmToken: null, stopped: false };
    }
    // The owner stopped reminders to this address: record it as stopped,
    // under the token their links carry, and send nothing.
    const stop = await tx<{ token: string; stopped_at: string }>`
      select token, stopped_at from owner_email_stops
      where user_id = ${ownerUserId} and business_id = ${businessId} and email = ${email}
    `;
    if (stop[0]) {
      await tx`
        insert into engagement_marks (user_id, business_id, owner_email, owner_email_token,
          owner_email_unsubscribed_at)
        values (${ownerUserId}, ${businessId}, ${email}, ${stop[0].token}, ${stop[0].stopped_at})
        on conflict (user_id, business_id) do update set
          owner_email = excluded.owner_email,
          owner_email_token = excluded.owner_email_token,
          owner_email_confirmed_at = null,
          owner_email_unsubscribed_at = excluded.owner_email_unsubscribed_at
      `;
      return { confirmToken: null, stopped: true };
    }
    const recent = await tx<{ n: number | string }>`
      select count(*) as n from owner_email_requests
      where user_id = ${requestedBy} and requested_at > now() - interval '1 day'
    `;
    if (Number(recent[0]?.n ?? 0) >= MAX_OWNER_EMAIL_REQUESTS_PER_DAY) {
      throw new RequestError(
        429,
        `Precog sends at most ${MAX_OWNER_EMAIL_REQUESTS_PER_DAY} owner confirmation emails a day for one account. Try again tomorrow.`,
      );
    }
    await tx`insert into owner_email_requests (user_id) values (${requestedBy})`;
    const token = randomHex(24);
    await tx`
      insert into engagement_marks (user_id, business_id, owner_email, owner_email_token)
      values (${ownerUserId}, ${businessId}, ${email}, ${token})
      on conflict (user_id, business_id) do update set
        owner_email = excluded.owner_email,
        owner_email_token = excluded.owner_email_token,
        owner_email_confirmed_at = null,
        owner_email_unsubscribed_at = null
    `;
    return { confirmToken: token, stopped: false };
  });
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
    started_at: string | null;
    map_completed_at: string | null;
    report_sent_at: string | null;
    open_findings: number | string | null;
    accepted_findings: number | string | null;
    last_review_at: string | null;
    owner_email: string | null;
    owner_email_token: string | null;
    owner_email_confirmed_at: string | null;
    owner_email_unsubscribed_at: string | null;
  }>`
    select
      b.id, b.user_id, b.name, e.started_at, e.map_completed_at, e.report_sent_at,
      e.open_findings, e.accepted_findings, e.owner_email, e.owner_email_token,
      e.owner_email_confirmed_at, e.owner_email_unsubscribed_at,
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
    ownerUserId: r.user_id,
    shared: r.user_id !== userId,
    startedAt: toIsoTimestampOrNull(r.started_at),
    mapCompletedAt: toIsoTimestampOrNull(r.map_completed_at),
    reportSentAt: toIsoTimestampOrNull(r.report_sent_at),
    openFindings: r.open_findings === null ? null : Number(r.open_findings),
    acceptedFindings: Number(r.accepted_findings ?? 0),
    lastReviewAt: toIsoTimestampOrNull(r.last_review_at),
    ownerEmail: r.owner_email,
    ownerEmailStatus: !r.owner_email
      ? null
      : r.owner_email_unsubscribed_at
        ? "stopped"
        : r.owner_email_confirmed_at
          ? "confirmed"
          : r.owner_email_token
            ? "waiting"
            : "unsent",
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

function asPlan(value: string): FirmPlan {
  return value === "monthly" ? "monthly" : "assessment";
}

function asRole(value: string): FirmRole {
  return value === "owner" ? "owner" : asInviteRole(value);
}

function asInviteRole(value: string): InviteRole {
  return value === "reviewer" ? "reviewer" : "preparer";
}
