import type { Sql } from "@/lib/db";
import { inTransaction } from "@/lib/sql-transaction";
import { toIsoTimestamp, toIsoTimestampOrNull } from "../iso-time";
import type { FirmPlan } from "./pricing";
import { monthKey, type ReviewItemKey, type ReviewResult } from "./reviews";
import { serverUtcDay } from "../dates";
import { RequestError } from "@/lib/request-errors";
import { randomHex } from "@/lib/web-crypto";
import { revokeDepartingMemberShares } from "../share/share-store";
import { transferBusinessesToOwner, type MovedBusiness } from "../business-store";
import { SUPPORT_EMAIL } from "../legal/operator";
import { TRUSTED_EMAIL, VOUCHED_EMAIL, X_ACCOUNT } from "./vouched-email";
import { withAuditBypass } from "./audit.server";

/**
 * A firm is keyed by its owner's account: `firms.user_id` is both the owner
 * and the firm id (`firmUserId` everywhere below). Members join through
 * `firm_members`; every member of the firm sees the businesses that carry the
 * firm on their row (`businesses.firm_user_id`).
 */
export type FirmRole = "owner" | "preparer" | "reviewer";
export type InviteRole = Exclude<FirmRole, "owner">;
export const INVITE_ROLES: readonly InviteRole[] = ["preparer", "reviewer"];

/**
 * What a client report prints for the firm: its name, the letterhead text
 * under it (address and contact as the firm writes them) and the logo as a
 * data URL. Frozen into each locked version at lock (migration 0041).
 */
export interface FirmSnapshot {
  name: string;
  letterhead: string;
  logoDataUrl: string | null;
}

export interface FirmContext {
  /** The owner's user id, which is the firm's id. */
  firmUserId: string;
  name: string;
  plan: FirmPlan;
  role: FirmRole;
  letterhead: string;
  logoDataUrl: string | null;
  /** Whether client reports open with a cover page. */
  coverPage: boolean;
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
  /** The engagement's state; "active" when no engagement row exists yet. */
  status: "active" | "ended";
  endedAt: string | null;
  /** The business is its owner's, shared with the firm (businesses.granted_at). */
  granted: boolean;
  /** The month the count below is for, YYYY-MM (the server's UTC month). */
  period: string;
  /** How many of the period's monthly checks have a result. */
  thisMonthRecorded: number;
  /** Versions this firm locked whose review was requested, neither reviewed nor returned yet. */
  awaitingReview: number;
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
  const rows = await sql<{
    firm_user_id: string;
    name: string;
    plan: string;
    role: string;
    letterhead: string;
    logo_data_url: string | null;
    cover_page: boolean;
  }>`
    select m.firm_user_id, f.name, f.plan, m.role, f.letterhead, f.logo_data_url, f.cover_page
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
    letterhead: row.letterhead,
    logoDataUrl: row.logo_data_url,
    coverPage: Boolean(row.cover_page),
  };
}

/**
 * The letterhead, logo and cover-page switch of the caller's own firm, as
 * printed on its clients' reports from now on; versions locked earlier keep
 * the copy they were locked with. A member of someone else's firm, or an
 * account with no firm, cannot set one.
 */
export async function saveFirmLetterhead(
  sql: Sql,
  userId: string,
  input: { letterhead: string; logoDataUrl: string | null; coverPage: boolean },
): Promise<FirmContext> {
  const rows = await sql`
    update firms
    set letterhead = ${input.letterhead}, logo_data_url = ${input.logoDataUrl},
      cover_page = ${input.coverPage}, updated_at = now()
    where user_id = ${userId}
    returning user_id
  `;
  if (!rows.length) throw new RequestError(404, "Set up the firm first");
  const firm = await loadFirmFor(sql, userId);
  if (!firm || firm.firmUserId !== userId) throw new RequestError(404, "Set up the firm first");
  return firm;
}

export class FirmMembershipError extends RequestError {
  constructor(message: string) {
    super(409, message);
    this.name = "FirmMembershipError";
  }
}

/** Every firm membership write retries once when Postgres picks it as a deadlock victim. */
const MEMBERSHIP_TX = { retryOnDeadlock: true } as const;

/**
 * The one lock order for firm membership writes. Call it inside the
 * transaction, before reading or writing `firm_members` or `firm_invites`:
 *
 *   1. the `"user"` rows of `accountIds` (FOR NO KEY UPDATE, sorted by id):
 *      the accounts whose membership the write checks or changes, so two
 *      writes about the same account (starting a firm and joining one, two
 *      invitations, a removal and an ownership transfer) run one after the
 *      other and the second sees the first's result;
 *   2. the firm's row in `firms` (FOR UPDATE), so seat counts, member lists
 *      and an ownership transfer, which deletes that row, never interleave.
 *
 * Members and invitations come after, never before. Pass an empty
 * `accountIds` when the write changes no account's membership (a role
 * change, an invitation). Returns false when the firm row does not exist,
 * for example because an ownership transfer committed while this
 * transaction waited: the firm now lives under the new owner's id, and the
 * caller re-reads or refuses. `firmUserId` null locks the accounts only.
 *
 * `firm_members_one_firm_per_member` (migration 0051) backs this with a
 * unique index: one non-owner membership per account.
 */
export async function lockFirmMembershipWrite(
  tx: Sql,
  input: { accountIds: readonly string[]; firmUserId: string | null },
): Promise<boolean> {
  const accounts = [...new Set(input.accountIds)].sort();
  for (const id of accounts) {
    await tx`select id from "user" where id = ${id} for no key update`;
  }
  if (input.firmUserId === null) return false;
  const firm = await tx`select user_id from firms where user_id = ${input.firmUserId} for update`;
  return firm.length > 0;
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
  // One transaction: the firm row, the owner's membership, the client
  // attachments and the grant revocations land together or not at all, so a
  // failure part-way never leaves a firm with no owner on its member list.
  return inTransaction(
    sql,
    async (tx) => {
      // The account first: an invitation accepted at the same moment waits,
      // or this save sees the membership it made and refuses.
      await lockFirmMembershipWrite(tx, { accountIds: [userId], firmUserId: userId });
      const current = await loadFirmFor(tx, userId);
      if (current && current.firmUserId !== userId) {
        throw new FirmMembershipError(
          `You are a member of ${current.name}. Leave it before starting a firm of your own.`,
        );
      }
      await tx`
      insert into firms (user_id, name, plan, updated_at)
      values (${userId}, ${name}, coalesce(${plan}::text, 'assessment'), now())
      on conflict (user_id) do update set
        name = excluded.name,
        plan = coalesce(${plan}::text, firms.plan),
        updated_at = now()
    `;
      // The owner's membership row always says owner, whatever wrote it last.
      await tx`
      insert into firm_members (firm_user_id, member_user_id, role)
      values (${userId}, ${userId}, 'owner')
      on conflict (firm_user_id, member_user_id) do update set role = 'owner'
    `;
      // The owner's own businesses become the firm's clients.
      await tx`
      update businesses set firm_user_id = ${userId}
      where user_id = ${userId} and firm_user_id is null
    `;
      // A business that works with a firm cannot take another (acceptGrant), so
      // the invitations its owner sent to other firms close with it.
      await tx`
      update business_firm_grants g set revoked_at = now()
      from businesses b
      where g.business_owner_id = ${userId} and g.accepted_at is null and g.revoked_at is null
        and b.user_id = g.business_owner_id and b.id = g.business_id and b.firm_user_id is not null
    `;
      const saved = await loadFirmFor(tx, userId);
      if (!saved) throw new Error("Unable to save the firm");
      return saved;
    },
    MEMBERSHIP_TX,
  );
}

/**
 * Sets the plan alone, as the billing webhook does. True when `firmUserId`
 * owns a firm whose row took it; false for an account that owns none.
 */
export async function setFirmPlan(sql: Sql, firmUserId: string, plan: FirmPlan): Promise<boolean> {
  const rows = await sql<{ user_id: string }>`
    update firms set plan = ${plan}, updated_at = now() where user_id = ${firmUserId}
    returning user_id
  `;
  return rows.length > 0;
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

/** Sets a member's role; returns the role they held before, or null when nobody changed. */
export async function setMemberRole(
  sql: Sql,
  firmUserId: string,
  memberUserId: string,
  role: InviteRole,
): Promise<FirmRole | null> {
  if (memberUserId === firmUserId) throw new FirmMembershipError("The owner's role cannot change.");
  return inTransaction(
    sql,
    async (tx) => {
      // The firm row first (lockFirmMembershipWrite); a firm that changed
      // owner meanwhile is no longer under this id, and nothing changes.
      if (!(await lockFirmMembershipWrite(tx, { accountIds: [], firmUserId }))) return null;
      // The joined row is read before the update, so it carries the old role.
      const rows = await tx<{ from_role: string }>`
        update firm_members m set role = ${role}
        from firm_members o
        where m.firm_user_id = ${firmUserId} and m.member_user_id = ${memberUserId}
          and m.role <> 'owner'
          and o.firm_user_id = m.firm_user_id and o.member_user_id = m.member_user_id
        returning o.role as from_role
      `;
      return rows[0] ? asRole(rows[0].from_role) : null;
    },
    MEMBERSHIP_TX,
  );
}

/**
 * Removes a member. The client businesses they set up for the firm stay with
 * it, under the owner's account (see `transferBusinessesToOwner`); the
 * businesses they kept outside the firm stay theirs. Returns what moved, or
 * null when the account was not a member and nothing changed.
 */
export async function removeMember(
  sql: Sql,
  firmUserId: string,
  memberUserId: string,
): Promise<MovedBusiness[] | null> {
  if (memberUserId === firmUserId) throw new FirmMembershipError("Nobody can remove the owner.");
  return detachMember(sql, firmUserId, memberUserId);
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
  return inTransaction(
    sql,
    async (tx) => {
      // The firm row first, so the seat count below holds until this commits.
      if (!(await lockFirmMembershipWrite(tx, { accountIds: [], firmUserId: input.firmUserId }))) {
        throw new RequestError(404, "Set up the firm first");
      }
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
    },
    MEMBERSHIP_TX,
  );
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

/**
 * Withdraws an invitation nobody accepted yet. True when one went; false for
 * an unknown token, one revoked already, or one accepted, whose row stays as
 * the record of who joined by it.
 */
export async function revokeInvite(sql: Sql, firmUserId: string, token: string): Promise<boolean> {
  const rows = await sql<{ token: string }>`
    delete from firm_invites
    where firm_user_id = ${firmUserId} and token = ${token} and accepted_at is null
    returning token
  `;
  return rows.length > 0;
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
 *     sign-up, or X, whose sign-in carries a made-up address), so it cannot
 *     join: joining needs a confirmed address that is the invited one, from a
 *     Google sign-in or a confirmed email-and-password account.
 */
export type InviteFit = "match" | "mismatch" | "confirm";

export async function accountFit(
  sql: Sql,
  userId: string,
  invitedEmail: string,
): Promise<{ fit: InviteFit; accountEmail: string }> {
  const rows = await sql.query<{ email: string; real: boolean }>(
    `select u.email, ${VOUCHED_EMAIL("u")} as real from "user" u where u.id = $1`,
    [userId],
  );
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
): Promise<AcceptedInvite> {
  return inTransaction(
    sql,
    async (tx) => {
      const openInvite = async (lock: boolean) => {
        const rows = await tx.query<{ firm_user_id: string; role: string; email: string }>(
          `select firm_user_id, role, email from firm_invites
         where token = $1 and accepted_at is null and expires_at > now()${lock ? " for update" : ""}`,
          [token],
        );
        const found = rows[0];
        if (!found) {
          throw new FirmMembershipError("This invitation has expired or someone already used it.");
        }
        if (found.firm_user_id === userId) {
          throw new FirmMembershipError(
            "You own this firm, so this invitation is not for you. Send the link to the firm member it names.",
          );
        }
        return found;
      };
      // The lock order of every membership write (lockFirmMembershipWrite):
      // this account, then the firm, then the invitation. The invitation names
      // the firm, so it is read once unlocked to learn which firm to lock, and
      // again under the lock. An ownership transfer that committed in between
      // moved the invitation to the new owner's firm: lock that one instead.
      let firmUserId = (await openInvite(false)).firm_user_id;
      let invite = null as Awaited<ReturnType<typeof openInvite>> | null;
      for (let attempt = 0; attempt < 3 && !invite; attempt += 1) {
        await lockFirmMembershipWrite(tx, { accountIds: [userId], firmUserId });
        const locked = await openInvite(true);
        if (locked.firm_user_id === firmUserId) invite = locked;
        else firmUserId = locked.firm_user_id;
      }
      if (!invite) {
        throw new FirmMembershipError(
          "The firm changed owner while you joined. Open the invitation again.",
        );
      }
      const { fit, accountEmail } = await accountFit(tx, userId, invite.email);
      if (fit !== "match") {
        throw new FirmMembershipError(
          fit === "mismatch"
            ? `The firm sent this invitation to ${maskEmail(invite.email)}, and you are signed in as ${accountEmail}. Sign in with the invited address, or ask the firm owner to invite ${accountEmail}.`
            : `Precog cannot vouch for this account's address. Joining a firm needs a confirmed address that is the invited one: sign in with Google under ${maskEmail(invite.email)}, or with an email-and-password account you have confirmed, then open the invitation again.`,
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
      return { firm: joined };
    },
    MEMBERSHIP_TX,
  );
}

/**
 * A member leaves; the client businesses they set up stay with the firm, as
 * on removal. The owner cannot leave. Returns what moved, or null when the
 * account was no longer a member.
 */
export async function leaveFirm(
  sql: Sql,
  firmUserId: string,
  userId: string,
): Promise<MovedBusiness[] | null> {
  if (firmUserId === userId) throw new FirmMembershipError("The owner cannot leave the firm.");
  return detachMember(sql, firmUserId, userId);
}

/**
 * Ends a membership and hands the member's firm clients (live and deleted)
 * to the owner's account. The member's share links to the firm's clients,
 * their own included, are revoked before the hand-over, while the rows still
 * name them; colleagues' links to those clients keep working, since the
 * clients stay. Null, with nothing changed, when the account was not a
 * member (a repeated removal, or one that raced another).
 */
async function detachMember(
  sql: Sql,
  firmUserId: string,
  memberUserId: string,
): Promise<MovedBusiness[] | null> {
  return inTransaction(
    sql,
    async (tx) => {
      // Both accounts, then the firm (lockFirmMembershipWrite), as an
      // ownership transfer locks them; a firm that changed owner meanwhile is
      // no longer under this id, and nothing changes.
      const firm = await lockFirmMembershipWrite(tx, {
        accountIds: [firmUserId, memberUserId],
        firmUserId,
      });
      if (!firm) return null;
      const removed = await tx<{ member_user_id: string }>`
        delete from firm_members
        where firm_user_id = ${firmUserId} and member_user_id = ${memberUserId} and role <> 'owner'
        returning member_user_id
      `;
      if (!removed.length) return null;
      await revokeDepartingMemberShares(tx, firmUserId, memberUserId);
      return transferBusinessesToOwner(tx, { firmUserId, memberUserId });
    },
    MEMBERSHIP_TX,
  );
}

/**
 * Hands the firm to one of its members, in one transaction. The firm is
 * keyed by its owner's account, so the move is a new `firms` row under the
 * new owner, every row that names the firm repointed (members, invitations,
 * client businesses, deletion markers, which are `on delete set null` and so
 * go before the old row), the billing row moved, the client invitations it
 * accepted and the versions locked for it repointed, and the old `firms` row
 * deleted last. The firm's settings (letterhead, cover page, retention) move,
 * and so does its activity log (under the audit bypass, the third of its
 * three sites). The new owner's role becomes owner and the old owner's
 * reviewer. Refused while the firm's payment is overdue or disputed, for a
 * non-member, for someone who owns a firm, and for someone who already has
 * a billing record (impossible through the product; Support untangles it).
 * The old owner's own firm clients move to the new owner's account, as a
 * departing member's do (`transferBusinessesToOwner`); returns what moved.
 * The Stripe side (customer and subscription metadata) is the caller's.
 */
export async function transferFirmOwnership(
  sql: Sql,
  firmUserId: string,
  newOwnerUserId: string,
): Promise<MovedBusiness[]> {
  if (newOwnerUserId === firmUserId) {
    throw new FirmMembershipError("You already own this firm.");
  }
  return inTransaction(
    sql,
    async (tx) => {
      const locked = await lockFirmMembershipWrite(tx, {
        accountIds: [firmUserId, newOwnerUserId],
        firmUserId,
      });
      if (!locked) throw new RequestError(404, "Set up the firm first");
      const firms = await tx<{
        name: string;
        plan: string;
        letterhead: string;
        logo_data_url: string | null;
        cover_page: boolean;
        retention_years: number | string;
      }>`
      select name, plan, letterhead, logo_data_url, cover_page, retention_years
      from firms where user_id = ${firmUserId} for update
    `;
      const firm = firms[0];
      if (!firm) throw new RequestError(404, "Set up the firm first");
      const people = await tx<{ name: string | null; email: string }>`
      select name, email from "user" where id = ${newOwnerUserId}
    `;
      const name = people[0]?.name || people[0]?.email || "That account";
      const member = await tx`
      select 1 from firm_members
      where firm_user_id = ${firmUserId} and member_user_id = ${newOwnerUserId}
    `;
      if (!member.length) throw new FirmMembershipError(`${name} is not a member of ${firm.name}.`);
      const owns = await tx`select 1 from firms where user_id = ${newOwnerUserId}`;
      if (owns.length) throw new FirmMembershipError(`${name} already owns a firm.`);
      const billing = await tx<{ subscription_status: string | null; disputed: boolean }>`
      select subscription_status, assessment_disputed_at is not null as disputed
      from billing_accounts where user_id = ${firmUserId} for update
    `;
      if (billing[0]?.subscription_status === "past_due" || billing[0]?.disputed) {
        throw new FirmMembershipError(
          `The firm cannot change owner while its payment is overdue or a payment is disputed. Fix that in Manage billing first, or write to ${SUPPORT_EMAIL}.`,
        );
      }
      const theirs = await tx`select 1 from billing_accounts where user_id = ${newOwnerUserId}`;
      if (theirs.length) {
        throw new FirmMembershipError(
          `${name} already has a billing record, so Precog cannot move the firm's billing to them. Write to ${SUPPORT_EMAIL}.`,
        );
      }
      await tx`
      insert into firms
        (user_id, name, plan, letterhead, logo_data_url, cover_page, retention_years, updated_at)
      values (${newOwnerUserId}, ${firm.name}, ${firm.plan}, ${firm.letterhead},
        ${firm.logo_data_url}, ${firm.cover_page}, ${Number(firm.retention_years)}, now())
    `;
      await tx`update firm_members set firm_user_id = ${newOwnerUserId} where firm_user_id = ${firmUserId}`;
      await tx`
      update firm_members set role = case member_user_id
        when ${newOwnerUserId} then 'owner' when ${firmUserId} then 'reviewer' else role end
      where firm_user_id = ${newOwnerUserId}
    `;
      await tx`update firm_invites set firm_user_id = ${newOwnerUserId} where firm_user_id = ${firmUserId}`;
      await tx`update businesses set firm_user_id = ${newOwnerUserId} where firm_user_id = ${firmUserId}`;
      await tx`
      update business_deletion_markers set firm_user_id = ${newOwnerUserId}
      where firm_user_id = ${firmUserId}
    `;
      // The old owner's own firm clients (live, deleted and purged) go to the
      // new owner's account, as a departing member's do: the firm keeps them,
      // and the old owner keeps working on them as a reviewer. A client the
      // firm reaches by its owner's invitation (granted_at set) stays with
      // that owner; the update above re-pointed the firm's link to it.
      const moved = await transferBusinessesToOwner(tx, {
        firmUserId: newOwnerUserId,
        memberUserId: firmUserId,
      });
      await tx`update billing_accounts set user_id = ${newOwnerUserId}, updated_at = now() where user_id = ${firmUserId}`;
      // Client invitations accepted by the firm, and the versions locked for it,
      // follow the firm (its id is its owner's), before the old row goes.
      await tx`
      update business_firm_grants set firm_user_id = ${newOwnerUserId}
      where firm_user_id = ${firmUserId}
    `;
      await tx`
      update report_versions set firm_user_id = ${newOwnerUserId}
      where firm_user_id = ${firmUserId}
    `;
      // The log is keyed by the firm's id too; it follows the firm, so the
      // firm's history outlives the previous owner's account.
      await withAuditBypass(tx);
      await tx`
      update firm_audit_log set firm_user_id = ${newOwnerUserId}
      where firm_user_id = ${firmUserId}
    `;
      await tx`delete from firms where user_id = ${firmUserId}`;
      return moved;
    },
    MEMBERSHIP_TX,
  );
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

/**
 * The firm's client table: one row per live business the account or its firm
 * holds, with the engagement state, the month's monthly checks recorded and
 * the locked versions awaiting review. `today` (YYYY-MM-DD, the server's UTC
 * day) picks the month.
 */
export async function listClientEngagements(
  sql: Sql,
  userId: string,
  firmUserId: string | null,
  today: string = serverUtcDay(),
): Promise<ClientEngagementRow[]> {
  const period = monthKey(today);
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
    status: string | null;
    ended_at: string | null;
    granted: boolean;
    this_month_recorded: number | string | null;
    awaiting_review: number | string;
  }>`
    select
      b.id, b.user_id, b.name, e.started_at, e.map_completed_at, e.report_sent_at,
      e.open_findings, e.accepted_findings, e.owner_email, e.owner_email_token,
      e.owner_email_confirmed_at, e.owner_email_unsubscribed_at,
      e.status, e.ended_at, b.granted_at is not null as granted,
      r.last_review_at, r.this_month_recorded,
      (
        select count(*) from report_versions v
        where v.user_id = b.user_id and v.business_id = b.id
          -- Only versions this firm locked: after a hand-back and a new
          -- grant, the earlier firm's versions are not this firm's to review.
          and (v.firm_user_id = b.firm_user_id or (v.firm_user_id is null and b.granted_at is null))
          and v.review_requested_at is not null
          and v.reviewed_at is null
          and v.returned_at is null
      ) as awaiting_review
    from businesses b
    left join engagement_marks e
      on e.user_id = b.user_id and e.business_id = b.id
    left join lateral (
      select max(x.recorded_at) as last_review_at,
        count(distinct x.item_key) filter (where x.period = ${period}) as this_month_recorded
      from review_events x
      where x.user_id = b.user_id and x.business_id = b.id
    ) r on true
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
    status: r.status === "ended" ? "ended" : "active",
    endedAt: toIsoTimestampOrNull(r.ended_at),
    granted: Boolean(r.granted),
    period,
    thisMonthRecorded: Number(r.this_month_recorded ?? 0),
    awaitingReview: Number(r.awaiting_review),
  }));
}

export async function insertReviewEvent(
  sql: Sql,
  ownerUserId: string,
  input: ReviewEventInput,
  recordedBy: string,
): Promise<void> {
  const { lockEngagementWriteAccess } = await import("./engagement-store");
  await inTransaction(sql, async (tx) => {
    await lockEngagementWriteAccess(tx, ownerUserId, input.businessId, recordedBy);
    await tx`
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
  });
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
  // No row means the account never chose: the digest is off until it does.
  return {
    weeklyDigest: rows[0]?.weekly_digest ?? false,
    ownerReminders: rows[0]?.owner_reminders ?? true,
  };
}

export async function saveNotificationSettings(
  sql: Sql,
  userId: string,
  settings: NotificationSettings,
): Promise<void> {
  // Choosing on the firm page counts as having been asked about the digest.
  await sql`
    insert into notification_settings (user_id, weekly_digest, owner_reminders, digest_asked_at, updated_at)
    values (${userId}, ${settings.weeklyDigest}, ${settings.ownerReminders}, now(), now())
    on conflict (user_id) do update set
      weekly_digest = excluded.weekly_digest,
      owner_reminders = excluded.owner_reminders,
      digest_asked_at = coalesce(notification_settings.digest_asked_at, now()),
      updated_at = now()
  `;
}

/**
 * Whether the account has been asked, once, about the weekly digest. A row
 * saved before the question existed counts as asked: the account already
 * chose on the firm page.
 */
export async function loadDigestAsk(sql: Sql, userId: string): Promise<{ asked: boolean }> {
  const rows = await sql<{ one: number }>`
    select 1 as one from notification_settings where user_id = ${userId}
  `;
  return { asked: rows.length > 0 };
}

/**
 * The account's answer to the one-time digest question. Only the digest
 * column is written: owner reminders keep their stored value, or their
 * default on a new row.
 */
export async function answerDigestAsk(
  sql: Sql,
  userId: string,
  weeklyDigest: boolean,
): Promise<void> {
  await sql`
    insert into notification_settings (user_id, weekly_digest, digest_asked_at, updated_at)
    values (${userId}, ${weeklyDigest}, now(), now())
    on conflict (user_id) do update set
      weekly_digest = excluded.weekly_digest,
      digest_asked_at = now(),
      updated_at = now()
  `;
}

/**
 * The token the digest's stop link carries for this account, minted on first
 * use. Whoever holds it can turn the digest off, and nothing else.
 */
export async function digestTokenFor(sql: Sql, userId: string): Promise<string> {
  const rows = await sql<{ digest_token: string | null }>`
    select digest_token from notification_settings where user_id = ${userId}
  `;
  if (rows[0]?.digest_token) return rows[0].digest_token;
  const token = randomHex(24);
  const saved = await sql<{ digest_token: string }>`
    insert into notification_settings (user_id, digest_token, updated_at)
    values (${userId}, ${token}, now())
    on conflict (user_id) do update set
      digest_token = coalesce(notification_settings.digest_token, excluded.digest_token),
      updated_at = now()
    returning digest_token
  `;
  return saved[0].digest_token;
}

/**
 * Why the weekly digest cannot reach this account's address, or null when it
 * can (TRUSTED_EMAIL, the digest's own rule): "x_only" for an account whose
 * only sign-in is X, whose address the broker makes up; "unconfirmed" for
 * any other address Precog cannot vouch for. Also null for an unknown account.
 */
export async function digestAddressProblem(
  sql: Sql,
  userId: string,
): Promise<"x_only" | "unconfirmed" | null> {
  const rows = await sql.query<{ trusted: boolean; x_only: boolean }>(
    `select ${TRUSTED_EMAIL("u")} as trusted,
      (${X_ACCOUNT("u")} and not exists (
        select 1 from account a
        where a."userId" = u.id and a."providerId" in ('credential', 'grok-google')
      )) as x_only
    from "user" u where u.id = $1`,
    [userId],
  );
  const row = rows[0];
  if (!row || row.trusted) return null;
  return row.x_only ? "x_only" : "unconfirmed";
}

/** Turns the digest off for the account the token names; false for an unknown token. */
export async function stopDigestByToken(sql: Sql, token: string): Promise<boolean> {
  const rows = await sql<{ user_id: string }>`
    update notification_settings set weekly_digest = false, updated_at = now()
    where digest_token = ${token}
    returning user_id
  `;
  return rows.length > 0;
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
