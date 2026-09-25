import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { RequestError, requireObject } from "@/lib/request-errors";
import { isBusinessId } from "../profile-input";
import {
  listBusinessHistory,
  listDeletedBusinesses,
  loadBusinessHistoryVersion,
  restoreBusinessRow,
} from "../business-store";
import { mergeProfile } from "../profile-merge";
import { resolveClientDate } from "../continuity/coverage";
import type { PracticeProfile } from "../practice-profile";
import type { FirmPlan } from "./pricing";
import { requireBusinessOwner, requireFirm, requireFirmRole } from "./access.server";
import {
  acceptInvite,
  createInvite,
  insertReviewEvent,
  INVITE_ROLES,
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
  type FirmRole,
} from "./store";
import {
  listReportVersions,
  loadReportVersion,
  lockReportVersion,
  markReportVersionSent,
  reportVersionOwner,
  signOffReportVersion,
} from "./reports";
import { loadBillingAccount } from "./billing-store";
import {
  isReviewItemKey,
  isReviewPeriod,
  isReviewResult,
  type ReviewItemKey,
  type ReviewResult,
} from "./reviews";
import { isCalendarDate } from "../continuity/coverage";

const PLANS = new Set<FirmPlan>(["assessment", "monthly"]);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function businessInput(input: { businessId: string }) {
  const raw = requireObject(input);
  if (!isBusinessId(raw.businessId)) throw new RequestError(400, "Unknown business id");
  return { businessId: raw.businessId };
}

function idInput(input: { id: string }) {
  const raw = requireObject(input);
  if (typeof raw.id !== "string" || !/^[\w-]{4,64}$/.test(raw.id)) {
    throw new RequestError(400, "Unknown id");
  }
  return { id: raw.id };
}

function randomToken(bytes = 24): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

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
    // Once billing is connected the plan follows the payment provider.
    const billing = await loadBillingAccount(sql, context.userId);
    const current = await loadFirmFor(sql, context.userId);
    const plan = billing ? (current?.plan ?? data.plan) : data.plan;
    return { firm: await saveFirm(sql, context.userId, data.name, plan) };
  });

export const inviteFirmMember = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { email: string; role: Exclude<FirmRole, "owner"> }) => {
    const raw = requireObject(input);
    if (typeof raw.email !== "string" || !EMAIL.test(raw.email.trim())) {
      throw new RequestError(400, "Enter the colleague's email address");
    }
    if (!INVITE_ROLES.includes(raw.role as Exclude<FirmRole, "owner">)) {
      throw new RequestError(400, "Unknown role");
    }
    return {
      email: raw.email.trim().slice(0, 200),
      role: raw.role as Exclude<FirmRole, "owner">,
    };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const firm = await requireFirmRole(sql, context.userId, ["owner"]);
    const invite = await createInvite(sql, {
      firmUserId: firm.firmUserId,
      email: data.email,
      role: data.role,
      token: randomToken(),
    });
    return { invite };
  });

export const revokeFirmInvite = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { token: string }) => {
    const raw = requireObject(input);
    if (typeof raw.token !== "string" || !/^[a-f0-9]{48}$/.test(raw.token)) {
      throw new RequestError(400, "Unknown invitation");
    }
    return { token: raw.token };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const firm = await requireFirmRole(sql, context.userId, ["owner"]);
    await revokeInvite(sql, firm.firmUserId, data.token);
    return { ok: true as const };
  });

/** What an invitation link shows before the visitor signs in or accepts. */
export const peekFirmInvite = createServerFn({ method: "GET" })
  .validator((input: { token: string }) => {
    const raw = requireObject(input);
    if (typeof raw.token !== "string" || !/^[a-f0-9]{48}$/.test(raw.token)) {
      throw new RequestError(400, "Unknown invitation");
    }
    return { token: raw.token };
  })
  .handler(async ({ data }) => {
    const sql = await getSql();
    return { invite: await peekInvite(sql, data.token) };
  });

export const acceptFirmInvite = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { token: string }) => {
    const raw = requireObject(input);
    if (typeof raw.token !== "string" || !/^[a-f0-9]{48}$/.test(raw.token)) {
      throw new RequestError(400, "Unknown invitation");
    }
    return { token: raw.token };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    return { firm: await acceptInvite(sql, data.token, context.userId) };
  });

export const setFirmMemberRole = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { userId: string; role: Exclude<FirmRole, "owner"> }) => {
    const raw = requireObject(input);
    if (typeof raw.userId !== "string" || !raw.userId)
      throw new RequestError(400, "Unknown member");
    if (!INVITE_ROLES.includes(raw.role as Exclude<FirmRole, "owner">)) {
      throw new RequestError(400, "Unknown role");
    }
    return { userId: raw.userId.slice(0, 120), role: raw.role as Exclude<FirmRole, "owner"> };
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
    await removeMember(sql, firm.firmUserId, data.userId);
    return { members: await listMembers(sql, firm.firmUserId) };
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
        startedAt: typeof raw.startedAt === "string" ? raw.startedAt : null,
        mapCompletedAt: typeof raw.mapCompletedAt === "string" ? raw.mapCompletedAt : null,
        reportSentAt: typeof raw.reportSentAt === "string" ? raw.reportSentAt : null,
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
    await setOwnerEmail(sql, owner, data.businessId, data.email);
    return { ok: true as const };
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
      };
    },
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const owner = await requireBusinessOwner(sql, context.userId, data.businessId);
    await insertReviewEvent(sql, owner, data, context.userId);
    return { ok: true as const };
  });

// ── Locked report versions ──────────────────────────────────────────────────

export const lockReport = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { businessId: string; scopeNote?: string }) => {
    const raw = requireObject(input);
    if (!isBusinessId(raw.businessId)) throw new RequestError(400, "Unknown business id");
    return {
      businessId: raw.businessId,
      scopeNote: typeof raw.scopeNote === "string" ? raw.scopeNote.trim().slice(0, 600) : "",
    };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const owner = await requireBusinessOwner(sql, context.userId, data.businessId);
    const version = await lockReportVersion(sql, {
      ownerUserId: owner,
      businessId: data.businessId,
      preparedBy: context.userId,
      scopeNote: data.scopeNote,
      id: `rv_${randomToken(12)}`,
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
    today: resolveClientDate(requireObject(input).today as string | undefined),
  }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const where = await reportVersionOwner(sql, data.id);
    if (!where) throw new RequestError(404, "That report version does not exist");
    await requireBusinessOwner(sql, context.userId, where.businessId);
    const loaded = await loadReportVersion<PracticeProfile>(sql, where.ownerUserId, data.id);
    if (!loaded) throw new RequestError(404, "That report version does not exist");
    return {
      version: loaded.version,
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
  .validator((input: { id: string; note?: string }) => ({
    ...idInput(input),
    note:
      typeof requireObject(input).note === "string"
        ? (requireObject(input).note as string).trim().slice(0, 600)
        : "",
  }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const where = await reportVersionOwner(sql, data.id);
    if (!where) throw new RequestError(404, "That report version does not exist");
    await requireBusinessOwner(sql, context.userId, where.businessId);
    await requireFirmRole(sql, context.userId, ["owner", "reviewer"]);
    const version = await signOffReportVersion(sql, {
      ownerUserId: where.ownerUserId,
      id: data.id,
      reviewedBy: context.userId,
      note: data.note,
    });
    return { version };
  });

export const markReportSent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(idInput)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const where = await reportVersionOwner(sql, data.id);
    if (!where) throw new RequestError(404, "That report version does not exist");
    await requireBusinessOwner(sql, context.userId, where.businessId);
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
    if (!version) throw new RequestError(404, "That version is no longer kept");
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
    const target = candidates.find((b) => b.id === data.businessId);
    if (!target) throw new RequestError(404, "That business is not in the deleted list");
    const owners = await sql<{ user_id: string }>`
      select user_id from businesses where id = ${data.businessId} and deleted_at is not null
        and (user_id = ${context.userId}
          or (${firm?.firmUserId ?? null}::text is not null and firm_user_id = ${firm?.firmUserId ?? null}))
      order by (user_id = ${context.userId}) desc limit 1
    `;
    const owner = owners[0]?.user_id;
    if (!owner) throw new RequestError(404, "That business is not in the deleted list");
    return { restored: await restoreBusinessRow(sql, owner, data.businessId) };
  });

// ── Reminders ───────────────────────────────────────────────────────────────

export const getNotificationSettings = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    return { settings: await loadNotificationSettings(sql, context.userId) };
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
