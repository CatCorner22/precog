import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import type { IndustryId } from "./industry";
import { isBusinessId, isIndustryId, validateProfileInput } from "./profile-input";
import {
  defaultProfile,
  normalizeCustomKnowledge,
  normalizePlannedAbsences,
  type PracticeProfile,
} from "./practice-profile";
import {
  deleteBusinessRow,
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

function mergeProfile(
  row: {
    name: string;
    industry: string;
    profile: PracticeProfile;
  },
  today: string,
): PracticeProfile {
  const base = defaultProfile((row.industry as IndustryId) || row.profile.industry || "dental");
  return {
    ...base,
    ...row.profile,
    practiceName: row.name || row.profile.practiceName || base.practiceName,
    staff: { ...base.staff, ...row.profile.staff },
    riskVariables: { ...base.riskVariables, ...row.profile.riskVariables },
    dualRelease: { ...base.dualRelease, ...row.profile.dualRelease },
    decisions: Array.isArray(row.profile.decisions) ? row.profile.decisions : [],
    customProcesses: Array.isArray(row.profile.customProcesses)
      ? row.profile.customProcesses
      : null,
    customPeople: Array.isArray(row.profile.customPeople) ? row.profile.customPeople : null,
    customKnowledge: normalizeCustomKnowledge(row.profile.customKnowledge, today),
    customRelations: Array.isArray(row.profile.customRelations)
      ? row.profile.customRelations
      : null,
    plannedAbsences: normalizePlannedAbsences(row.profile.plannedAbsences),
    mapLayout: row.profile.mapLayout ?? {},
    savedProcessBlocks: Array.isArray(row.profile.savedProcessBlocks)
      ? row.profile.savedProcessBlocks
      : [],
    mapHealthHistory: Array.isArray(row.profile.mapHealthHistory)
      ? row.profile.mapHealthHistory
      : [],
    mapVersions: Array.isArray(row.profile.mapVersions) ? row.profile.mapVersions : [],
  };
}

/** Every business in the signed-in user's portfolio (summaries only). */
export const listBusinesses = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql<BusinessRow>`
      select id, name, industry, profile, updated_at, revision
      from businesses
      where user_id = ${context.userId}
      order by updated_at desc
      limit 50
    `;
    return rows.map((r) => {
      const history = Array.isArray(r.profile.mapHealthHistory) ? r.profile.mapHealthHistory : [];
      return {
        id: r.id,
        name: r.name,
        industry: (r.industry as IndustryId) || "general",
        updatedAt: r.updated_at,
        processCount: Array.isArray(r.profile.customProcesses)
          ? r.profile.customProcesses.length
          : 0,
        healthScore: history.length ? history[history.length - 1].score : null,
      };
    });
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
