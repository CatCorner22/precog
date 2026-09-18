import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import type { IndustryId } from "./industry";
import { defaultProfile, type PracticeProfile } from "./practice-profile";

type ProfileRow = {
  name: string;
  industry: string;
  profile: PracticeProfile;
  updated_at: string;
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
      return { found: false as const, profile: null, industry: "dental" as IndustryId };
    }
    const row = rows[0];
    const base = defaultProfile();
    const merged: PracticeProfile = {
      ...base,
      ...row.profile,
      practiceName: row.name || row.profile.practiceName || base.practiceName,
      staff: { ...base.staff, ...row.profile.staff },
      riskVariables: { ...base.riskVariables, ...row.profile.riskVariables },
      dualRelease: { ...base.dualRelease, ...row.profile.dualRelease },
      decisions: Array.isArray(row.profile.decisions) ? row.profile.decisions : [],
    };
    return {
      found: true as const,
      profile: merged,
      industry: (row.industry as IndustryId) || "dental",
      updatedAt: row.updated_at,
    };
  });

export const saveBusinessProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: { profile: PracticeProfile; industry?: IndustryId }) => ({
      profile: input.profile,
      industry: input.industry ?? "dental",
    }),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const name = data.profile.practiceName.slice(0, 80);
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
    return { ok: true as const };
  });
