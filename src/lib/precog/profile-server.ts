import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import type { IndustryId } from "./industry";
import { defaultProfile, type PracticeProfile } from "./practice-profile";
import { isStaleSave } from "./save-conflict";

type ProfileRow = {
  name: string;
  industry: string;
  profile: PracticeProfile;
  updated_at: string;
};

type RevisionRow = {
  revision: number | string;
};

export const loadBusinessProfile = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql<ProfileRow>`
      select name, industry, profile, updated_at
      from business_profiles
      where user_id = ${context.userId}
    `;
    if (rows.length === 0) {
      return {
        found: false as const,
        profile: null,
        industry: "dental" as IndustryId,
        revision: null,
      };
    }
    const row = rows[0];
    const base = defaultProfile((row.industry as IndustryId) || row.profile.industry || "dental");
    const merged: PracticeProfile = {
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
      mapLayout: row.profile.mapLayout ?? {},
      savedProcessBlocks: Array.isArray(row.profile.savedProcessBlocks)
        ? row.profile.savedProcessBlocks
        : [],
      mapHealthHistory: Array.isArray(row.profile.mapHealthHistory)
        ? row.profile.mapHealthHistory
        : [],
      mapVersions: Array.isArray(row.profile.mapVersions) ? row.profile.mapVersions : [],
      businessId:
        typeof row.profile.businessId === "string" ? row.profile.businessId : "biz_default",
    };
    const revisionRows = await sql<RevisionRow>`
      select revision
      from businesses
      where id = ${merged.businessId ?? "biz_default"} and user_id = ${context.userId}
    `;
    return {
      found: true as const,
      profile: merged,
      industry: (row.industry as IndustryId) || "dental",
      updatedAt: row.updated_at,
      revision: revisionRows[0] ? Number(revisionRows[0].revision) : null,
    };
  });

export const saveBusinessProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: { profile: PracticeProfile; industry?: IndustryId; baseRevision?: number | null }) => ({
      profile: input.profile,
      industry: input.industry ?? "dental",
      baseRevision: input.baseRevision == null ? null : Number(input.baseRevision),
    }),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const name = data.profile.practiceName.slice(0, 80);
    const businessId = data.profile.businessId ?? "biz_default";
    const existingRows = await sql<{
      revision: number | string;
      profile: PracticeProfile;
      industry: string;
      name: string;
      updated_at: string;
    }>`
      select revision, profile, industry, name, updated_at
      from businesses
      where id = ${businessId} and user_id = ${context.userId}
    `;
    const existing = existingRows[0];
    if (isStaleSave(existing ? Number(existing.revision) : null, data.baseRevision)) {
      return {
        ok: false as const,
        conflict: true as const,
        revision: Number(existing.revision),
        updatedAt: String(existing.updated_at),
        profile: { ...mergeProfile(existing), businessId },
      };
    }

    const updatedRows = await sql<{ revision: number | string; updated_at: string }>`
      insert into businesses (id, user_id, name, industry, profile, revision, updated_at)
      values (
        ${businessId},
        ${context.userId},
        ${name},
        ${data.industry},
        ${JSON.stringify(data.profile)}::jsonb,
        1,
        now()
      )
      on conflict (id) do update set
        name = excluded.name,
        industry = excluded.industry,
        profile = excluded.profile,
        revision = coalesce(businesses.revision, 0) + 1,
        updated_at = now()
      where businesses.user_id = ${context.userId}
      returning revision, updated_at
    `;
    const updated = updatedRows[0];
    if (!updated) throw new Error("Unable to save business profile");

    await sql`
      insert into business_profiles (user_id, name, industry, profile, updated_at)
      values (
        ${context.userId},
        ${name},
        ${data.industry},
        ${JSON.stringify(data.profile)}::jsonb,
        now()
      )
      on conflict (user_id) do update set
        name = excluded.name,
        industry = excluded.industry,
        profile = excluded.profile,
        updated_at = now()
    `;
    return {
      ok: true as const,
      revision: Number(updated.revision),
      updatedAt: String(updated.updated_at),
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

function mergeProfile(row: {
  name: string;
  industry: string;
  profile: PracticeProfile;
}): PracticeProfile {
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
  .validator((input: { id: string }) => ({ id: String(input.id).slice(0, 64) }))
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
      profile: { ...mergeProfile(row), businessId: row.id },
      revision: Number(row.revision),
    };
  });

export const deleteBusiness = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string }) => ({ id: String(input.id).slice(0, 64) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await sql`delete from businesses where user_id = ${context.userId} and id = ${data.id}`;
    return { ok: true as const };
  });
