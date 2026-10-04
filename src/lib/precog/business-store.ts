import type { Sql } from "@/lib/db";
import { inTransaction } from "@/lib/sql-transaction";
import { RequestError } from "@/lib/request-errors";
import { toIsoTimestamp, toIsoTimestampOrNull } from "./iso-time";
import { businessLimitMessage, MAX_BUSINESSES_PER_ACCOUNT } from "./business-lifecycle";
import { DEFAULT_BUSINESS_ID } from "./business-id";
import { revokeBusinessShares } from "./share/share-store";
import { assertEngagementOpen } from "./firm/engagement-store";
import { randomHex } from "@/lib/web-crypto";
import {
  DELETED_RETENTION_DAYS,
  HISTORY_RETENTION_DAYS,
  HISTORY_VERSION_WINDOW_MINUTES,
  MAX_HISTORY_PER_BUSINESS,
} from "./business-retention";

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
interface BusinessSaveInput {
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
  /**
   * Checks the write against the stored profile (null for a new business)
   * while the row is locked, before anything is written; throws to refuse it.
   * The save reads only the stored procedures, so the check receives
   * `{ procedures }` (an empty object when the profile has none).
   */
  checkWrite?: (previous: unknown) => void;
}

interface BusinessRowSnapshot<TProfile = unknown> {
  revision: number;
  profile: TProfile;
  industry: string;
  name: string;
  updated_at: string;
}

type BusinessSaveResult<TProfile = unknown> =
  | {
      ok: true;
      revision: number;
      updatedAt: string;
      /** The procedures the save replaced; undefined for a new business or none stored. */
      previousProcedures: unknown;
      /** Before this save, the business held a step picture still counted as named. */
      heldNamedImages: boolean;
    }
  | { ok: false; conflict: true; existing: BusinessRowSnapshot<TProfile> };

/** A new business past the account's limit. Saves to existing ones always go through. */
export class BusinessLimitError extends RequestError {
  constructor(limit: number) {
    super(409, businessLimitMessage(limit));
    this.name = "BusinessLimitError";
  }
}

/** A missing/deleted row is not permission to insert an old copy. */
export class BusinessUnavailableError extends RequestError {
  constructor() {
    super(
      409,
      "Someone deleted this business, or it is no longer available to you. Export any work not yet saved before closing this page.",
    );
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

/**
 * Delete and restore are not a member's save. A firm's client is the firm
 * owner's to delete or restore, a member's own client businesses included:
 * they stay with the firm when the member leaves, so a preparer or a
 * reviewer is refused even on a row they set up. The account that owns a
 * row outside any firm (or whose firm is gone) does both; someone outside
 * the firm meets the usual refusal.
 */
async function authorizeBusinessDestroyer(
  sql: Sql,
  owner: string,
  actor: string,
  firm: string | null,
) {
  if (owner === actor && (firm === null || firm === owner)) return;
  const member = await sql<{ role: string }>`
    select role from firm_members
    where member_user_id = ${actor} and firm_user_id = ${firm} for share
  `;
  const role = member[0]?.role;
  if (role === "owner") return;
  if (!role) {
    if (owner === actor) return; // The row's firm is gone: the row is its account's alone.
    throw new BusinessUnavailableError();
  }
  throw new RequestError(403, "Only the firm owner can delete or restore a client.");
}

export async function saveBusinessRevision<TProfile = unknown>(
  sql: Sql,
  input: BusinessSaveInput,
  limit = MAX_BUSINESSES_PER_ACCOUNT,
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
    // Only the procedures travel back: the write check reads nothing else, and
    // a conflict reads the whole profile separately. `kept_recent` says the
    // newest kept version is inside the window and shares its saver with the
    // row being replaced and with this save.
    const rows = await tx<{
      revision: number | string;
      procedures: unknown;
      name: string;
      industry: string;
      updated_at: string;
      deleted_at: string | null;
      firm_user_id: string | null;
      unchanged: boolean;
      kept_recent: boolean | null;
      held_named_images: boolean;
    }>`select b.revision, b.profile->'procedures' as procedures, b.name, b.industry,
         b.updated_at, b.deleted_at, b.firm_user_id,
         (b.profile = ${input.profileJson}::jsonb and b.name = ${input.name}
           and b.industry = ${input.industry}) as unchanged,
         (select h.saved_at > now() - make_interval(mins => ${HISTORY_VERSION_WINDOW_MINUTES})
             and h.saved_by is not distinct from b.saved_by
             and h.saved_by is not distinct from ${savedBy}::text
           from business_history h
           where h.user_id = b.user_id and h.business_id = b.id
           order by h.revision desc limit 1) as kept_recent,
         exists (select 1 from procedure_images p
           where p.user_id = b.user_id and p.business_id = b.id
             and p.unreferenced_since is null) as held_named_images
       from businesses b where b.user_id = ${input.userId} and b.id = ${input.businessId}
       for update of b`;
    const current = rows[0];
    const deleted = await tx`select 1 from business_deletion_markers
      where user_id = ${input.userId} and business_id = ${input.businessId}`;
    if (deleted.length || current?.deleted_at) throw new BusinessUnavailableError();
    if (!current && (input.baseRevision !== null || savedBy !== input.userId))
      throw new BusinessUnavailableError();
    if (current) {
      await authorizeBusinessWriter(tx, input.userId, savedBy, current.firm_user_id);
      if (input.baseRevision === null || Number(current.revision) !== input.baseRevision) {
        const stored = await tx<{ profile: TProfile }>`select profile from businesses
          where user_id = ${input.userId} and id = ${input.businessId}`;
        return {
          ok: false,
          conflict: true,
          existing: {
            revision: Number(current.revision),
            profile: stored[0].profile,
            name: current.name,
            industry: current.industry,
            updated_at: toIsoTimestamp(current.updated_at),
          },
        };
      }
      // The same business saved again (a switch, a flush): nothing to write,
      // and no identical version pushes a real one out of the history. Any
      // other save (a history restore included) waits on an ended engagement.
      if (!current.unchanged && current.firm_user_id) {
        await assertEngagementOpen(tx, input.userId, input.businessId, savedBy);
      }
      if (current.unchanged) {
        if (input.activate) await setActiveBusiness(tx, activePointer(input, savedBy));
        return {
          ok: true,
          revision: Number(current.revision),
          updatedAt: toIsoTimestamp(current.updated_at),
          previousProcedures: current.procedures ?? undefined,
          heldNamedImages: current.held_named_images,
        };
      }
      input.checkWrite?.(current.procedures == null ? {} : { procedures: current.procedures });
      // Only a successful replacement archives the old row, in the same
      // transaction, and only once per window of one person's editing.
      if (!current.kept_recent) await keepCurrentVersion(tx, input.userId, input.businessId);
    } else {
      if (input.firmUserId && input.firmUserId !== input.userId) {
        const membership = await tx`select member_user_id from firm_members
          where member_user_id = ${savedBy} and firm_user_id = ${input.firmUserId} for share`;
        if (!membership.length) throw new BusinessUnavailableError();
      }
      const held = await tx<{ n: number | string }>`select count(*) as n from businesses
        where user_id = ${input.userId} and deleted_at is null`;
      if (Number(held[0]?.n ?? 0) >= limit) throw new BusinessLimitError(limit);
      input.checkWrite?.(null);
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
    if (input.activate) await setActiveBusiness(tx, activePointer(input, savedBy));
    return {
      ok: true,
      revision: Number(row.revision),
      updatedAt: toIsoTimestamp(row.updated_at),
      previousProcedures: current?.procedures ?? undefined,
      heldNamedImages: current?.held_named_images ?? false,
    };
  });
}

/** Copies the business as it stands now into its history, once per revision. */
async function keepCurrentVersion(
  sql: Sql,
  ownerUserId: string,
  businessId: string,
): Promise<void> {
  await sql`insert into business_history
    (user_id, business_id, revision, name, industry, profile, saved_by, saved_at)
    select user_id, id, revision, name, industry, profile, saved_by, updated_at
    from businesses where user_id = ${ownerUserId} and id = ${businessId} and deleted_at is null
    on conflict (user_id, business_id, revision) do nothing`;
}

/**
 * Keeps the state a restore is about to replace, however recently a version
 * was kept, so a restore loses nothing. The caller has checked access.
 */
export async function keepVersionBeforeRestore(
  sql: Sql,
  ownerUserId: string,
  businessId: string,
): Promise<void> {
  await inTransaction(sql, async (tx) => {
    await keepCurrentVersion(tx, ownerUserId, businessId);
    await pruneHistory(tx, ownerUserId, businessId);
  });
}

/** The saver's pointer to the business just saved. */
function activePointer(input: BusinessSaveInput, savedBy: string): ActivePointer {
  return { userId: savedBy, businessId: input.businessId, ownerUserId: input.userId };
}

/**
 * Drops versions replaced more than the retention period ago, and any past
 * the newest MAX_HISTORY_PER_BUSINESS. A version counts as replaced no later
 * than the next kept version was saved, so the age runs from that, not from
 * its own save: after months without edits, the state from before a new
 * session stays. The newest kept version has no later one and always stays.
 * Revisions skip numbers now that versions are kept by time, so the ceiling
 * counts rows.
 */
async function pruneHistory(sql: Sql, userId: string, businessId: string): Promise<void> {
  await sql`
    delete from business_history h
    where h.user_id = ${userId} and h.business_id = ${businessId}
      and (
        exists (
          select 1 from business_history n
          where n.user_id = h.user_id and n.business_id = h.business_id
            and n.revision > h.revision
            and n.saved_at < now() - make_interval(days => ${HISTORY_RETENTION_DAYS})
        )
        or h.revision < coalesce((
          select revision from business_history
          where user_id = ${userId} and business_id = ${businessId}
          order by revision desc offset ${MAX_HISTORY_PER_BUSINESS - 1}::int limit 1
        ), 0)
      )
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

interface BusinessSummaryRow {
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
  /** True when the business is a firm's client (`firm_user_id` set), whoever opened it. */
  firmClient: boolean;
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
    firm_user_id: string | null;
    name: string;
    industry: string;
    updated_at: unknown;
    process_count: number | string | null;
    health_score: unknown;
  }>`
    select
      id, user_id, firm_user_id, name, industry, updated_at,
      case when jsonb_typeof(profile->'customProcesses') = 'array'
        then jsonb_array_length(profile->'customProcesses') else 0 end as process_count,
      case when jsonb_typeof(profile->'mapCompletenessHistory') = 'array'
        then profile->'mapCompletenessHistory'->-1->'score' end as health_score
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
    firmClient: r.firm_user_id !== null,
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
interface ActivePointer {
  /** The account whose pointer this is. */
  userId: string;
  businessId: string;
  /** The row's owner; the pointer's own account when omitted. */
  ownerUserId?: string;
}

export async function setActiveBusiness(sql: Sql, input: ActivePointer): Promise<void> {
  await sql`
    insert into business_profiles (user_id, profile, updated_at)
    values (
      ${input.userId},
      jsonb_build_object('businessId', ${input.businessId}::text, 'ownerUserId', ${input.ownerUserId ?? input.userId}::text, 'pointerVersion', 2),
      now()
    )
    on conflict (user_id) do update set
      profile = excluded.profile,
      updated_at = now()
  `;
}

interface ActiveBusiness<TProfile = unknown> {
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
    typeof active.profile.businessId === "string" ? active.profile.businessId : DEFAULT_BUSINESS_ID;

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
    await authorizeBusinessDestroyer(tx, ownerUserId, pointerUserId, rows[0].firm_user_id);
    await tx`insert into business_deletion_markers (user_id, business_id, firm_user_id)
      values (${ownerUserId}, ${businessId}, ${rows[0].firm_user_id})
      on conflict (user_id, business_id) do nothing`;
    await tx`update businesses set deleted_at = now(), revision = revision + 1, updated_at = now()
      where user_id = ${ownerUserId} and id = ${businessId} and deleted_at is null`;
    // Its public share links stop working now, not when the row is purged.
    await revokeBusinessShares(tx, ownerUserId, businessId);
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
  limit = MAX_BUSINESSES_PER_ACCOUNT,
): Promise<boolean> {
  return inTransaction(sql, async (tx) => {
    await lockBusinessOwner(tx, ownerUserId);
    const rows = await tx<{ firm_user_id: string | null }>`select firm_user_id from businesses
      where user_id = ${ownerUserId} and id = ${businessId} and deleted_at is not null
        and deleted_at >= now() - make_interval(days => ${DELETED_RETENTION_DAYS}::int) for update`;
    if (!rows.length) return false;
    await authorizeBusinessDestroyer(tx, ownerUserId, actorUserId, rows[0].firm_user_id);
    const held = await tx<{ n: number | string }>`select count(*) as n from businesses
      where user_id = ${ownerUserId} and deleted_at is null`;
    if (Number(held[0]?.n ?? 0) >= limit) throw new BusinessLimitError(limit);
    await tx`update businesses set deleted_at = null, revision = revision + 1, updated_at = now()
      where user_id = ${ownerUserId} and id = ${businessId}`;
    await tx`delete from business_deletion_markers where user_id = ${ownerUserId} and business_id = ${businessId}`;
    return true;
  });
}

/** One business the hand-over moved: its id under the member, its id under the owner, its name. */
export interface MovedBusiness {
  from: string;
  to: string;
  name: string;
}

/**
 * Hands every business a departing member set up for the firm (live and
 * deleted) to the firm owner's account, inside the caller's transaction. A
 * business row is keyed by its owner, and every per-business table carries
 * that key with no update cascade, so the move is a new parent row under the
 * owner, a repoint of every child row, and the old parent deleted last.
 *
 * The owner may already hold the same client-generated id: a `businesses`
 * row (live or deleted) or a `business_deletion_markers` row, which shares
 * the key and outlives the purge. Such a business gets a new id
 * (`<old id>-<8 hex>`), which the caller reports; the member's open tab
 * meets the usual "no longer available" refusal on its next save.
 *
 * Markers of the member's purged firm clients move too, so a stale device
 * cannot bring one back under the owner. The owner's per-account ceiling is
 * not checked: nothing is created, only re-parented.
 */
export async function transferBusinessesToOwner(
  tx: Sql,
  input: { firmUserId: string; memberUserId: string },
): Promise<MovedBusiness[]> {
  const { firmUserId: owner, memberUserId: member } = input;
  for (const id of [owner, member].sort()) await lockBusinessOwner(tx, id);
  const rows = await tx<{ id: string; name: string }>`
    select id, name from businesses
    where user_id = ${member} and firm_user_id = ${owner}
    order by id
  `;
  const moved: MovedBusiness[] = [];
  for (const row of rows) {
    const held = await tx`
      select 1 from businesses where user_id = ${owner} and id = ${row.id}
      union all
      select 1 from business_deletion_markers where user_id = ${owner} and business_id = ${row.id}
    `;
    const to = held.length ? `${row.id}-${randomHex(4)}` : row.id;
    await tx`
      insert into businesses
        (id, user_id, name, industry, profile, created_at, updated_at, revision, deleted_at,
          saved_by, firm_user_id)
      select ${to}, ${owner}, name, industry, profile, created_at, now(), revision + 1, deleted_at,
        ${member}, firm_user_id
      from businesses where user_id = ${member} and id = ${row.id}
    `;
    await tx`update business_history set user_id = ${owner}, business_id = ${to}
      where user_id = ${member} and business_id = ${row.id}`;
    await tx`update report_versions set user_id = ${owner}, business_id = ${to}
      where user_id = ${member} and business_id = ${row.id}`;
    await tx`update integration_connections set user_id = ${owner}, business_id = ${to}
      where user_id = ${member} and business_id = ${row.id}`;
    await tx`update integration_snapshots set user_id = ${owner}, business_id = ${to}
      where user_id = ${member} and business_id = ${row.id}`;
    await tx`update procedure_images set user_id = ${owner}, business_id = ${to}
      where user_id = ${member} and business_id = ${row.id}`;
    await tx`update control_execution_log set user_id = ${owner}, business_id = ${to}
      where user_id = ${member} and business_id = ${row.id}`;
    await tx`update engagement_marks set user_id = ${owner}, business_id = ${to}
      where user_id = ${member} and business_id = ${row.id}`;
    await tx`update review_events set user_id = ${owner}, business_id = ${to}
      where user_id = ${member} and business_id = ${row.id}`;
    await tx`update reminder_log set user_id = ${owner}, business_id = ${to}
      where user_id = ${member} and business_id = ${row.id}`;
    await tx`update owner_email_stops set user_id = ${owner}, business_id = ${to}
      where user_id = ${member} and business_id = ${row.id}`;
    await tx`update business_deletion_markers set user_id = ${owner}, business_id = ${to}
      where user_id = ${member} and business_id = ${row.id}`;
    await tx`update map_shares set business_owner_id = ${owner}, business_id = ${to}
      where business_owner_id = ${member} and business_id = ${row.id}`;
    // Colleagues' pointers follow the row; the member's own pointer goes.
    await tx`delete from business_profiles
      where user_id = ${member}
        and coalesce(profile->>'businessId', ${DEFAULT_BUSINESS_ID}) = ${row.id}
        and coalesce(profile->>'ownerUserId', user_id) = ${member}`;
    await tx`update business_profiles
      set profile = profile || jsonb_build_object('businessId', ${to}::text, 'ownerUserId', ${owner}::text),
        updated_at = now()
      where user_id <> ${member}
        and profile->>'businessId' = ${row.id} and profile->>'ownerUserId' = ${member}`;
    await tx`delete from businesses where user_id = ${member} and id = ${row.id}`;
    moved.push({ from: row.id, to, name: row.name });
  }
  // Purged firm clients left only a marker: it moves too, unless the owner holds one.
  await tx`
    insert into business_deletion_markers (user_id, business_id, firm_user_id, deleted_at)
    select ${owner}, business_id, firm_user_id, deleted_at from business_deletion_markers
    where user_id = ${member} and firm_user_id = ${owner}
    on conflict (user_id, business_id) do nothing
  `;
  await tx`delete from business_deletion_markers
    where user_id = ${member} and firm_user_id = ${owner}`;
  return moved;
}

export interface DeletedBusinessRow {
  id: string;
  /** The account the business belongs to: the caller's own, or a colleague's in the firm. */
  ownerUserId: string;
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
    user_id: string;
    name: string;
    industry: string;
    deleted_at: string;
    purge_on: string | null;
  }>`
    select id, user_id, name, industry, deleted_at,
      deleted_at + make_interval(days => ${DELETED_RETENTION_DAYS}::int) as purge_on
    from businesses
    where deleted_at is not null
      and deleted_at >= now() - make_interval(days => ${DELETED_RETENTION_DAYS}::int)
      and (user_id = ${userId} or (${firmUserId}::text is not null and firm_user_id = ${firmUserId}))
    order by deleted_at desc
  `;
  return rows.map((r) => ({
    id: r.id,
    ownerUserId: r.user_id,
    name: r.name,
    industry: r.industry,
    deletedAt: toIsoTimestamp(r.deleted_at),
    purgeOn: toIsoTimestampOrNull(r.purge_on) ?? toIsoTimestamp(r.deleted_at),
  }));
}

/**
 * A deleted firm client holding a locked report version stays (soft-deleted,
 * unseen, not restorable after the grace period) until its firm's retention
 * period has run from the deletion, so the versions, the monthly review log
 * and the engagement row survive with it. 7 years when the firm is gone.
 * Appended to each statement over `businesses b` below.
 */
const KEPT_FOR_RETENTION = `not (b.firm_user_id is not null
  and exists (select 1 from report_versions v where v.user_id = b.user_id and v.business_id = b.id)
  and b.deleted_at >= now() - make_interval(years => coalesce(
    (select f.retention_years from firms f where f.user_id = b.firm_user_id), 7)))`;

/**
 * Removes businesses deleted more than the grace period ago, except firm
 * clients kept for their firm's retention period. Returns how many.
 */
export async function purgeDeletedBusinesses(
  sql: Sql,
  retentionDays = DELETED_RETENTION_DAYS,
): Promise<number> {
  if (!Number.isSafeInteger(retentionDays) || retentionDays < 0)
    throw new RequestError(400, "Invalid retention");
  // Lock each owner before rechecking age. A restore and a purge cannot both win.
  const owners = await sql.query<{ user_id: string }>(
    `select distinct b.user_id from businesses b
    where b.deleted_at is not null and b.deleted_at < now() - make_interval(days => $1::int)
      and ${KEPT_FOR_RETENTION}
    order by b.user_id`,
    [retentionDays],
  );
  let count = 0;
  for (const { user_id: owner } of owners)
    count += await inTransaction(sql, async (tx) => {
      await lockBusinessOwner(tx, owner);
      await tx.query(
        `insert into business_deletion_markers (user_id, business_id, firm_user_id, deleted_at)
      select b.user_id, b.id, b.firm_user_id, b.deleted_at from businesses b
      where b.user_id = $1 and b.deleted_at is not null
        and b.deleted_at < now() - make_interval(days => $2::int) and ${KEPT_FOR_RETENTION}
      on conflict (user_id, business_id) do nothing`,
        [owner, retentionDays],
      );
      await tx.query(
        `delete from business_profiles p using businesses b
      where b.user_id = $1 and b.id = coalesce(p.profile->>'businessId', 'biz_default')
        and (p.profile->>'ownerUserId' = b.user_id or
          (not (p.profile ? 'ownerUserId') and p.user_id = b.user_id))
        and b.deleted_at is not null and b.deleted_at < now() - make_interval(days => $2::int)
        and ${KEPT_FOR_RETENTION}`,
        [owner, retentionDays],
      );
      const removed = await tx.query<{ id: string }>(
        `delete from businesses b where b.user_id = $1
      and b.deleted_at is not null and b.deleted_at < now() - make_interval(days => $2::int)
      and ${KEPT_FOR_RETENTION}
      returning b.id`,
        [owner, retentionDays],
      );
      return removed.length;
    });
  return count;
}
