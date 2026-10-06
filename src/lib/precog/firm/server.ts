import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { RequestError, requireObject } from "@/lib/request-errors";
import { randomHex } from "@/lib/web-crypto";
import { isBusinessId } from "../profile-input";
import { SlidingWindowLimiter } from "../llm/rate-limit";
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
  businessWork,
  requireBusinessOwner,
  requireBusinessRole,
  requireFirm,
  requireFirmRole,
  requireReportVersion,
} from "./access.server";
import {
  acceptInvite,
  createInvite,
  digestAddressProblem,
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
  saveFirmLetterhead as saveFirmLetterheadRow,
  saveNotificationSettings,
  setMemberRole,
  setOwnerEmail,
  transferFirmOwnership as transferFirmOwnershipRows,
  upsertEngagementMark,
  type InviteRole,
} from "./store";
import {
  listReportVersions,
  loadFrozenReport,
  loadReportVersion,
  lockReportVersion,
  markReportVersionSent,
  signOffReportVersion,
  versionFirmName,
} from "./reports";
import { loadBillingAccount, planToStore } from "./billing-store";
import { requireEntitlement, requireEntitlementForBusiness } from "./entitlements.server";
import { recordFirst } from "../telemetry/events.server";
import { assertEngagementOpen, engagementEnded } from "./engagement-store";
import { recordAudit, recordAuditForBusiness, recordAudits } from "./audit.server";
import {
  businessInput,
  EMAIL,
  idInput,
  instantInput,
  inviteRoleInput,
  letterheadInput,
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
    // audit: exempt (the firm's name and workspace settings; the letterhead has its own event)
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
 * The owner's letterhead, logo and cover-page switch, printed on the firm's
 * client reports from now on. The logo arrives re-encoded by the browser.
 */
export const saveFirmLetterhead = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(letterheadInput)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await requireFirmRole(sql, context.userId, ["owner"]);
    const firm = await saveFirmLetterheadRow(sql, context.userId, data);
    await recordAudit(sql, {
      firmUserId: context.userId,
      actorUserId: context.userId,
      event: "letterhead_changed",
    });
    return { firm };
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
    // The invited address stays out of the log; the invitation row keeps it.
    await recordAudit(sql, {
      firmUserId: firm.firmUserId,
      actorUserId: context.userId,
      event: "member_invited",
      detail: { role: invite.role },
    });
    return { invite, emailed };
  });

export const revokeFirmInvite = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(tokenInput)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const firm = await requireFirmRole(sql, context.userId, ["owner"]);
    // A repeated revoke, or one of an accepted invitation, changes nothing.
    if (await revokeInvite(sql, firm.firmUserId, data.token)) {
      await recordAudit(sql, {
        firmUserId: firm.firmUserId,
        actorUserId: context.userId,
        event: "invite_revoked",
      });
    }
    return { ok: true as const };
  });

/** What an invitation link shows before the visitor signs in or accepts. */
export const peekFirmInvite = createServerFn({ method: "GET" })
  .validator(tokenInput)
  .handler(async ({ data }) => {
    const { requestIp } = await import("@/lib/request-ip.server");
    // Invitation tokens carry 48 hex characters, so guessing is
    // impractical; this only keeps a prober from hammering the lookup.
    takeInvitePeekAllowance(requestIp());
    const sql = await getSql();
    return { invite: await peekInvite(sql, data.token) };
  });

/** Peeks at invitation links one address may make a minute. */
export const INVITE_PEEKS_PER_MINUTE = 30;
const invitePeekLimiter = new SlidingWindowLimiter({
  limit: INVITE_PEEKS_PER_MINUTE,
  windowMs: 60_000,
});

/** Refuses (429) an address past its per-minute invitation-peek allowance. */
export function takeInvitePeekAllowance(ip: string, limiter = invitePeekLimiter): void {
  if (limiter.take(ip).allowed) return;
  throw new RequestError(
    429,
    `Precog opens at most ${INVITE_PEEKS_PER_MINUTE} invitation links a minute from one address. Wait a minute, then open the invitation again.`,
  );
}

/** How the signed-in account fits the invitation, so the page can ask before joining. */
export const checkFirmInvite = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(tokenInput)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    return { fit: await inviteFit(sql, data.token, context.userId) };
  });

/** Joins the firm; only an account whose confirmed address is the invited one gets in. */
export const acceptFirmInvite = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(tokenInput)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const { firm } = await acceptInvite(sql, data.token, context.userId);
    await recordAudit(sql, {
      firmUserId: firm.firmUserId,
      actorUserId: context.userId,
      event: "member_joined",
      subjectUserId: context.userId,
      detail: { role: firm.role },
    });
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
    const from = await setMemberRole(sql, firm.firmUserId, data.userId, data.role);
    if (from !== null && from !== data.role) {
      await recordAudit(sql, {
        firmUserId: firm.firmUserId,
        actorUserId: context.userId,
        event: "role_changed",
        subjectUserId: data.userId,
        detail: { from, to: data.role },
      });
    }
    return { members: await listMembers(sql, firm.firmUserId) };
  });

function memberInput(input: { userId: string }): { userId: string } {
  const raw = requireObject(input);
  if (typeof raw.userId !== "string" || !raw.userId) throw new RequestError(400, "Unknown member");
  return { userId: raw.userId.slice(0, 120) };
}

export const removeFirmMember = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(memberInput)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const firm = await requireFirmRole(sql, context.userId, ["owner"]);
    // Null when the account was no longer a member: nothing moved, nothing to log.
    const moved = await removeMember(sql, firm.firmUserId, data.userId);
    if (moved) {
      await recordAudit(sql, {
        firmUserId: firm.firmUserId,
        actorUserId: context.userId,
        event: "member_removed",
        subjectUserId: data.userId,
      });
      await recordHandOvers(sql, firm.firmUserId, context.userId, data.userId, moved);
    }
    return { members: await listMembers(sql, firm.firmUserId), moved: moved ?? [] };
  });

/**
 * Hands the firm, its clients, members, invitations and billing to a member;
 * the caller stays on as a reviewer. Stripe's customer and subscription
 * are repointed best effort afterwards, so receipts reach the new owner.
 */
export const transferFirmOwnership = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(memberInput)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const firm = await requireFirmRole(sql, context.userId, ["owner"]);
    // The old owner's own client businesses moved to the new owner's
    // account, some under a new address when the new owner held the id.
    const moved = await transferFirmOwnershipRows(sql, firm.firmUserId, data.userId);
    // The firm's id is now the new owner's; its log moved with it.
    await recordAudit(sql, {
      firmUserId: data.userId,
      actorUserId: context.userId,
      event: "ownership_transferred",
      subjectUserId: data.userId,
    });
    await recordHandOvers(sql, data.userId, context.userId, context.userId, moved);
    await repointStripeOwner(sql, data.userId);
    return {
      firm: await loadFirmFor(sql, context.userId),
      members: await listMembers(sql, data.userId),
      moved,
    };
  });

/** Best effort, logged like the customer deletion: the rows have already moved. */
async function repointStripeOwner(
  sql: Awaited<ReturnType<typeof getSql>>,
  newOwnerUserId: string,
): Promise<void> {
  const billing = await loadBillingAccount(sql, newOwnerUserId);
  if (!billing?.stripeCustomerId) return;
  const { updateCustomer, updateSubscriptionMetadata } = await import("../billing/stripe.server");
  const rows = await sql<{ email: string | null }>`
    select email from "user" where id = ${newOwnerUserId}
  `;
  try {
    await updateCustomer(billing.stripeCustomerId, {
      email: rows[0]?.email ?? null,
      userId: newOwnerUserId,
    });
  } catch (error) {
    console.error(
      "[firm] Stripe customer not repointed:",
      error instanceof Error ? error.message : error,
    );
  }
  if (!billing.subscriptionId) return;
  try {
    await updateSubscriptionMetadata(billing.subscriptionId, { userId: newOwnerUserId });
  } catch (error) {
    console.error(
      "[firm] Stripe subscription not repointed:",
      error instanceof Error ? error.message : error,
    );
  }
}

export const leaveFirm = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const firm = await requireFirm(sql, context.userId);
    // Null when a removal or a second leave got there first: nothing to log.
    const moved = await leaveFirmRow(sql, firm.firmUserId, context.userId);
    if (moved) {
      await recordAudit(sql, {
        firmUserId: firm.firmUserId,
        actorUserId: context.userId,
        event: "member_left",
        subjectUserId: context.userId,
      });
      await recordHandOvers(sql, firm.firmUserId, context.userId, context.userId, moved);
    }
    return { ok: true as const };
  });

/**
 * One client_handed_over row per business a departing member's exit (or an
 * old owner's transfer of the firm) moved to the owner, in one statement.
 */
async function recordHandOvers(
  sql: Awaited<ReturnType<typeof getSql>>,
  firmUserId: string,
  actorUserId: string,
  memberUserId: string,
  moved: { from: string; to: string }[],
): Promise<void> {
  await recordAudits(
    sql,
    moved.map((business) => ({
      firmUserId,
      actorUserId,
      event: "client_handed_over" as const,
      businessId: business.to,
      subjectUserId: memberUserId,
      detail: { from: business.from },
    })),
  );
}

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

/**
 * The page-open stamps the browser measures. The sent date is not one of
 * them: only markReportSent sets it, on a reviewed version, so any
 * reportSentAt in the request is dropped here.
 */
export const recordEngagement = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      businessId: string;
      startedAt?: string | null;
      mapCompletedAt?: string | null;
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
        openFindings: Math.max(0, Math.round(openFindings)),
        acceptedFindings: Math.max(0, Math.round(acceptedFindings)),
      };
    },
  )
  .handler(async ({ context, data }) => {
    // audit: exempt (page-open stamp, not a change)
    const sql = await getSql();
    const owner = await requireBusinessOwner(sql, context.userId, data.businessId);
    // The page posts its stamps on open; an ended engagement keeps the ones it has.
    if (await engagementEnded(sql, owner, data.businessId)) return { ok: true as const };
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
    // The firm's work on its client: a member of the business's own firm.
    await requireBusinessRole(sql, context.userId, owner, data.businessId, "any");
    await assertEngagementOpen(sql, owner, data.businessId, context.userId);
    // Clearing an address is always allowed; setting one needs the plan of
    // the firm working on the business (or of the business's own account).
    if (data.email) {
      await requireEntitlementForBusiness(sql, owner, data.businessId, "ownerReminders");
    }
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
    // The address itself stays out of the log.
    await recordAuditForBusiness(sql, owner, data.businessId, {
      actorUserId: context.userId,
      event: "owner_email_set",
      detail: { cleared: data.email === null },
    });
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
    // audit: exempt (the monthly review log is its own record)
    const sql = await getSql();
    const owner = await requireBusinessOwner(sql, context.userId, data.businessId);
    await insertReviewEvent(sql, owner, data, context.userId);
    // The audit insert commits before optional evidence and telemetry. Each
    // later write has its own transactional gate; a side-effect failure never
    // rolls back or re-authorizes the review.
    const { bridgeMonthlyReview } = await import("../controls/review-bridge.server");
    const bridged = await bridgeMonthlyReview(sql, context.userId, data, data.today);
    await recordFirst(sql, context.userId, "first_monthly_review", data.businessId);
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
    // Only a member of the business's firm locks a firm client; the plan is
    // the firm's, read after that check, so a business its owner shared with
    // a firm locks under the firm's plan and only by the firm. The ended
    // engagement and the plan are checked again under the write's locks.
    await requireBusinessRole(sql, context.userId, owner, data.businessId, "any");
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
      // Creating a version needs the plan of the business's firm (or of the
      // business, when it has none); every version already locked stays
      // readable, reviewable for issuance and markable as sent whatever the plan.
      authorize: async (tx) => {
        await requireEntitlementForBusiness(tx, owner, data.businessId, "lockedVersions");
      },
    });
    await recordFirst(sql, context.userId, "first_locked_version", data.businessId);
    await recordAuditForBusiness(sql, owner, data.businessId, {
      actorUserId: context.userId,
      event: "version_locked",
      detail: { versionId: version.id, versionNo: version.versionNo },
    });
    return { version };
  });

/**
 * The versions the caller reads on one business, and the work they do on it
 * (businessWork): the versions panel offers Lock, review, Mark sent and
 * Share only to an account the server lets do them.
 */
export const listReports = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(businessInput)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const owner = await requireBusinessOwner(sql, context.userId, data.businessId);
    const [versions, work] = await Promise.all([
      listReportVersions(sql, owner, data.businessId, context.userId),
      businessWork(sql, context.userId, owner, data.businessId),
    ]);
    return { versions, work };
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
    const [frozen, name, coverPage] = await Promise.all([
      loadFrozenReport<StoredReportModel>(sql, where.ownerUserId, data.id),
      versionFirmName(sql, where.ownerUserId, data.id),
      reportCoverPage(sql, where.ownerUserId, where.businessId),
    ]);
    // A version locked before the snapshot existed prints the firm's current
    // name only, and only when that firm reads it (never a version the owner
    // locked alone before sharing the business); the cover-page switch is
    // the firm's, live, and prints nothing without a firm.
    return {
      version: loaded.version,
      frozen,
      firm: loaded.version.firm ?? (name ? { name, letterhead: "", logoDataUrl: null } : null),
      coverPage,
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
    await requireBusinessRole(
      sql,
      context.userId,
      where.ownerUserId,
      where.businessId,
      self && data.issueWithoutIndependentReview ? "any" : ["owner", "reviewer"],
    );
    await assertEngagementOpen(sql, where.ownerUserId, where.businessId, context.userId);
    const version = await signOffReportVersion(sql, {
      ownerUserId: where.ownerUserId,
      id: data.id,
      reviewedBy: context.userId,
      note: data.note,
      issueWithoutIndependentReview: data.issueWithoutIndependentReview,
    });
    await recordAuditForBusiness(sql, where.ownerUserId, where.businessId, {
      actorUserId: context.userId,
      event: "version_reviewed",
      detail: { versionId: data.id, versionNo: version.versionNo },
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
    await requireBusinessRole(sql, context.userId, where.ownerUserId, where.businessId, "any");
    await assertEngagementOpen(sql, where.ownerUserId, where.businessId, context.userId);
    await markReportVersionSent(sql, where.ownerUserId, data.id);
    await recordFirst(sql, context.userId, "first_report_sent", where.businessId);
    await recordAuditForBusiness(sql, where.ownerUserId, where.businessId, {
      actorUserId: context.userId,
      event: "version_sent",
      detail: { versionId: data.id },
    });
    return { ok: true as const };
  });

/** Whether the firm a business is a client of prints a cover page; true when it has none. */
async function reportCoverPage(
  sql: Awaited<ReturnType<typeof getSql>>,
  ownerUserId: string,
  businessId: string,
): Promise<boolean> {
  const rows = await sql<{ cover_page: boolean }>`
    select f.cover_page from businesses b
    join firms f on f.user_id = b.firm_user_id
    where b.user_id = ${ownerUserId} and b.id = ${businessId}
  `;
  return rows[0] ? Boolean(rows[0].cover_page) : true;
}

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
    // audit: exempt (a copy kept before a restore; the business's history is its own record)
    const sql = await getSql();
    const owner = await requireBusinessOwner(sql, context.userId, data.businessId);
    await keepVersionBeforeRestore(sql, owner, data.businessId, context.userId);
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
    // A restore brings a live business back, so the store counts it against
    // the plan that holds the business (its firm's, or its owner's own),
    // under that plan's lock; its per-owner ceiling still applies after.
    const restored = await restoreBusinessRow(
      sql,
      target.ownerUserId,
      data.businessId,
      context.userId,
    );
    if (restored) {
      await recordAuditForBusiness(sql, target.ownerUserId, data.businessId, {
        actorUserId: context.userId,
        event: "client_restored",
      });
    }
    return { restored };
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
    const [settings, firm, addressProblem] = await Promise.all([
      loadNotificationSettings(sql, context.userId),
      loadFirmFor(sql, context.userId),
      digestAddressProblem(sql, context.userId),
    ]);
    return {
      settings,
      mailConfigured: mailConfigured(),
      controlsOwnerReminders: !firm || firm.role === "owner",
      // Why the digest cannot reach this account's address; null when it can.
      digestAddressProblem: addressProblem,
    };
  });

export const updateNotificationSettings = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { weeklyDigest: boolean; ownerReminders: boolean }) => {
    const raw = requireObject(input);
    return { weeklyDigest: raw.weeklyDigest === true, ownerReminders: raw.ownerReminders === true };
  })
  .handler(async ({ context, data }) => {
    // audit: exempt (a member's own switches)
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
