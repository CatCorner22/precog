import type { Sql } from "@/lib/db";
import { toIsoTimestamp } from "./iso-time";

export interface BusinessSaveInput {
  userId: string;
  businessId: string;
  name: string;
  industry: string;
  profileJson: string;
  /** null creates a new id; a positive revision only updates an existing id. */
  baseRevision: number | null;
  /** Save the active pointer in the SAME transaction as the business. */
  activate?: boolean;
}

export interface BusinessRowSnapshot<TProfile = unknown> {
  revision: number;
  profile: TProfile;
  industry: string;
  name: string;
  updated_at: string;
}

export type BusinessSaveResult<TProfile = unknown> =
  | { ok: true; revision: number; updatedAt: string }
  | { ok: false; conflict: true; existing: BusinessRowSnapshot<TProfile> };

export const MAX_BUSINESSES_PER_USER = 50;

export class BusinessLimitError extends Error {
  readonly status = 409;
  constructor(limit: number) {
    super(
      `Your account already holds ${limit} businesses, the most it can keep. Delete one you no longer need, then save again.`,
    );
    this.name = "BusinessLimitError";
  }
}

export class BusinessDeletedError extends Error {
  readonly status = 409;
  constructor() {
    super(
      "This business was deleted or no longer exists. Your local edits were not uploaded. Export them for recovery; creating a different business requires a new id.",
    );
    this.name = "BusinessDeletedError";
  }
}

/**
 * One database statement owns the transaction: account row lock, limit check,
 * revision check, write, and optional active-pointer write. This also works
 * through transaction-pooled connections and the PGLite preview. No BEGIN is
 * sent through independently pooled queries. See migration 0020.
 */
export async function saveBusinessRevision<TProfile = unknown>(
  sql: Sql,
  input: BusinessSaveInput,
  limit = MAX_BUSINESSES_PER_USER,
): Promise<BusinessSaveResult<TProfile>> {
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    (input.baseRevision !== null &&
      (!Number.isSafeInteger(input.baseRevision) || input.baseRevision < 1))
  ) {
    throw new Error("Invalid business revision or limit");
  }
  type Stored =
    BusinessSaveResult<TProfile> | { ok: false; deleted: true } | { ok: false; limit: true };
  const rows = await sql<{ result: Stored }>`
    select precog_save_business(
      ${input.userId}::text, ${input.businessId}::text, ${input.name}::text,
      ${input.industry}::text, ${input.profileJson}::jsonb,
      ${input.baseRevision}::bigint, ${limit}::int, ${input.activate ?? false}::boolean
    ) as result
  `;
  const result = rows[0]?.result;
  if (!result) throw new Error("Unable to save business profile");
  if (result.ok) {
    return {
      ...result,
      revision: Number(result.revision),
      updatedAt: toIsoTimestamp(result.updatedAt),
    };
  }
  if ("deleted" in result) throw new BusinessDeletedError();
  if ("limit" in result) throw new BusinessLimitError(limit);
  return {
    ok: false,
    conflict: true,
    existing: {
      ...result.existing,
      revision: Number(result.existing.revision),
      updated_at: toIsoTimestamp(result.existing.updated_at),
    },
  };
}

export interface BusinessSummaryRow {
  id: string;
  name: string;
  industry: string;
  updatedAt: string;
  processCount: number;
  healthScore: number | null;
}

/** All owned businesses, including rows predating the creation limit. */
export async function listBusinessSummaries(
  sql: Sql,
  userId: string,
): Promise<BusinessSummaryRow[]> {
  const rows = await sql<{
    id: string;
    name: string;
    industry: string;
    updated_at: unknown;
    process_count: number | string | null;
    health_score: unknown;
  }>`
    select id, name, industry, updated_at,
      case when jsonb_typeof(profile->'customProcesses') = 'array'
        then jsonb_array_length(profile->'customProcesses') else 0 end as process_count,
      case when jsonb_typeof(profile->'mapHealthHistory') = 'array'
        then profile->'mapHealthHistory'->-1->'score' end as health_score
    from businesses where user_id = ${userId} order by updated_at desc
  `;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    industry: r.industry,
    updatedAt: toIsoTimestamp(r.updated_at),
    processCount: Number(r.process_count ?? 0),
    healthScore:
      typeof r.health_score === "number" && Number.isFinite(r.health_score) ? r.health_score : null,
  }));
}

/** Legacy pointer support. New saves use activate:true, not a second call. */
export async function setActiveBusiness(
  sql: Sql,
  input: Omit<BusinessSaveInput, "baseRevision">,
): Promise<void> {
  await sql`
    select precog_set_active_business(
      ${input.userId}::text, ${input.businessId}::text, ${input.name}::text,
      ${input.industry}::text, ${input.profileJson}::jsonb
    )
  `;
}

export interface ActiveBusiness<TProfile = unknown> {
  businessId: string;
  name: string;
  industry: string;
  profile: TProfile;
  updated_at: string;
  revision: number | null;
}

export async function loadActiveBusiness<
  TProfile extends { businessId?: string } = { businessId?: string },
>(sql: Sql, userId: string): Promise<ActiveBusiness<TProfile> | null> {
  const pointer = await sql<{
    name: string;
    industry: string;
    profile: TProfile;
    updated_at: string;
  }>`select name, industry, profile, updated_at from business_profiles where user_id = ${userId}`;
  const active = pointer[0];
  if (!active) return null;
  const businessId =
    typeof active.profile.businessId === "string" ? active.profile.businessId : "biz_default";
  const rows = await sql<{
    name: string;
    industry: string;
    profile: TProfile;
    updated_at: string;
    revision: number | string;
  }>`
    select name, industry, profile, updated_at, revision from businesses
    where user_id = ${userId} and id = ${businessId}
  `;
  const authoritative = rows[0];
  if (authoritative) {
    return {
      businessId,
      ...authoritative,
      updated_at: toIsoTimestamp(authoritative.updated_at),
      revision: Number(authoritative.revision),
    };
  }
  // Only a genuinely legacy account may recover a pointer-only profile.
  const history = await sql`
    select 1 from businesses where user_id = ${userId}
    union all select 1 from business_tombstones where user_id = ${userId}
    limit 1
  `;
  if (history.length) return null;
  return { businessId, ...active, updated_at: toIsoTimestamp(active.updated_at), revision: null };
}

/** Audit rows also cascade atomically through the composite foreign keys. */
export async function deleteBusinessRow(
  sql: Sql,
  userId: string,
  businessId: string,
): Promise<void> {
  await sql`select precog_delete_business(${userId}::text, ${businessId}::text)`;
}
