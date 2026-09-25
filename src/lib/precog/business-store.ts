import type { Sql } from "@/lib/db";
import { toIsoTimestamp, toIsoTimestampOrNull } from "./iso-time";

/**
 * Revision-checked write of one business row.
 *
 * The check and the write are ONE statement: the `on conflict … do update`
 * carries `where businesses.revision = base`, so two clients that both loaded
 * revision N and save at the same moment cannot both succeed — Postgres
 * evaluates the predicate against the row it has just locked, and the loser's
 * update matches nothing. The earlier read-then-write version let the second
 * writer silently overwrite the first; `isStaleSave` in ./save-conflict still
 * documents the intended semantics, but the database now enforces them.
 *
 * A business row is keyed by its owner's user id. Members of the owner's firm
 * reach the same row (see `resolveBusinessOwner`), so `userId` here is always
 * the row's owner and `savedBy` the account that made the change.
 *
 * Kept free of `createServerFn` so it can run against PGLite in a unit test.
 */
export interface BusinessSaveInput {
  /** The row's owner (the account the business was created under). */
  userId: string;
  businessId: string;
  name: string;
  industry: string;
  /** Already-serialized profile, stored as jsonb. */
  profileJson: string;
  /** Revision the client last loaded for this business; null when it never has. */
  baseRevision: number | null;
  /** The account saving; defaults to the owner. */
  savedBy?: string;
  /** The firm a new business belongs to; ignored for an existing row. */
  firmUserId?: string | null;
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

/** Businesses one account may keep in the cloud. Saves to existing ones always go through. */
export const MAX_BUSINESSES_PER_USER = 50;
/** Versions kept per business before the oldest are dropped. */
export const MAX_HISTORY_PER_BUSINESS = 200;
/** Days a deleted business stays restorable before the purge job removes it. */
export const DELETED_RETENTION_DAYS = 30;

export class BusinessLimitError extends Error {
  readonly status = 409;
  constructor(limit: number) {
    super(
      `Your account already holds ${limit} businesses, the most it can keep. Delete one you no longer need, then save again.`,
    );
    this.name = "BusinessLimitError";
  }
}

/**
 * The owner of the business `userId` may work on: their own row first, else
 * a row that belongs to their firm. Null when there is no such live row.
 */
export async function resolveBusinessOwner(
  sql: Sql,
  userId: string,
  businessId: string,
): Promise<string | null> {
  const rows = await sql<{ user_id: string }>`
    select b.user_id
    from businesses b
    where b.id = ${businessId}
      and b.deleted_at is null
      and (
        b.user_id = ${userId}
        or (
          b.firm_user_id is not null
          and b.firm_user_id in (
            select firm_user_id from firm_members where member_user_id = ${userId}
          )
        )
      )
    order by (b.user_id = ${userId}) desc
    limit 1
  `;
  return rows[0]?.user_id ?? null;
}

export async function saveBusinessRevision<TProfile = unknown>(
  sql: Sql,
  input: BusinessSaveInput,
  limit = MAX_BUSINESSES_PER_USER,
): Promise<BusinessSaveResult<TProfile>> {
  const savedBy = input.savedBy ?? input.userId;

  // The version about to be replaced goes to the history first. It matches
  // only at the caller's base revision, so a stale save records nothing; a
  // race that records the same version twice is absorbed by the unique key.
  if (input.baseRevision !== null) {
    await sql`
      insert into business_history
        (user_id, business_id, revision, name, industry, profile, saved_by, saved_at)
      select user_id, id, revision, name, industry, profile, saved_by, updated_at
      from businesses
      where user_id = ${input.userId} and id = ${input.businessId}
        and revision = ${input.baseRevision}::bigint
      on conflict (user_id, business_id, revision) do nothing
    `;
  }

  // First save of a business: no row, so no conflict target — plain insert at
  // revision 1, provided the account is under its business limit. Existing
  // row: update only when the caller's base revision matches. `null::bigint`
  // never equals anything, so a client that never loaded this business cannot
  // overwrite a row that exists (that is the "stale" case the client resolves
  // through the conflict banner). Two first saves racing at the limit can
  // both pass; listBusinessSummaries has no limit, so neither is hidden.
  const written = await sql<{ revision: number | string; updated_at: string }>`
    insert into businesses
      (id, user_id, name, industry, profile, revision, updated_at, saved_by, firm_user_id)
    select
      ${input.businessId}::text,
      ${input.userId}::text,
      ${input.name}::text,
      ${input.industry}::text,
      ${input.profileJson}::jsonb,
      1,
      now(),
      ${savedBy}::text,
      ${input.firmUserId ?? null}::text
    where exists (
        select 1 from businesses where user_id = ${input.userId} and id = ${input.businessId}
      )
      or (
        select count(*) from businesses where user_id = ${input.userId} and deleted_at is null
      ) < ${limit}::int
    on conflict (user_id, id) do update set
      name = excluded.name,
      industry = excluded.industry,
      profile = excluded.profile,
      revision = businesses.revision + 1,
      updated_at = now(),
      saved_by = excluded.saved_by,
      firm_user_id = coalesce(businesses.firm_user_id, excluded.firm_user_id)
    where businesses.revision = ${input.baseRevision}::bigint
      and businesses.deleted_at is null
    returning revision, updated_at
  `;
  const row = written[0];
  if (row) {
    if (input.baseRevision !== null) await pruneHistory(sql, input.userId, input.businessId);
    return { ok: true, revision: Number(row.revision), updatedAt: toIsoTimestamp(row.updated_at) };
  }

  // Nothing written: the row exists at some other revision. Read it so the
  // client can show what it would be overwriting.
  const existingRows = await sql<{
    revision: number | string;
    profile: TProfile;
    industry: string;
    name: string;
    updated_at: string;
  }>`
    select revision, profile, industry, name, updated_at
    from businesses
    where id = ${input.businessId} and user_id = ${input.userId}
  `;
  const existing = existingRows[0];
  if (!existing) {
    // No row and nothing written: the account is at its business limit (or,
    // rarely, the row was deleted between the two statements).
    const held = await sql<{ n: number | string }>`
      select count(*) as n from businesses where user_id = ${input.userId} and deleted_at is null
    `;
    if (Number(held[0]?.n ?? 0) >= limit) throw new BusinessLimitError(limit);
    throw new Error("Unable to save business profile");
  }
  return {
    ok: false,
    conflict: true,
    existing: {
      revision: Number(existing.revision),
      profile: existing.profile,
      industry: existing.industry,
      name: existing.name,
      updated_at: toIsoTimestamp(existing.updated_at),
    },
  };
}

async function pruneHistory(sql: Sql, userId: string, businessId: string): Promise<void> {
  await sql`
    delete from business_history
    where user_id = ${userId} and business_id = ${businessId}
      and revision <= (
        select coalesce(max(revision), 0) from business_history
        where user_id = ${userId} and business_id = ${businessId}
      ) - ${MAX_HISTORY_PER_BUSINESS}::bigint
  `;
}

export interface BusinessHistoryEntry {
  revision: number;
  name: string;
  savedBy: string | null;
  savedByName: string | null;
  savedAt: string;
  peopleCount: number;
  processCount: number;
  decisionCount: number;
}

/** Past versions of one business, newest first, without the profiles themselves. */
export async function listBusinessHistory(
  sql: Sql,
  ownerUserId: string,
  businessId: string,
  limit = 60,
): Promise<BusinessHistoryEntry[]> {
  const rows = await sql<{
    revision: number | string;
    name: string;
    saved_by: string | null;
    saved_by_name: string | null;
    saved_at: string;
    people_count: number | string | null;
    process_count: number | string | null;
    decision_count: number | string | null;
  }>`
    select
      h.revision, h.name, h.saved_by, u.name as saved_by_name, h.saved_at,
      case when jsonb_typeof(h.profile->'customPeople') = 'array'
        then jsonb_array_length(h.profile->'customPeople') else 0 end as people_count,
      case when jsonb_typeof(h.profile->'customProcesses') = 'array'
        then jsonb_array_length(h.profile->'customProcesses') else 0 end as process_count,
      case when jsonb_typeof(h.profile->'decisions') = 'array'
        then jsonb_array_length(h.profile->'decisions') else 0 end as decision_count
    from business_history h
    left join "user" u on u.id = h.saved_by
    where h.user_id = ${ownerUserId} and h.business_id = ${businessId}
    order by h.revision desc
    limit ${limit}::int
  `;
  return rows.map((r) => ({
    revision: Number(r.revision),
    name: r.name,
    savedBy: r.saved_by,
    savedByName: r.saved_by_name,
    savedAt: toIsoTimestamp(r.saved_at),
    peopleCount: Number(r.people_count ?? 0),
    processCount: Number(r.process_count ?? 0),
    decisionCount: Number(r.decision_count ?? 0),
  }));
}

/** One past version in full, or null. */
export async function loadBusinessHistoryVersion<TProfile = unknown>(
  sql: Sql,
  ownerUserId: string,
  businessId: string,
  revision: number,
): Promise<{ profile: TProfile; name: string; industry: string; savedAt: string } | null> {
  const rows = await sql<{ profile: TProfile; name: string; industry: string; saved_at: string }>`
    select profile, name, industry, saved_at from business_history
    where user_id = ${ownerUserId} and business_id = ${businessId} and revision = ${revision}::bigint
  `;
  const row = rows[0];
  return row
    ? {
        profile: row.profile,
        name: row.name,
        industry: row.industry,
        savedAt: toIsoTimestamp(row.saved_at),
      }
    : null;
}

export interface BusinessSummaryRow {
  id: string;
  name: string;
  industry: string;
  updatedAt: string;
  processCount: number;
  healthScore: number | null;
  /** The account the business was created under. */
  ownerUserId: string;
  /** True when the business is a firm colleague's rather than the caller's own. */
  shared: boolean;
}

/**
 * Every live business the account owns or its firm shares with it, newest
 * first, with no row limit: a limit below the number a user can hold would
 * leave the rest unreachable from a new device. The summary figures are read
 * inside Postgres so the list does not pull every full profile (up to 2 MB
 * each) across the wire.
 */
export async function listBusinessSummaries(
  sql: Sql,
  userId: string,
  firmUserId: string | null = null,
): Promise<BusinessSummaryRow[]> {
  const rows = await sql<{
    id: string;
    user_id: string;
    name: string;
    industry: string;
    updated_at: unknown;
    process_count: number | string | null;
    health_score: unknown;
  }>`
    select
      id, user_id, name, industry, updated_at,
      case when jsonb_typeof(profile->'customProcesses') = 'array'
        then jsonb_array_length(profile->'customProcesses') else 0 end as process_count,
      case when jsonb_typeof(profile->'mapHealthHistory') = 'array'
        then profile->'mapHealthHistory'->-1->'score' end as health_score
    from businesses
    where deleted_at is null
      and (user_id = ${userId} or (${firmUserId}::text is not null and firm_user_id = ${firmUserId}))
    order by updated_at desc
  `;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    industry: r.industry,
    updatedAt: toIsoTimestamp(r.updated_at),
    processCount: Number(r.process_count ?? 0),
    healthScore:
      typeof r.health_score === "number" && Number.isFinite(r.health_score) ? r.health_score : null,
    ownerUserId: r.user_id,
    shared: r.user_id !== userId,
  }));
}

/**
 * `business_profiles` is only the "which business is active" pointer (one row
 * per user, kept for clients that predate the portfolio). The revision-checked
 * `businesses` row is the authoritative copy, so it is written first and read
 * back preferentially: if the pointer write fails or lags, the next load still
 * sees the newest saved profile rather than resurrecting a stale one.
 */
export async function setActiveBusiness(
  sql: Sql,
  input: Omit<BusinessSaveInput, "baseRevision">,
): Promise<void> {
  await sql`
    insert into business_profiles (user_id, name, industry, profile, updated_at)
    values (
      ${input.userId},
      ${input.name},
      ${input.industry},
      ${input.profileJson}::jsonb,
      now()
    )
    on conflict (user_id) do update set
      name = excluded.name,
      industry = excluded.industry,
      profile = excluded.profile,
      updated_at = now()
  `;
}

export interface ActiveBusiness<TProfile = unknown> {
  businessId: string;
  name: string;
  industry: string;
  profile: TProfile;
  updated_at: string;
  /** null when only the legacy pointer row exists (no revision-tracked copy yet). */
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
  }>`
    select name, industry, profile, updated_at
    from business_profiles
    where user_id = ${userId}
  `;
  const active = pointer[0];
  if (!active) return null;
  const businessId =
    typeof active.profile.businessId === "string" ? active.profile.businessId : "biz_default";

  const owner = await resolveBusinessOwner(sql, userId, businessId);
  const rows = owner
    ? await sql<{
        name: string;
        industry: string;
        profile: TProfile;
        updated_at: string;
        revision: number | string;
      }>`
        select name, industry, profile, updated_at, revision
        from businesses
        where user_id = ${owner} and id = ${businessId}
      `
    : [];
  const authoritative = rows[0];
  if (!authoritative) {
    // The pointer names a business that no longer exists. For a user who has
    // any revision-tracked business, that is a dangling pointer (the business
    // was deleted), not a legacy account, so nothing is resurrected from it.
    const others = await sql`select 1 from businesses where user_id = ${userId} limit 1`;
    if (others.length > 0) return null;
  }
  if (authoritative) {
    return {
      businessId,
      name: authoritative.name,
      industry: authoritative.industry,
      profile: authoritative.profile,
      updated_at: toIsoTimestamp(authoritative.updated_at),
      revision: Number(authoritative.revision),
    };
  }
  return {
    businessId,
    name: active.name,
    industry: active.industry,
    profile: active.profile,
    updated_at: toIsoTimestamp(active.updated_at),
    revision: null,
  };
}

/**
 * Marks one business deleted and, when the caller's active pointer names it,
 * drops the pointer too, so a later load cannot bring the deleted business
 * back from the pointer's frozen copy. The row and its history, reviews and
 * report versions stay until `purgeDeletedBusinesses` runs after the grace
 * period, so a deletion can be undone.
 */
export async function deleteBusinessRow(
  sql: Sql,
  ownerUserId: string,
  businessId: string,
  pointerUserId = ownerUserId,
): Promise<void> {
  await sql`
    update businesses set deleted_at = now()
    where user_id = ${ownerUserId} and id = ${businessId} and deleted_at is null
  `;
  await sql`
    delete from business_profiles
    where user_id = ${pointerUserId}
      and coalesce(profile->>'businessId', 'biz_default') = ${businessId}
  `;
}

export async function restoreBusinessRow(
  sql: Sql,
  ownerUserId: string,
  businessId: string,
): Promise<boolean> {
  const rows = await sql<{ id: string }>`
    update businesses set deleted_at = null
    where user_id = ${ownerUserId} and id = ${businessId} and deleted_at is not null
    returning id
  `;
  return rows.length > 0;
}

export interface DeletedBusinessRow {
  id: string;
  name: string;
  industry: string;
  deletedAt: string;
  purgeOn: string;
}

/** Businesses the caller or their firm deleted within the grace period. */
export async function listDeletedBusinesses(
  sql: Sql,
  userId: string,
  firmUserId: string | null = null,
): Promise<DeletedBusinessRow[]> {
  const rows = await sql<{
    id: string;
    name: string;
    industry: string;
    deleted_at: string;
    purge_on: string | null;
  }>`
    select id, name, industry, deleted_at,
      deleted_at + make_interval(days => ${DELETED_RETENTION_DAYS}::int) as purge_on
    from businesses
    where deleted_at is not null
      and (user_id = ${userId} or (${firmUserId}::text is not null and firm_user_id = ${firmUserId}))
    order by deleted_at desc
  `;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    industry: r.industry,
    deletedAt: toIsoTimestamp(r.deleted_at),
    purgeOn: toIsoTimestampOrNull(r.purge_on) ?? toIsoTimestamp(r.deleted_at),
  }));
}

/** Removes businesses deleted more than the retention period ago. Returns how many. */
export async function purgeDeletedBusinesses(
  sql: Sql,
  retentionDays = DELETED_RETENTION_DAYS,
): Promise<number> {
  const rows = await sql<{ id: string }>`
    delete from businesses
    where deleted_at is not null
      and deleted_at < now() - make_interval(days => ${retentionDays}::int)
    returning id
  `;
  return rows.length;
}
