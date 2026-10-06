import { createServerFn } from "@tanstack/react-start";
import { assertExpectedAccount } from "@/lib/auth/expected-account";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { MAX_BUSINESS_NAME } from "./business-id";
import type { IndustryId } from "./industry";
import type { PracticeProfile } from "./practice-profile";
import { mergeProfile } from "./profile-merge";
import {
  deleteBusinessRow,
  listBusinessSummaries,
  loadActiveBusiness,
  resolveBusinessOwner,
  saveBusinessRevision,
} from "./business-store";
import { loadFirmFor } from "./firm/store";
import { loadEntitlements } from "./firm/entitlements.server";
import { businessLimitMessage } from "./business-lifecycle";
import { assertVerificationsAllowed } from "./procedures/verify-guard";
import { stampDispositions } from "./decisions/disposition-stamp";
import { resolveClientDate } from "./dates";
import { recordFirst } from "./telemetry/events.server";
import { recordAuditForBusiness } from "./firm/audit.server";
import {
  parseDeleteBusinessRequest,
  parseOpenBusinessRequest,
  parseSaveBusinessRequest,
} from "./profile-requests";

export const loadBusinessProfile = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input?: { today?: string }) => ({ today: resolveClientDate(input?.today) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const active = await loadActiveBusiness<PracticeProfile>(sql, context.userId);
    if (!active) return { found: false as const, profile: null, revision: null };
    return {
      found: true as const,
      profile: {
        ...mergeProfile(active, data.today),
        businessId: active.businessId,
        ownerUserId: active.ownerUserId,
      },
      updatedAt: active.updated_at,
      revision: active.revision,
    };
  });

export const saveBusinessProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      expectedAccountId: string;
      profile: PracticeProfile;
      industry?: IndustryId;
      baseRevision?: number | null;
      ownerUserId?: string;
      today?: string;
    }) => parseSaveBusinessRequest(input),
  )
  .handler(async ({ context, data }) => {
    // audit: exempt (a profile save is kept in the business's own history)
    const sql = await getSql();
    assertExpectedAccount(data.expectedAccountId, context.userId);
    const name = data.profile.practiceName.trim().slice(0, MAX_BUSINESS_NAME) || "My Business";
    const { businessId, json: profileJson } = data;

    // A firm member saving a colleague's client writes the colleague's row;
    // a new business is created under the saver and joins their firm.
    const [owner, firm, saver] = await Promise.all([
      resolveBusinessOwner(sql, context.userId, businessId, true, data.ownerUserId),
      loadFirmFor(sql, context.userId),
      sql<{ name: string | null; email: string | null }>`
        select name, email from "user" where id = ${context.userId}`,
    ]);

    // A new business counts against the plan's client limit (one on the
    // free plan and the Assessment). The store counts inside the save, under
    // the firm's lock, so saves at the same moment cannot all pass; its
    // per-owner ceiling is the hard limit after it.
    let clientLimit: { limit: number; message: string } | undefined;
    if (owner === null) {
      const e = await loadEntitlements(sql, context.userId);
      clientLimit = {
        limit: e.clientLimit,
        message: businessLimitMessage({
          plan: e.plan,
          limit: e.clientLimit,
          tier: e.tier,
          asMember: firm !== null && firm.role !== "owner",
        }),
      };
    }

    // Revision check and write are a single compare-and-swap statement; see
    // business-store.ts. The table is keyed by (user_id, id), so another
    // user's business with the same client-generated id is a different row.
    //
    // A "Not valid" judgement names its judge, so a new or changed one
    // takes the saver's stamp here, never the browser's name. Judgements
    // already stored stay as they are. Saves without judgements skip the
    // extra read entirely.
    let nextProfile = data.profile;
    let nextJson = profileJson;
    if (data.profile.decisions?.some((d) => d.disposition)) {
      const stored = await sql<{ profile: PracticeProfile }>`
        select profile from businesses
        where user_id = ${owner ?? context.userId} and id = ${businessId}
      `;
      const saverName = saver[0]?.name?.trim() || saver[0]?.email || context.userId;
      nextProfile = stampDispositions(
        data.profile,
        (stored[0]?.profile as PracticeProfile | undefined) ?? null,
        { id: context.userId, name: saverName },
      );
      if (nextProfile !== data.profile) nextJson = JSON.stringify({ ...nextProfile, businessId });
    }
    const saved = await saveBusinessRevision<PracticeProfile>(sql, {
      userId: owner ?? context.userId,
      businessId,
      name,
      industry: data.industry,
      profileJson: nextJson,
      baseRevision: data.baseRevision,
      savedBy: context.userId,
      firmUserId: firm?.firmUserId ?? null,
      clientLimit,
      activate: true,
      // A new verification must come from someone allowed to record one.
      checkWrite: (previous) =>
        assertVerificationsAllowed({
          previousProfile: previous,
          nextProfile: data.profile,
          saverId: context.userId,
          saverRole: firm?.role ?? null,
          // A "recorded by" name must be the saver's own account name or email.
          saverNames: [saver[0]?.name ?? "", saver[0]?.email ?? ""],
          latestDay: data.latestDay,
        }),
    });
    if (!saved.ok) {
      return {
        ok: false as const,
        conflict: true as const,
        revision: saved.existing.revision,
        updatedAt: saved.existing.updated_at,
        profile: { ...mergeProfile(saved.existing, data.today), businessId },
      };
    }

    await sweepProcedureImages(sql, owner ?? context.userId, businessId, data.profile, {
      // Only the saver's own pictures ever move between businesses.
      copyFromOwn: (owner ?? context.userId) === context.userId,
      previousProcedures: saved.previousProcedures,
      heldNamedImages: saved.heldNamedImages,
    });
    // The saver's first business, once; a failed write is reported, not thrown.
    if (owner === null) await recordFirst(sql, context.userId, "first_business", businessId);
    return {
      ok: true as const,
      revision: saved.revision,
      updatedAt: saved.updatedAt,
    };
  });

/**
 * After a save, sweep the business's step pictures (see sweepImagesAfterSave,
 * which skips the sweep when there is nothing to do). A failure here is
 * reported and never fails the save: the pictures wait for the next one.
 */
async function sweepProcedureImages(
  sql: Awaited<ReturnType<typeof getSql>>,
  ownerId: string,
  businessId: string,
  profile: unknown,
  options: { copyFromOwn: boolean; previousProcedures: unknown; heldNamedImages: boolean },
): Promise<void> {
  try {
    const { sweepImagesAfterSave } = await import("./procedures/image-store.server");
    await sweepImagesAfterSave(sql, ownerId, businessId, profile, options);
  } catch (err) {
    const { reportServerError } = await import("@/lib/observability/report.server");
    await reportServerError(err, "procedure-image-sweep");
  }
}

type BusinessRow = {
  id: string;
  name: string;
  industry: string;
  profile: PracticeProfile;
  updated_at: string;
  revision: number | string;
};

/**
 * Every business in the signed-in user's portfolio and their firm's
 * (summaries only). No row limit: saves refuse a new business past
 * MAX_BUSINESSES_PER_ACCOUNT instead, so the list and the limit agree and no
 * business is unreachable.
 */
export const listBusinesses = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const firm = await loadFirmFor(sql, context.userId);
    const rows = await listBusinessSummaries(sql, context.userId, firm?.firmUserId ?? null);
    return rows.map((r) => ({ ...r, industry: (r.industry as IndustryId) || "general" }));
  });

export const loadBusiness = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { id: string; ownerUserId?: string; today?: string }) =>
    parseOpenBusinessRequest(input),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const owner = await resolveBusinessOwner(sql, context.userId, data.id, false, data.ownerUserId);
    const rows = owner
      ? await sql<BusinessRow>`
          select id, name, industry, profile, updated_at, revision
          from businesses
          where user_id = ${owner} and id = ${data.id} and deleted_at is null
        `
      : [];
    const row = rows[0];
    if (!row) return { found: false as const, profile: null, revision: null };
    return {
      found: true as const,
      profile: {
        ...mergeProfile(row, data.today),
        businessId: row.id,
        ownerUserId: owner as string,
      },
      revision: Number(row.revision),
    };
  });

export const deleteBusiness = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; ownerUserId?: string; expectedAccountId: string }) =>
    parseDeleteBusinessRequest(input),
  )
  .handler(async ({ context, data }) => {
    assertExpectedAccount(data.expectedAccountId, context.userId);
    const sql = await getSql();
    const owner = await resolveBusinessOwner(sql, context.userId, data.id, false, data.ownerUserId);
    if (!owner) return { ok: true as const };
    // A repeated or racing delete changes nothing and writes no second row:
    // only the call that took the business from live to deleted logs it.
    if (await deleteBusinessRow(sql, owner, data.id, context.userId)) {
      await recordAuditForBusiness(sql, owner, data.id, {
        actorUserId: context.userId,
        event: "client_deleted",
      });
    }
    return { ok: true as const };
  });
