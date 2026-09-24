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
} from "./business-store";
import { resolveClientDate } from "./continuity/coverage";
import { invalidRequest, RequestError, requireObject } from "@/lib/request-errors";
import { assertProfileOwner, browserWorkspace } from "./sync/workspace";
import { acknowledgeCloud, serialWorkspaceWrite } from "./sync/save-coordinator";

const loadProfileRequest = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input?: { today?: string }) => ({ today: resolveClientDate(input?.today) }))
  .handler(async ({ context, data }) => {
    const active = await loadActiveBusiness<PracticeProfile>(await getSql(), context.userId);
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
      profile: {
        ...mergeProfile(active, data.today),
        businessId: active.businessId,
        workspaceOwnerId: context.userId,
      },
      industry: (active.industry as IndustryId) || "dental",
      updatedAt: active.updated_at,
      revision: active.revision,
    };
  });

export async function loadBusinessProfile(options?: { data?: { today?: string } }) {
  const token = browserWorkspace.snapshot();
  const result = await loadProfileRequest(options);
  if (token) {
    browserWorkspace.assertCurrent(token);
    if (result.found && result.profile) {
      assertProfileOwner(result.profile, token.owner);
      acknowledgeCloud(token, result.profile.businessId, result.profile.updatedAt, result.revision);
    }
  }
  return result;
}

interface SaveInput {
  profile: PracticeProfile;
  industry?: IndustryId;
  baseRevision?: number | null;
  today?: string;
}

const saveProfileRequest = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: SaveInput) => {
    const raw = requireObject(input);
    const checked = validateProfileInput(raw.profile);
    const industry = raw.industry ?? checked.profile.industry;
    if (!isIndustryId(industry)) throw new RequestError(400, "Unknown industry");
    const baseRevision = raw.baseRevision ?? null;
    if (
      baseRevision !== null &&
      (typeof baseRevision !== "number" || !Number.isSafeInteger(baseRevision) || baseRevision < 1)
    ) {
      throw invalidRequest();
    }
    return { ...checked, industry, baseRevision, today: resolveClientDate(raw.today) };
  })
  .handler(async ({ context, data }) => {
    if (data.profile.workspaceOwnerId !== context.userId) {
      throw new RequestError(
        409,
        "This profile is not assigned to the signed-in account. Refresh before saving.",
      );
    }
    const { businessId, json: profileJson } = data;
    const saved = await saveBusinessRevision<PracticeProfile>(await getSql(), {
      userId: context.userId,
      businessId,
      name: data.profile.practiceName.trim().slice(0, 80) || "My Business",
      industry: data.industry,
      profileJson,
      baseRevision: data.baseRevision,
      activate: true,
    });
    if (!saved.ok) {
      return {
        ok: false as const,
        conflict: true as const,
        revision: saved.existing.revision,
        updatedAt: saved.existing.updated_at,
        profile: {
          ...mergeProfile(saved.existing, data.today),
          businessId,
          workspaceOwnerId: context.userId,
        },
      };
    }
    return { ok: true as const, revision: saved.revision, updatedAt: saved.updatedAt };
  });

export async function saveBusinessProfile(options: { data: SaveInput }) {
  const token = browserWorkspace.snapshot();
  if (typeof window === "undefined") return saveProfileRequest(options);
  if (!token || token.owner === null) throw new Error("Sign in before saving to an account.");
  assertProfileOwner(options.data.profile, token.owner);
  const id = options.data.profile.businessId ?? "biz_default";
  return serialWorkspaceWrite(token, id, async () => {
    const result = await saveProfileRequest(options);
    if (result.ok) acknowledgeCloud(token, id, options.data.profile.updatedAt, result.revision);
    return result;
  });
}

export const listBusinesses = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const rows = await listBusinessSummaries(await getSql(), context.userId);
    return rows.map((r) => ({ ...r, industry: (r.industry as IndustryId) || "general" }));
  });

type BusinessRow = {
  id: string;
  name: string;
  industry: string;
  profile: PracticeProfile;
  updated_at: string;
  revision: number | string;
};

const loadBusinessRequest = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { id: string; today?: string }) => {
    const raw = requireObject(input);
    if (!isBusinessId(raw.id)) throw new RequestError(400, "Unknown business id");
    return { id: raw.id, today: resolveClientDate(raw.today) };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const rows = await sql<BusinessRow>`
      select id, name, industry, profile, updated_at, revision from businesses
      where user_id = ${context.userId} and id = ${data.id}
    `;
    const row = rows[0];
    if (!row) return { found: false as const, profile: null, revision: null };
    return {
      found: true as const,
      profile: {
        ...mergeProfile(row, data.today),
        businessId: row.id,
        workspaceOwnerId: context.userId,
      },
      revision: Number(row.revision),
    };
  });

export async function loadBusiness(options: { data: { id: string; today?: string } }) {
  const token = browserWorkspace.snapshot();
  const result = await loadBusinessRequest(options);
  if (token) {
    browserWorkspace.assertCurrent(token);
    if (result.found && result.profile) {
      assertProfileOwner(result.profile, token.owner);
      acknowledgeCloud(token, result.profile.businessId, result.profile.updatedAt, result.revision);
    }
  }
  return result;
}

const deleteBusinessRequest = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string }) => {
    const raw = requireObject(input);
    if (!isBusinessId(raw.id)) throw new RequestError(400, "Unknown business id");
    return { id: raw.id };
  })
  .handler(async ({ context, data }) => {
    await deleteBusinessRow(await getSql(), context.userId, data.id);
    return { ok: true as const };
  });

export async function deleteBusiness(options: { data: { id: string } }) {
  const token = browserWorkspace.snapshot();
  if (typeof window === "undefined") return deleteBusinessRequest(options);
  if (!token || token.owner === null) throw new Error("Sign in before deleting an account business.");
  return serialWorkspaceWrite(token, options.data.id, () => deleteBusinessRequest(options));
}
