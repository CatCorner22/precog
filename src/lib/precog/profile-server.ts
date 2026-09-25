import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import type { IndustryId } from "./industry";
import { isBusinessId, isIndustryId, validateProfileInput } from "./profile-input";
import type { PracticeProfile } from "./practice-profile";
import { mergeProfile } from "./profile-merge";
import {
  deleteBusinessRow,
  listBusinessSummaries,
  loadActiveBusiness,
  resolveBusinessOwner,
  saveBusinessRevision,
  setActiveBusiness,
} from "./business-store";
import { loadFirmFor } from "./firm/store";
import { resolveClientDate } from "./continuity/coverage";
import { invalidRequest, RequestError, requireObject } from "@/lib/request-errors";

export const loadBusinessProfile = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input?: { today?: string }) => ({ today: resolveClientDate(input?.today) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const active = await loadActiveBusiness<PracticeProfile>(sql, context.userId);
    if (!active) {
      return {
        found: false as const,
        profile: null,
        industry: "dental" as IndustryId,
        revision: null,
      };
    }
    return {
      found: true as const,
      profile: { ...mergeProfile(active, data.today), businessId: active.businessId },
      industry: (active.industry as IndustryId) || "dental",
      updatedAt: active.updated_at,
      revision: active.revision,
    };
  });

export const saveBusinessProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      profile: PracticeProfile;
      industry?: IndustryId;
      baseRevision?: number | null;
      today?: string;
    }) => {
      const raw = requireObject(input);
      const checked = validateProfileInput(raw.profile);
      const industry = raw.industry ?? checked.profile.industry;
      if (!isIndustryId(industry)) throw new RequestError(400, "Unknown industry");
      if (raw.baseRevision != null && typeof raw.baseRevision !== "number") throw invalidRequest();
      const baseRevision = raw.baseRevision ?? null;
      return {
        ...checked,
        industry,
        baseRevision: baseRevision !== null && Number.isFinite(baseRevision) ? baseRevision : null,
        today: resolveClientDate(raw.today),
      };
    },
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const name = data.profile.practiceName.trim().slice(0, 80) || "My Business";
    const { businessId, json: profileJson } = data;

    // A firm member saving a colleague's client writes the colleague's row;
    // a new business is created under the saver and joins their firm.
    const [owner, firm] = await Promise.all([
      resolveBusinessOwner(sql, context.userId, businessId),
      loadFirmFor(sql, context.userId),
    ]);

    // Revision check and write are a single compare-and-swap statement; see
    // business-store.ts. The table is keyed by (user_id, id), so another
    // user's business with the same client-generated id is a different row.
    const saved = await saveBusinessRevision<PracticeProfile>(sql, {
      userId: owner ?? context.userId,
      businessId,
      name,
      industry: data.industry,
      profileJson,
      baseRevision: data.baseRevision,
      savedBy: context.userId,
      firmUserId: firm?.firmUserId ?? null,
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

    // Second write is only the active-business pointer; loads read the
    // revision-checked row above first, so a failure here cannot resurrect a
    // stale profile (see loadActiveBusiness).
    await setActiveBusiness(sql, {
      userId: context.userId,
      businessId,
      name,
      industry: data.industry,
      profileJson,
    });
    return {
      ok: true as const,
      revision: saved.revision,
      updatedAt: saved.updatedAt,
    };
  });

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
 * MAX_BUSINESSES_PER_USER instead, so the list and the limit agree and no
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
  .validator((input: { id: string; today?: string }) => {
    const raw = requireObject(input);
    if (!isBusinessId(raw.id)) throw new RequestError(400, "Unknown business id");
    return { id: raw.id, today: resolveClientDate(raw.today) };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const owner = await resolveBusinessOwner(sql, context.userId, data.id);
    const rows = owner
      ? await sql<BusinessRow>`
          select id, name, industry, profile, updated_at, revision
          from businesses
          where user_id = ${owner} and id = ${data.id}
        `
      : [];
    const row = rows[0];
    if (!row) return { found: false as const, profile: null, revision: null };
    return {
      found: true as const,
      profile: { ...mergeProfile(row, data.today), businessId: row.id },
      revision: Number(row.revision),
    };
  });

export const deleteBusiness = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string }) => {
    const raw = requireObject(input);
    if (!isBusinessId(raw.id)) throw new RequestError(400, "Unknown business id");
    return { id: raw.id };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const owner = await resolveBusinessOwner(sql, context.userId, data.id);
    if (owner) await deleteBusinessRow(sql, owner, data.id, context.userId);
    return { ok: true as const };
  });
