import type { Sql } from "@/lib/db";
import { inTransaction } from "@/lib/sql-transaction";
import { RequestError } from "@/lib/request-errors";
import { toIsoTimestamp, toIsoTimestampOrNull } from "../iso-time";
import {
  ENGAGEMENT_ENDED,
  isRetentionYears,
  NOT_A_FIRM_CLIENT,
  PICK_MEMBERS,
  PICK_REVIEWER,
  RETENTION_REFUSAL,
  type EngagementInput,
  type EngagementRecord,
  type EngagementStatus,
} from "./engagement-row";

/**
 * The engagement fields of `engagement_marks` (migration 0045). The row keeps
 * its stamps, counts and owner address beside them; nothing here writes
 * those, and `upsertEngagementMark` never writes these.
 */

interface RawEngagement {
  scope: string;
  period_start: string | null;
  period_end: string | null;
  status: string;
  ended_at: string | null;
  preparer_user_id: string | null;
  reviewer_user_id: string | null;
}

function toRecord(r: RawEngagement): EngagementRecord {
  return {
    scope: r.scope,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    status: r.status === "ended" ? "ended" : "active",
    endedAt: toIsoTimestampOrNull(r.ended_at),
    preparerUserId: r.preparer_user_id,
    reviewerUserId: r.reviewer_user_id,
  };
}

/**
 * The engagement of one business, or null when no row exists yet (an active,
 * empty one). A preparer or reviewer who is no longer a member of the
 * business's firm reads as not set, so the form shows what a save sends.
 */
export async function loadEngagement(
  sql: Sql,
  ownerUserId: string,
  businessId: string,
): Promise<EngagementRecord | null> {
  const rows = await sql<RawEngagement>`
    select e.scope, e.period_start, e.period_end, e.status, e.ended_at,
      (select m.member_user_id from firm_members m
        where m.firm_user_id = b.firm_user_id
          and m.member_user_id = e.preparer_user_id) as preparer_user_id,
      (select m.member_user_id from firm_members m
        where m.firm_user_id = b.firm_user_id
          and m.member_user_id = e.reviewer_user_id) as reviewer_user_id
    from engagement_marks e
    left join businesses b on b.user_id = e.user_id and b.id = e.business_id
    where e.user_id = ${ownerUserId} and e.business_id = ${businessId}
  `;
  return rows[0] ? toRecord(rows[0]) : null;
}

/** The firm a business is a client of and that firm's retention, or null for a solo business. */
export async function loadClientFirm(
  sql: Sql,
  ownerUserId: string,
  businessId: string,
): Promise<{ firmUserId: string; retentionYears: number } | null> {
  const rows = await sql<{ firm_user_id: string; retention_years: number | string }>`
    select b.firm_user_id, f.retention_years
    from businesses b join firms f on f.user_id = b.firm_user_id
    where b.user_id = ${ownerUserId} and b.id = ${businessId}
  `;
  const row = rows[0];
  return row ? { firmUserId: row.firm_user_id, retentionYears: Number(row.retention_years) } : null;
}

/** The retention period of the firm `firmUserId` owns, or null when it owns none. */
export async function loadFirmRetention(sql: Sql, firmUserId: string): Promise<number | null> {
  const rows = await sql<{ retention_years: number | string }>`
    select retention_years from firms where user_id = ${firmUserId}
  `;
  return rows[0] ? Number(rows[0].retention_years) : null;
}

/**
 * Refuses (409) a change by a member of the business's firm while its
 * engagement has ended. The business's account outside the firm, the
 * account of a business its owner shared with the firm, and every business
 * with no firm, pass. Reads, exports and deletion never call this.
 */
export async function assertEngagementOpen(
  tx: Sql,
  ownerUserId: string,
  businessId: string,
  actorUserId: string,
): Promise<void> {
  const rows = await tx`
    select 1
    from businesses b
    join engagement_marks e on e.user_id = b.user_id and e.business_id = b.id
    join firm_members m on m.firm_user_id = b.firm_user_id and m.member_user_id = ${actorUserId}
    where b.user_id = ${ownerUserId} and b.id = ${businessId}
      and b.firm_user_id is not null and e.status = 'ended'
      -- A business its owner shared with a firm stays the owner's to change,
      -- even when the owner is also a member of that firm.
      and not (b.granted_at is not null and b.user_id = ${actorUserId})
  `;
  if (rows.length) throw new RequestError(409, ENGAGEMENT_ENDED);
}

/** Whether the business's engagement has ended, whoever asks. */
export async function engagementEnded(
  sql: Sql,
  ownerUserId: string,
  businessId: string,
): Promise<boolean> {
  const rows = await sql<{ status: string }>`
    select status from engagement_marks
    where user_id = ${ownerUserId} and business_id = ${businessId}
  `;
  return rows[0]?.status === "ended";
}

/**
 * Saves scope, period, preparer and reviewer of a firm client. The preparer
 * and reviewer are members of the business's firm; the reviewer holds the
 * owner or reviewer role and is not the preparer. Refused on an ended
 * engagement for the firm's members.
 */
export async function saveEngagement(
  sql: Sql,
  input: { ownerUserId: string; businessId: string; actorUserId: string } & EngagementInput,
): Promise<EngagementRecord> {
  return inTransaction(sql, async (tx) => {
    const firm = await tx<{ firm_user_id: string | null }>`
      select firm_user_id from businesses
      where user_id = ${input.ownerUserId} and id = ${input.businessId} and deleted_at is null
      for update
    `;
    const firmUserId = firm[0]?.firm_user_id;
    if (!firmUserId) throw new RequestError(409, NOT_A_FIRM_CLIENT);
    await assertEngagementOpen(tx, input.ownerUserId, input.businessId, input.actorUserId);
    const picked = [input.preparerUserId, input.reviewerUserId].filter(
      (id): id is string => id !== null,
    );
    const roles = new Map<string, string>();
    if (picked.length) {
      const rows = await tx<{ member_user_id: string; role: string }>`
        select member_user_id, role from firm_members
        where firm_user_id = ${firmUserId}
          and member_user_id in (${picked[0]}, ${picked[1] ?? picked[0]})
      `;
      for (const r of rows) roles.set(r.member_user_id, r.role);
      if (picked.some((id) => !roles.has(id))) throw new RequestError(400, PICK_MEMBERS);
    }
    if (input.reviewerUserId !== null) {
      const role = roles.get(input.reviewerUserId);
      if (
        (role !== "owner" && role !== "reviewer") ||
        input.reviewerUserId === input.preparerUserId
      ) {
        throw new RequestError(400, PICK_REVIEWER);
      }
    }
    const rows = await tx<RawEngagement>`
      insert into engagement_marks
        (user_id, business_id, scope, period_start, period_end, preparer_user_id, reviewer_user_id)
      values (${input.ownerUserId}, ${input.businessId}, ${input.scope},
        ${input.periodStart}::date, ${input.periodEnd}::date,
        ${input.preparerUserId}, ${input.reviewerUserId})
      on conflict (user_id, business_id) do update set
        scope = excluded.scope,
        period_start = excluded.period_start,
        period_end = excluded.period_end,
        preparer_user_id = excluded.preparer_user_id,
        reviewer_user_id = excluded.reviewer_user_id
      returning scope, period_start, period_end, status, ended_at, preparer_user_id, reviewer_user_id
    `;
    return toRecord(rows[0]);
  });
}

/**
 * Ends or reopens the engagement; ending stamps `ended_at` once, reopening
 * clears it. `changed` says whether the status moved (no row reads as
 * active). The business row is locked first, as saveEngagement and the
 * client invitation's hand-over lock it, so two requests at once (the row
 * may not exist yet) move the status once.
 */
export async function setEngagementStatus(
  sql: Sql,
  ownerUserId: string,
  businessId: string,
  status: EngagementStatus,
): Promise<{ engagement: EngagementRecord; changed: boolean }> {
  return inTransaction(sql, async (tx) => {
    await tx`
      select 1 from businesses where user_id = ${ownerUserId} and id = ${businessId} for update
    `;
    const before = await tx<{ status: string }>`
      select status from engagement_marks
      where user_id = ${ownerUserId} and business_id = ${businessId}
    `;
    const rows = await tx<RawEngagement>`
      insert into engagement_marks (user_id, business_id, status, ended_at)
      values (${ownerUserId}, ${businessId}, ${status},
        case when ${status}::text = 'ended' then now() else null end)
      on conflict (user_id, business_id) do update set
        status = excluded.status,
        ended_at = case when excluded.status = 'ended'
          then coalesce(engagement_marks.ended_at, now()) else null end
      returning scope, period_start, period_end, status, ended_at, preparer_user_id, reviewer_user_id
    `;
    const engagement = toRecord(rows[0]);
    const from = before[0]?.status === "ended" ? "ended" : "active";
    return { engagement, changed: from !== engagement.status };
  });
}

/** Sets how long the firm keeps a deleted client's records; 7 to 15 years in Precog. */
export async function saveFirmRetention(
  sql: Sql,
  firmUserId: string,
  years: number,
): Promise<number> {
  if (!isRetentionYears(years)) throw new RequestError(400, RETENTION_REFUSAL);
  const rows = await sql<{ retention_years: number | string }>`
    update firms set retention_years = ${years}, updated_at = now()
    where user_id = ${firmUserId}
    returning retention_years
  `;
  if (!rows[0]) throw new RequestError(404, "Set up the firm first");
  return Number(rows[0].retention_years);
}

/** One monthly review result as the engagement archive lists it. */
export interface ReviewLogRow {
  period: string;
  itemKey: string;
  result: string;
  notes: string;
  ownerName: string;
  dueOn: string | null;
  recordedAt: string;
  recordedByName: string | null;
}

/** The business's monthly review log, newest first. */
export async function loadReviewLog(
  sql: Sql,
  ownerUserId: string,
  businessId: string,
): Promise<ReviewLogRow[]> {
  const rows = await sql<{
    period: string;
    item_key: string;
    result: string;
    notes: string;
    owner_name: string;
    due_on: string | null;
    recorded_at: string;
    recorded_by_name: string | null;
  }>`
    select r.period, r.item_key, r.result, r.notes, r.owner_name, r.due_on, r.recorded_at,
      nullif(coalesce(nullif(u.name, ''), u.email), '') as recorded_by_name
    from review_events r
    left join "user" u on u.id = r.recorded_by
    where r.user_id = ${ownerUserId} and r.business_id = ${businessId}
    order by r.recorded_at desc, r.id desc
  `;
  return rows.map((r) => ({
    period: r.period,
    itemKey: r.item_key,
    result: r.result,
    notes: r.notes,
    ownerName: r.owner_name,
    dueOn: r.due_on,
    recordedAt: toIsoTimestamp(r.recorded_at),
    recordedByName: r.recorded_by_name,
  }));
}
