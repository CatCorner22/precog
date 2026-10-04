import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { RequestError, requireObject } from "@/lib/request-errors";
import { randomHex } from "@/lib/web-crypto";
import { isBusinessId } from "../profile-input";
import {
  keepVersionBeforeRestore,
  listBusinessHistory,
  listDeletedBusinesses,
  loadBusinessHistoryVersion,
  restoreBusinessRow,
} from "../business-store";
import { mergeProfile } from "../profile-merge";
import { isCalendarDate, resolveClientDate } from "../dates";
import type { PracticeProfile } from "../practice-profile";
import type { StoredReportModel } from "../report/stored-model";
import type { FirmPlan } from "./pricing";
import {
  requireBusinessOwner,
  requireFirm,
  requireFirmRole,
  requireReportVersion,
} from "./access.server";
import {
  acceptInvite,
  createInvite,
  insertReviewEvent,
  inviteFit,
  leaveFirm as leaveFirmRow,
  listClientEngagements,
  listInvites,
  listMembers,
  loadFirmFor,
  loadNotificationSettings,
  peekInvite,
  removeMember,
  revokeInvite,
  saveFirm,
  saveNotificationSettings,
  setMemberRole,
  setOwnerEmail,
  upsertEngagementMark,
  type AcceptedInvite,
  type FirmContext,
  type InviteRole,
} from "./store";
import {
  listReportVersions,
  loadFrozenReport,
  loadReportVersion,
  lockReportVersion,
  markReportVersionSent,
  reportFirmName,
  signOffReportVersion,
} from "./reports";
import { loadBillingAccount, planToStore } from "./billing-store";
import { businessLimitMessage } from "../business-lifecycle";
import { countClients, loadEntitlements, requireEntitlement } from "./entitlements.server";
import {
  businessInput,
  EMAIL,
  idInput,
  instantInput,
  inviteRoleInput,
  PLANS,
  tokenInput,
} from "./server-inputs";
import {
  isReviewItemKey,
  isReviewPeriod,
  isReviewResult,
  type ReviewItemKey,
  type ReviewResult,
} from "./reviews";

// ── Firm and members ────────────────────────────────────────────────────────

export const getFirm = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const firm = await loadFirmFor(sql, context.userId);
    if (!firm) return { firm: null, members: [], invites: [], billing: null };
    const owner = firm.role === "owner";
    const [members, invites, billing] = await Promise.all([
      listMembers(sql, firm.firmUserId),
      owner ? listInvites(sql, firm.firmUserId) : Promise.resolve([]),
      owner ? loadBillingAccount(sql, firm.firmUserId) : Promise.resolve(null),
    ]);
    return { firm, members, invites, billing };
  });

export const saveFirmProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { name: string; plan: FirmPlan }) => {
    const raw = requireObject(input);
    if (typeof raw.name !== "string" || !raw.name.trim()) {
      throw new RequestError(400, "The firm needs a name");
    }
    if (typeof raw.plan !== "string" || !PLANS.has(raw.plan as FirmPlan)) {
      throw new RequestError(400, "Unknown firm plan");
    }
    return { name: raw.name.trim().slice(0, 120), plan: raw.plan as FirmPlan };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    // With Stripe connected the plan follows the webhook alone; without it
    // the owner records the stage by hand.
    const { stripeConfigured } = await import("../billing/stripe.server");
    const billing = await loadBillingAccount(sql, context.userId);
    return {
      firm: await saveFirm(
        sql,
        context.userId,
        data.name,
        planToStore(stripeConfigured(), Boolean(billing), data.plan),
      ),
    };
  });

/**
 * Creates an invitation and, when email is connected, sends the link to the
 * colleague. `emailed` says whether it went; the owner can always copy it.
 */
export const inviteFirmMember = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { email: string; role: InviteRole }) => {
    const raw = requireObject(input);
    if (typeof raw.email !== "string" || !EMAIL.test(raw.email.trim())) {
      throw new RequestError(400, "Enter the firm member's email address");
    }
    return { email: raw.email.trim().slice(0, 200), role: inviteRoleInput(raw.role) };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const firm = await requireFirmRole(sql, context.userId, ["owner"]);
    await requireEntitlement(sql, context.userId, "members");
    const invite = await createInvite(sql, {
      firmUserId: firm.firmUserId,
      email: data.email,
      role: data.role,
      token: randomHex(24),
    });
    const emailed = await emailInvitation(sql, context.userId, firm.name, invite);
    return { invite, emailed };
  });

export const revokeFirmInvite = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(tokenInput)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const firm = await requireFirmRole(sql, context.userId, ["owner"]);
    await revokeInvite(sql, firm.firmUserId, data.token);
    return { ok: true as const };
  });

/** What an invitation link shows before the visitor signs in or accepts. */
export const peekFirmInvite = createServerFn({ method: "GET" })
  .validator(tokenInput)
  .handler(async ({ data }) => {
    const sql = await getSql();
    return { invite: await peekInvite(sql, data.token) };
  });

/** How the signed-in account fits the invitation, so the page can ask before joining. */
export const checkFirmInvite = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(tokenInput)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    return { fit: await inviteFit(sql, data.token, context.userId) };
  });

/**
 * Joins the firm. When Precog could not match the account to the invited
 * address, the person had to confirm, and the firm owner gets an email.
 */
export const acceptFirmInvite = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { token: string; confirmOtherEmail?: boolean }) => ({
    ...tokenInput(input),
    confirmOtherEmail: requireObject(input).confirmOtherEmail === true,
  }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const { firm, unmatched } = await acceptInvite(sql, data.token, context.userId, {
      confirmOtherEmail: data.confirmOtherEmail,
    });
    if (unmatched) await emailUnmatchedJoin(sql, firm, context.userId, unmatched);
    return { firm };
  });

export const setFirmMemberRole = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { userId: string; role: InviteRole }) => {
    const raw = requireObject(input);
    if (typeof raw.userId !== "string" || !raw.userId)
      throw new RequestError(400, "Unknown member");
    return { userId: raw.userId.slice(0, 120), role: inviteRoleInput(raw.role) };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const firm = await requireFirmRole(sql, context.userId, ["owner"]);
    await setMemberRole(sql, firm.firmUserId, data.userId, data.role);
    return { members: await listMembers(sql, firm.firmUserId) };
  });

export const removeFirmMember = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { userId: string }) => {
    const raw = requireObject(input);
    if (typeof raw.userId !== "string" || !raw.userId)
      throw new RequestError(400, "Unknown member");
    return { userId: raw.userId.slice(0, 120) };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const firm = await requireFirmRole(sql, context.userId, ["owner"]);
    const moved = await removeMember(sql, firm.firmUserId, data.userId);
    return { members: await listMembers(sql, firm.firmUserId), moved };
  });

export const leaveFirm = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const firm = await requireFirm(sql, context.userId);
    await leaveFirmRow(sql, firm.firmUserId, context.userId);
    return { ok: true as const };
  });

// ── Clients ─────────────────────────────────────────────────────────────────

export const listFirmClients = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const firm = await loadFirmFor(sql, context.userId);
    return {
      clients: await listClientEngagements(sql, context.userId, firm?.firmUserId ?? null),
    };
  });

export const recordEngagement = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      businessId: string;
      startedAt?: string | null;
      mapCompletedAt?: string | null;
      reportSentAt?: string | null;
      openFindings: number;
      acceptedFindings: number;
    }) => {
      const raw = requireObject(input);
      if (!isBusinessId(raw.businessId)) throw new RequestError(400, "Unknown business id");
      const openFindings = Number(raw.openFindings);
      const acceptedFindings = Number(raw.acceptedFindings);
      if (!Number.isFinite(openFindings) || !Number.isFinite(acceptedFindings)) {
        throw new RequestError(400, "Finding counts must be numbers");
      }
      return {
        businessId: raw.businessId,
        startedAt: instantInput(raw.startedAt),
        mapCompletedAt: instantInput(raw.mapCompletedAt),
        reportSentAt: instantInput(raw.reportSentAt),
        openFindings: Math.max(0, Math.round(openFindings)),
        acceptedFindings: Math.max(0, Math.round(acceptedFindings)),
      };
    },
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const owner = await requireBusinessOwner(sql, context.userId, data.businessId);
    await upsertEngagementMark(sql, owner, data);
    return { ok: true as const };
  });

export const setClientOwnerEmail = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { businessId: string; email: string }) => {
    const raw = requireObject(input);
    if (!isBusinessId(raw.businessId)) throw new RequestError(400, "Unknown business id");
    const email = typeof raw.email === "string" ? raw.email.trim().toLowerCase() : "";
    if (email && !EMAIL.test(email)) throw new RequestError(400, "Enter a valid email address");
    return { businessId: raw.businessId, email: email.slice(0, 200) || null };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const owner = await requireBusinessOwner(sql, context.userId, data.businessId);
    // Clearing an address is always allowed; setting one needs the plan.
    if (data.email) await requireEntitlement(sql, context.userId, "ownerReminders");
    const { confirmToken, stopped } = await setOwnerEmail(
      sql,
      owner,
      data.businessId,
      data.email,
      context.userId,
    );
    const confirmation = stopped
      ? ("stopped" as const)
      : confirmToken && data.email
        ? await emailOwnerConfirmation(sql, owner, data.businessId, data.email, confirmToken)
        : ("none" as const);
    return { ok: true as const, confirmation };
  });

export const recordMonthlyReview = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      businessId: string;
      period: string;
      itemKey: ReviewItemKey;
      ownerName: string;
      dueOn?: string | null;
      result: ReviewResult;
      notes?: string;
      today?: string;
    }) => {
      const raw = requireObject(input);
      if (!isBusinessId(raw.businessId)) throw new RequestError(400, "Unknown business id");
      if (!isReviewPeriod(raw.period)) throw new RequestError(400, "Period must be YYYY-MM");
      if (!isReviewItemKey(raw.itemKey)) throw new RequestError(400, "Unknown review item");
      if (!isReviewResult(raw.result)) throw new RequestError(400, "Unknown review result");
      const dueOn = typeof raw.dueOn === "string" && isCalendarDate(raw.dueOn) ? raw.dueOn : null;
      return {
        businessId: raw.businessId,
        period: raw.period,
        itemKey: raw.itemKey,
        ownerName: typeof raw.ownerName === "string" ? raw.ownerName.trim().slice(0, 80) : "",
        dueOn,
        result: raw.result,
        notes: typeof raw.notes === "string" ? raw.notes.trim().slice(0, 500) : "",
        today: resolveClientDate(raw.today),
      };
    },
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const owner = await requireBusinessOwner(sql, context.userId, data.businessId);
    await insertReviewEvent(sql, owner, data, context.userId);
    const { bridgeMonthlyReview } = await import("../controls/review-bridge.server");
    const bridged = await bridgeMonthlyReview(sql, context.userId, data, data.today);
    return { ok: true as const, ...bridged };
  });

// ── Locked report versions ──────────────────────────────────────────────────

export const lockReport = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { businessId: string; scopeNote?: string; today?: string }) => {
    const raw = requireObject(input);
    if (!isBusinessId(raw.businessId)) throw new RequestError(400, "Unknown business id");
    return {
      businessId: raw.businessId,
      scopeNote: typeof raw.scopeNote === "string" ? raw.scopeNote.trim().slice(0, 600) : "",
      today: resolveClientDate(raw.today),
    };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const owner = await requireBusinessOwner(sql, context.userId, data.businessId);
    // Creating a version needs the plan; every version already locked stays
    // readable, reviewable for issuance and markable as sent whatever the plan.
    await requireEntitlement(sql, context.userId, "lockedVersions");
    // The figures are built on the preparer's calendar day, the day the
    // locked report prints, and stored so later scoring changes leave them.
    const { freezeReport } = await import("../report/stored-model");
    const version = await lockReportVersion(sql, {
      ownerUserId: owner,
      businessId: data.businessId,
      preparedBy: context.userId,
      scopeNote: data.scopeNote,
      id: `rv_${randomHex(12)}`,
      freeze: (profile) => freezeReport(profile, data.today),
    });
    return { version };
  });

export const listReports = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(businessInput)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const owner = await requireBusinessOwner(sql, context.userId, data.businessId);
    return { versions: await listReportVersions(sql, owner, data.businessId) };
  });

export const getReport = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { id: string; today?: string }) => ({
    ...idInput(input),
    today: resolveClientDate(input.today),
  }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const where = await requireReportVersion(sql, context.userId, data.id);
    const loaded = await loadReportVersion<PracticeProfile>(sql, where.ownerUserId, data.id);
    if (!loaded) throw new RequestError(404, "That report version does not exist");
    const frozen = await loadFrozenReport<StoredReportModel>(sql, where.ownerUserId, data.id);
    return {
      version: loaded.version,
      frozen,
      firmName: await reportFirmName(sql, where.ownerUserId, where.businessId),
      profile: {
        ...mergeProfile(
          {
            profile: loaded.profile,
            industry: loaded.profile.industry,
            name: loaded.profile.practiceName,
          },
          data.today,
        ),
        businessId: where.businessId,
      },
    };
  });

export const signOffReport = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; note?: string; issueWithoutIndependentReview?: boolean }) => ({
    ...idInput(input),
    note: typeof input.note === "string" ? input.note.trim().slice(0, 600) : "",
    issueWithoutIndependentReview: requireObject(input).issueWithoutIndependentReview === true,
  }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const where = await requireReportVersion(sql, context.userId, data.id);
    const existing = await loadReportVersion(sql, where.ownerUserId, data.id);
    const self = existing?.version.preparedBy === context.userId;
    if (!(self && data.issueWithoutIndependentReview)) {
      await requireFirmRole(sql, context.userId, ["owner", "reviewer"]);
    }
    const version = await signOffReportVersion(sql, {
      ownerUserId: where.ownerUserId,
      id: data.id,
      reviewedBy: context.userId,
      note: data.note,
      issueWithoutIndependentReview: data.issueWithoutIndependentReview,
    });
    return { version };
  });

/** Stamps a locked version as sent; the client's engagement takes the same stamp. */
export const markReportSent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(idInput)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const where = await requireReportVersion(sql, context.userId, data.id);
    await markReportVersionSent(sql, where.ownerUserId, data.id);
    return { ok: true as const };
  });

// ── History and deleted businesses ──────────────────────────────────────────

export const listHistory = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(businessInput)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const owner = await requireBusinessOwner(sql, context.userId, data.businessId);
    return { history: await listBusinessHistory(sql, owner, data.businessId) };
  });

/**
 * Before a restore loads a snapshot: keep the current state, even when a
 * version from the last few minutes is kept already, so the restore's save
 * loses nothing. A POST, as it writes.
 */
export const keepHistoryBeforeRestore = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(businessInput)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const owner = await requireBusinessOwner(sql, context.userId, data.businessId);
    await keepVersionBeforeRestore(sql, owner, data.businessId);
    return { ok: true as const };
  });

export const getHistoryVersion = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { businessId: string; revision: number; today?: string }) => {
    const raw = requireObject(input);
    const revision = Number(raw.revision);
    if (!Number.isInteger(revision) || revision < 1)
      throw new RequestError(400, "Unknown revision");
    return {
      ...businessInput(input),
      revision,
      today: resolveClientDate(raw.today as string | undefined),
    };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const owner = await requireBusinessOwner(sql, context.userId, data.businessId);
    const version = await loadBusinessHistoryVersion<PracticeProfile>(
      sql,
      owner,
      data.businessId,
      data.revision,
    );
    if (!version) throw new RequestError(404, "That snapshot is no longer kept");
    return {
      savedAt: version.savedAt,
      profile: {
        ...mergeProfile(
          { profile: version.profile, industry: version.industry, name: version.name },
          data.today,
        ),
        businessId: data.businessId,
      },
    };
  });

export const listDeletedClients = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const firm = await loadFirmFor(sql, context.userId);
    return { deleted: await listDeletedBusinesses(sql, context.userId, firm?.firmUserId ?? null) };
  });

export const restoreDeletedClient = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(businessInput)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const firm = await loadFirmFor(sql, context.userId);
    const candidates = await listDeletedBusinesses(sql, context.userId, firm?.firmUserId ?? null);
    const matches = candidates.filter((b) => b.id === data.businessId);
    const target = matches.find((b) => b.ownerUserId === context.userId) ?? matches[0];
    if (!target) throw new RequestError(404, "That business is not in the deleted list");
    // A restore brings a live business back, so it counts against the plan
    // as a new one does; the store's per-owner ceiling still applies after.
    const e = await loadEntitlements(sql, context.userId);
    const held = await countClients(sql, context.userId, firm);
    if (held >= e.clientLimit) {
      throw new RequestError(402, businessLimitMessage({ plan: e.plan, limit: e.clientLimit }));
    }
    return {
      restored: await restoreBusinessRow(sql, target.ownerUserId, data.businessId, context.userId),
    };
  });

// ── Reminders ───────────────────────────────────────────────────────────────

/**
 * The caller's reminder switches, whether this deployment can send email at
 * all, and whether the caller's owner-reminder switch counts: for a firm's
 * clients only the firm owner's does.
 */
export const getNotificationSettings = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const { mailConfigured } = await import("../reminders/mailer.server");
    const [settings, firm] = await Promise.all([
      loadNotificationSettings(sql, context.userId),
      loadFirmFor(sql, context.userId),
    ]);
    return {
      settings,
      mailConfigured: mailConfigured(),
      controlsOwnerReminders: !firm || firm.role === "owner",
    };
  });

export const updateNotificationSettings = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { weeklyDigest: boolean; ownerReminders: boolean }) => {
    const raw = requireObject(input);
    return { weeklyDigest: raw.weeklyDigest === true, ownerReminders: raw.ownerReminders === true };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await saveNotificationSettings(sql, context.userId, data);
    return { settings: data };
  });

/**
 * Asks a client owner to agree before any reminder reaches them. "sent" when
 * the email went, "not-sent" when email is not connected or the send failed
 * (saving the address again sends a new one).
 */
async function emailOwnerConfirmation(
  sql: Awaited<ReturnType<typeof getSql>>,
  ownerUserId: string,
  businessId: string,
  email: string,
  token: string,
): Promise<"sent" | "not-sent"> {
  const [{ mailConfigured, sendEmail }, { requestOrigin }, { renderOwnerEmailConfirm }] =
    await Promise.all([
      import("../reminders/mailer.server"),
      import("@/lib/request-origin.server"),
      import("../reminders/email"),
    ]);
  if (!mailConfigured()) return "not-sent";
  const rows = await sql<{ name: string; firm_name: string | null }>`
    select b.name, f.name as firm_name
    from businesses b
    left join firms f on f.user_id = coalesce(b.firm_user_id, b.user_id)
    where b.user_id = ${ownerUserId} and b.id = ${businessId}
  `;
  const row = rows[0];
  if (!row) return "not-sent";
  try {
    await sendEmail(
      email,
      renderOwnerEmailConfirm({
        businessName: row.name,
        firmName: row.firm_name,
        confirmUrl: `${requestOrigin()}/api/owner-email?do=confirm&token=${token}`,
      }),
    );
    return "sent";
  } catch (err) {
    const { reportServerError } = await import("@/lib/observability/report.server");
    await reportServerError(err, "owner-email-confirmation");
    return "not-sent";
  }
}

/**
 * Tells the firm owner that someone joined with an invitation Precog could
 * not match to their account, so the owner can remove them. Without email
 * the owner still sees the new member in the firm's member list.
 */
async function emailUnmatchedJoin(
  sql: Awaited<ReturnType<typeof getSql>>,
  firm: FirmContext,
  memberId: string,
  unmatched: NonNullable<AcceptedInvite["unmatched"]>,
): Promise<void> {
  const [{ mailConfigured, sendEmail }, { requestOrigin }, { renderUnmatchedJoin }] =
    await Promise.all([
      import("../reminders/mailer.server"),
      import("@/lib/request-origin.server"),
      import("./invite-email"),
    ]);
  if (!mailConfigured()) return;
  const rows = await sql<{ id: string; name: string | null; email: string }>`
    select id, name, email from "user" where id in (${firm.firmUserId}, ${memberId})
  `;
  const owner = rows.find((r) => r.id === firm.firmUserId);
  const member = rows.find((r) => r.id === memberId);
  if (!owner?.email.includes("@")) return;
  try {
    await sendEmail(
      owner.email,
      renderUnmatchedJoin({
        firmName: firm.name,
        role: firm.role,
        memberName: member?.name || null,
        accountEmail: unmatched.accountEmail,
        invitedEmail: unmatched.invitedEmail,
        link: `${requestOrigin()}/firm`,
      }),
    );
  } catch (err) {
    const { reportServerError } = await import("@/lib/observability/report.server");
    await reportServerError(err, "firm-unmatched-join-email");
  }
}

/** Sends the invitation when email is connected; true when it went. */
async function emailInvitation(
  sql: Awaited<ReturnType<typeof getSql>>,
  inviterId: string,
  firmName: string,
  invite: { email: string; role: InviteRole; token: string },
): Promise<boolean> {
  const [{ mailConfigured, sendEmail }, { requestOrigin }, { renderFirmInvitation }] =
    await Promise.all([
      import("../reminders/mailer.server"),
      import("@/lib/request-origin.server"),
      import("./invite-email"),
    ]);
  if (!mailConfigured()) return false;
  const inviter = await sql<{ name: string | null }>`
    select name from "user" where id = ${inviterId}
  `;
  try {
    await sendEmail(
      invite.email,
      renderFirmInvitation({
        firmName,
        inviterName: inviter[0]?.name || null,
        role: invite.role,
        link: `${requestOrigin()}/join/${invite.token}`,
      }),
    );
    return true;
  } catch (err) {
    const { reportServerError } = await import("@/lib/observability/report.server");
    await reportServerError(err, "firm-invite-email");
    return false;
  }
}
