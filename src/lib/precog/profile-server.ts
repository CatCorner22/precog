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
  saveBusinessRevision,
  setActiveBusiness,
} from "./business-store";
import { resolveClientDate } from "./continuity/coverage";

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
      const checked = validateProfileInput(input.profile);
      const industry = input.industry ?? checked.profile.industry;
      if (!isIndustryId(industry)) throw new Error("Unknown industry");
      const baseRevision = input.baseRevision == null ? null : Number(input.baseRevision);
      return {
        ...checked,
        industry,
        baseRevision: Number.isFinite(baseRevision) ? baseRevision : null,
        today: resolveClientDate(input.today),
      };
    },
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const name = data.profile.practiceName.trim().slice(0, 80) || "My Business";
    const { businessId, json: profileJson } = data;

    // Revision check and write are a single compare-and-swap statement; see
    // business-store.ts. The table is keyed by (user_id, id), so another
    // user's business with the same client-generated id is a different row.
    const saved = await saveBusinessRevision<PracticeProfile>(sql, {
      userId: context.userId,
      businessId,
      name,
      industry: data.industry,
      profileJson,
      baseRevision: data.baseRevision,
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
 * Every business in the signed-in user's portfolio (summaries only). No row
 * limit: saves refuse a new business past MAX_BUSINESSES_PER_USER instead, so
 * the list and the limit agree and no business is unreachable.
 */
export const listBusinesses = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await listBusinessSummaries(sql, context.userId);
    return rows.map((r) => ({ ...r, industry: (r.industry as IndustryId) || "general" }));
  });

export const loadBusiness = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { id: string; today?: string }) => {
    if (!isBusinessId(input.id)) throw new Error("Unknown business id");
    return { id: input.id, today: resolveClientDate(input.today) };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const rows = await sql<BusinessRow>`
      select id, name, industry, profile, updated_at, revision
      from businesses
      where user_id = ${context.userId} and id = ${data.id}
    `;
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
    if (!isBusinessId(input.id)) throw new Error("Unknown business id");
    return { id: input.id };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await deleteBusinessRow(sql, context.userId, data.id);
    return { ok: true as const };
  });
