import type { Sql } from "@/lib/db";
import { inTransaction } from "@/lib/sql-transaction";
import { RequestError } from "@/lib/request-errors";
import { toIsoTimestamp, toIsoTimestampOrNull } from "./iso-time";

/**
 * Revision-checked write of one business row.
 *
 * The owner lock, expected revision, history and active pointer are one
 * transaction. Creation is allowed only without a base revision and never
 * over a deletion marker. Updates cannot implicitly recreate a missing row.
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
  /** Set the saver's active pointer in the same transaction as this save. */
  activate?: boolean;
}

interface BusinessRowSnapshot<TProfile = unknown> {
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
const MAX_HISTORY_PER_BUSINESS = 200;
/** Days a deleted business stays restorable before the purge job removes it. */
const DELETED_RETENTION_DAYS = 30;

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
  includeDeleted = false,
): Promise<string | null> {
  const rows = await sql<{ user_id: string }>`
    select b.user_id
    from businesses b
    where b.id = ${businessId}
      and (b.deleted_at is null or ${includeDeleted})
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
  if (rows[0]) return rows[0].user_id;
  if (!includeDeleted) return null;
  const markers = await sql<{ user_id: string }>`
    select d.user_id from business_deletion_markers d
    where d.business_id = ${businessId} and (
      d.user_id = ${userId} or d.firm_user_id in (
        select firm_user_id from firm_members where member_user_id = ${userId}
      )
    ) order by (d.user_id = ${userId}) desc limit 1
  `;
  return markers[0]?.user_id ?? null;
}

/** A missing/deleted row is not permission to insert an old copy. */
export class BusinessUnavailableError extends RequestError {
  constructor() {
    super(
      409,
      "This business was deleted or is no longer available. Reload your business list, or export unsynced work before closing this page.",
    );
  }
}

/** Serializes creation, update, restore and delete for this owner's portfolio. */
async function lockBusinessOwner(sql: Sql, userId: string): Promise<void> {
  const owner = await sql`select id from "user" where id = ${userId} for update`;
  if (!owner.length) throw new RequestError(401, "Unauthorized");
}

/** Recheck sharing while holding the row lock; revocation cannot race the write. */
async function authorizeBusinessWriter(
  sql: Sql,
  owner: string,
  actor: string,
  firm: string | null,
) {
  if (owner === actor) return;
  const member = await sql`
    select member_user_id from firm_members
    where member_user_id = ${actor} and firm_user_id = ${firm} for share
  `;
  if (!member.length) throw new BusinessUnavailableError();
}

export async function saveBusinessRevision<TProfile = unknown>(
  sql: Sql,
  input: BusinessSaveInput,
  limit = MAX_BUSINESSES_PER_USER,
): Promise<BusinessSaveResult<TProfile>> {
  if (
    input.baseRevision !== null &&
    (!Number.isSafeInteger(input.baseRevision) || input.baseRevision < 1)
  )
    throw new RequestError(400, "Invalid business revision");
  if (!Number.isSafeInteger(limit) || limit < 1)
    throw new RequestError(400, "Invalid business limit");
  return inTransaction(sql, async (tx) => {
    await lockBusinessOwner(tx, input.userId);
    const savedBy = input.savedBy ?? input.userId;
    const rows = await tx<{
      revision: number | string;
      profile: TProfile;
      name: string;
      industry: string;
      updated_at: string;
      deleted_at: string | null;
      firm_user_id: string | null;
    }>`select revision, profile, name, industry, updated_at, deleted_at, firm_user_id
       from businesses where user_id = ${input.userId} and id = ${input.businessId} for update`;
    const current = rows[0];
    const deleted = await tx`select 1 from business_deletion_markers
      where user_id = ${input.userId} and business_id = ${input.businessId}`;
    if (deleted.length || current?.deleted_at) throw new BusinessUnavailableError();
    if (!current && (input.baseRevision !== null || savedBy !== input.userId))
      throw new BusinessUnavailableError();
    if (current) {
      await authorizeBusinessWriter(tx, input.userId, savedBy, current.firm_user_id);
      if (input.baseRevision === null || Number(current.revision) !== input.baseRevision) {
        return {
          ok: false,
          conflict: true,
          existing: {
            revision: Number(current.revision),
            profile: current.profile,
            name: current.name,
            industry: current.industry,
            updated_at: toIsoTimestamp(current.updated_at),
          },
        };
      }
      // Only a successful replacement archives the old row, in the same transaction.
      await tx`insert into business_history
        (user_id, business_id, revision, name, industry, profile, saved_by, saved_at)
        select user_id, id, revision, name, industry, profile, saved_by, updated_at
        from businesses where user_id = ${input.userId} and id = ${input.businessId}
        on conflict (user_id, business_id, revision) do nothing`;
    } else {
      if (input.firmUserId && input.firmUserId !== input.userId) {
        const membership = await tx`select member_user_id from firm_members
          where member_user_id = ${savedBy} and firm_user_id = ${input.firmUserId} for share`;
        if (!membership.length) throw new BusinessUnavailableError();
      }
      const held = await tx<{ n: number | string }>`select count(*) as n from businesses
        where user_id = ${input.userId} and deleted_at is null`;
      if (Number(held[0]?.n ?? 0) >= limit) throw new BusinessLimitError(limit);
    }
    const written = current
      ? await tx<{ revision: number | string; updated_at: string }>`
        update businesses set name = ${input.name}, industry = ${input.industry},
          profile = ${input.profileJson}::jsonb, revision = revision + 1,
          updated_at = now(), saved_by = ${savedBy}
        where user_id = ${input.userId} and id = ${input.businessId}
          and revision = ${input.baseRevision}::bigint and deleted_at is null
        returning revision, updated_at`
      : await tx<{ revision: number | string; updated_at: string }>`
        insert into businesses (id, user_id, name, industry, profile, revision, updated_at, saved_by, firm_user_id)
        values (${input.businessId}, ${input.userId}, ${input.name}, ${input.industry},
          ${input.profileJson}::jsonb, 1, now(), ${savedBy}, ${input.firmUserId ?? null})
        returning revision, updated_at`;
    const row = written[0];
    if (!row) throw new BusinessUnavailableError();
    if (current) await pruneHistory(tx, input.userId, input.businessId);
    if (input.activate)
      await setActiveBusiness(tx, { ...input, userId: savedBy, ownerUserId: input.userId });
    return { ok: true, revision: Number(row.revision), updatedAt: toIsoTimestamp(row.updated_at) };
  });
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
 * per user). The revision-checked `businesses` row is the authoritative copy,
 * written first and read back preferentially, so the pointer carries just the
 * business id: writing the whole profile here again doubled every save. Rows
 * written by older builds still hold a full copy, which `loadActiveBusiness`
 * reads only for an account that has no `businesses` row at all.
 */
export async function setActiveBusiness(
  sql: Sql,
  input: Omit<BusinessSaveInput, "baseRevision" | "profileJson"> & { ownerUserId?: string },
): Promise<void> {
  await sql`
    insert into business_profiles (user_id, name, industry, profile, updated_at)
    values (
      ${input.userId},
      ${input.name},
      ${input.industry},
      jsonb_build_object('businessId', ${input.businessId}::text, 'ownerUserId', ${input.ownerUserId ?? input.userId}::text, 'pointerVersion', 2),
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
  TProfile extends { businessId?: string; ownerUserId?: string; pointerVersion?: number } = {
    businessId?: string;
  },
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

  const pointerOwner = active.profile.ownerUserId;
  const permitted =
    typeof pointerOwner === "string"
      ? await sql<{ user_id: string }>`
    select user_id from businesses b where b.user_id = ${pointerOwner} and b.id = ${businessId}
      and deleted_at is null and (b.user_id = ${userId} or b.firm_user_id in (
        select firm_user_id from firm_members where member_user_id = ${userId}
      ))
  `
      : [];
  const owner =
    typeof pointerOwner === "string"
      ? (permitted[0]?.user_id ?? null)
      : await resolveBusinessOwner(sql, userId, businessId);
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
        where user_id = ${owner} and id = ${businessId} and deleted_at is null
      `
    : [];
  const authoritative = rows[0];
  if (!authoritative) {
    // The pointer names a business that no longer exists. For a user who has
    // any revision-tracked business, that is a dangling pointer (the business
    // was deleted), not a legacy account, so nothing is resurrected from it.
    const others = await sql`select 1 from businesses where user_id = ${userId} limit 1`;
    const deleted = await sql`select 1 from business_deletion_markers
      where user_id = ${pointerOwner ?? userId} and business_id = ${businessId}`;
    if (
      others.length > 0 ||
      deleted.length > 0 ||
      active.profile.pointerVersion === 2 ||
      !("staff" in active.profile)
    )
      return null;
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
  await inTransaction(sql, async (tx) => {
    await lockBusinessOwner(tx, ownerUserId);
    const rows = await tx<{ firm_user_id: string | null }>`select firm_user_id from businesses
      where user_id = ${ownerUserId} and id = ${businessId} for update`;
    if (!rows.length) return; // Repeated delete is harmless, never creates a marker for another row.
    await authorizeBusinessWriter(tx, ownerUserId, pointerUserId, rows[0].firm_user_id);
    await tx`insert into business_deletion_markers (user_id, business_id, firm_user_id)
      values (${ownerUserId}, ${businessId}, ${rows[0].firm_user_id})
      on conflict (user_id, business_id) do nothing`;
    await tx`update businesses set deleted_at = now(), revision = revision + 1, updated_at = now()
      where user_id = ${ownerUserId} and id = ${businessId} and deleted_at is null`;
    // Remove exact v2 pointers, including colleagues; legacy pointers only when ownership is known.
    await tx`delete from business_profiles where coalesce(profile->>'businessId', 'biz_default') = ${businessId}
      and (profile->>'ownerUserId' = ${ownerUserId}
        or (not (profile ? 'ownerUserId') and user_id in (${ownerUserId}, ${pointerUserId})))`;
  });
}

export async function restoreBusinessRow(
  sql: Sql,
  ownerUserId: string,
  businessId: string,
  actorUserId = ownerUserId,
  limit = MAX_BUSINESSES_PER_USER,
): Promise<boolean> {
  return inTransaction(sql, async (tx) => {
    await lockBusinessOwner(tx, ownerUserId);
    const rows = await tx<{ firm_user_id: string | null }>`select firm_user_id from businesses
      where user_id = ${ownerUserId} and id = ${businessId} and deleted_at is not null
        and deleted_at >= now() - make_interval(days => ${DELETED_RETENTION_DAYS}::int) for update`;
    if (!rows.length) return false;
    await authorizeBusinessWriter(tx, ownerUserId, actorUserId, rows[0].firm_user_id);
    const held = await tx<{ n: number | string }>`select count(*) as n from businesses
      where user_id = ${ownerUserId} and deleted_at is null`;
    if (Number(held[0]?.n ?? 0) >= limit) throw new BusinessLimitError(limit);
    await tx`update businesses set deleted_at = null, revision = revision + 1, updated_at = now()
      where user_id = ${ownerUserId} and id = ${businessId}`;
    await tx`delete from business_deletion_markers where user_id = ${ownerUserId} and business_id = ${businessId}`;
    return true;
  });
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
      and deleted_at >= now() - make_interval(days => ${DELETED_RETENTION_DAYS}::int)
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
  if (!Number.isSafeInteger(retentionDays) || retentionDays < 0)
    throw new RequestError(400, "Invalid retention");
  // Lock each owner before rechecking age. A restore and a purge cannot both win.
  const owners = await sql<{ user_id: string }>`select distinct user_id from businesses
    where deleted_at is not null and deleted_at < now() - make_interval(days => ${retentionDays}::int)
    order by user_id`;
  let count = 0;
  for (const { user_id: owner } of owners)
    count += await inTransaction(sql, async (tx) => {
      await lockBusinessOwner(tx, owner);
      await tx`insert into business_deletion_markers (user_id, business_id, firm_user_id, deleted_at)
      select user_id, id, firm_user_id, deleted_at from businesses
      where user_id = ${owner} and deleted_at is not null
        and deleted_at < now() - make_interval(days => ${retentionDays}::int)
      on conflict (user_id, business_id) do nothing`;
      await tx`delete from business_profiles p using businesses b
      where b.user_id = ${owner} and b.id = coalesce(p.profile->>'businessId', 'biz_default')
        and (p.profile->>'ownerUserId' = b.user_id or
          (not (p.profile ? 'ownerUserId') and p.user_id = b.user_id))
        and b.deleted_at is not null and b.deleted_at < now() - make_interval(days => ${retentionDays}::int)`;
      const removed = await tx`delete from businesses where user_id = ${owner}
      and deleted_at is not null and deleted_at < now() - make_interval(days => ${retentionDays}::int)
      returning id`;
      return removed.length;
    });
  return count;
}
