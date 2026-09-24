import type { Sql } from "@/lib/db";
import { toIsoTimestamp, toIsoTimestampOrNull } from "../iso-time";
import type { FirmPlan } from "./pricing";
import type { ReviewItemKey, ReviewResult } from "./reviews";

export interface FirmRow {
  name: string;
  plan: FirmPlan;
  updatedAt: string;
}

export interface ClientEngagementRow {
  id: string;
  name: string;
  industry: string;
  updatedAt: string;
  startedAt: string | null;
  mapCompletedAt: string | null;
  reportSentAt: string | null;
  openFindings: number;
  acceptedFindings: number;
  lastReviewAt: string | null;
}

export interface ReviewEventInput {
  businessId: string;
  period: string;
  itemKey: ReviewItemKey;
  ownerName: string;
  dueOn: string | null;
  result: ReviewResult;
  notes: string;
}

export async function loadFirm(sql: Sql, userId: string): Promise<FirmRow | null> {
  const rows = await sql<{ name: string; plan: string; updated_at: string }>`
    select name, plan, updated_at from firms where user_id = ${userId}
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    name: row.name,
    plan: row.plan === "monthly" ? "monthly" : "assessment",
    updatedAt: toIsoTimestamp(row.updated_at),
  };
}

export async function saveFirm(
  sql: Sql,
  userId: string,
  name: string,
  plan: FirmPlan,
): Promise<FirmRow> {
  const rows = await sql<{ name: string; plan: string; updated_at: string }>`
    insert into firms (user_id, name, plan, updated_at)
    values (${userId}, ${name}, ${plan}, now())
    on conflict (user_id) do update set
      name = excluded.name,
      plan = excluded.plan,
      updated_at = now()
    returning name, plan, updated_at
  `;
  const row = rows[0];
  return {
    name: row.name,
    plan: row.plan === "monthly" ? "monthly" : "assessment",
    updatedAt: toIsoTimestamp(row.updated_at),
  };
}

export async function upsertEngagementMark(
  sql: Sql,
  userId: string,
  input: {
    businessId: string;
    startedAt?: string | null;
    mapCompletedAt?: string | null;
    reportSentAt?: string | null;
    openFindings: number;
    acceptedFindings: number;
  },
): Promise<void> {
  await sql`
    insert into engagement_marks (
      user_id, business_id, started_at, map_completed_at, report_sent_at,
      open_findings, accepted_findings
    )
    values (
      ${userId},
      ${input.businessId},
      ${input.startedAt ?? null},
      ${input.mapCompletedAt ?? null},
      ${input.reportSentAt ?? null},
      ${input.openFindings},
      ${input.acceptedFindings}
    )
    on conflict (user_id, business_id) do update set
      started_at = coalesce(engagement_marks.started_at, excluded.started_at),
      map_completed_at = coalesce(engagement_marks.map_completed_at, excluded.map_completed_at),
      report_sent_at = coalesce(engagement_marks.report_sent_at, excluded.report_sent_at),
      open_findings = excluded.open_findings,
      accepted_findings = excluded.accepted_findings
  `;
}

export async function listClientEngagements(
  sql: Sql,
  userId: string,
): Promise<ClientEngagementRow[]> {
  const rows = await sql<{
    id: string;
    name: string;
    industry: string;
    updated_at: string;
    started_at: string | null;
    map_completed_at: string | null;
    report_sent_at: string | null;
    open_findings: number | string | null;
    accepted_findings: number | string | null;
    last_review_at: string | null;
  }>`
    select
      b.id, b.name, b.industry, b.updated_at,
      e.started_at, e.map_completed_at, e.report_sent_at,
      e.open_findings, e.accepted_findings,
      (
        select max(r.recorded_at) from review_events r
        where r.user_id = b.user_id and r.business_id = b.id
      ) as last_review_at
    from businesses b
    left join engagement_marks e
      on e.user_id = b.user_id and e.business_id = b.id
    where b.user_id = ${userId}
    order by b.updated_at desc
  `;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    industry: r.industry,
    updatedAt: toIsoTimestamp(r.updated_at),
    startedAt: toIsoTimestampOrNull(r.started_at),
    mapCompletedAt: toIsoTimestampOrNull(r.map_completed_at),
    reportSentAt: toIsoTimestampOrNull(r.report_sent_at),
    openFindings: Number(r.open_findings ?? 0),
    acceptedFindings: Number(r.accepted_findings ?? 0),
    lastReviewAt: toIsoTimestampOrNull(r.last_review_at),
  }));
}

export async function insertReviewEvent(
  sql: Sql,
  userId: string,
  input: ReviewEventInput,
): Promise<void> {
  await sql`
    insert into review_events (
      user_id, business_id, period, item_key, owner_name, due_on, result, notes
    )
    values (
      ${userId},
      ${input.businessId},
      ${input.period},
      ${input.itemKey},
      ${input.ownerName},
      ${input.dueOn},
      ${input.result},
      ${input.notes}
    )
  `;
}

export async function listReviewEvents(
  sql: Sql,
  userId: string,
  businessId: string,
): Promise<
  Array<{
    id: number;
    period: string;
    itemKey: string;
    ownerName: string;
    result: string;
    notes: string;
    recordedAt: string;
  }>
> {
  const rows = await sql<{
    id: number | string;
    period: string;
    item_key: string;
    owner_name: string;
    result: string;
    notes: string;
    recorded_at: string;
  }>`
    select id, period, item_key, owner_name, result, notes, recorded_at
    from review_events
    where user_id = ${userId} and business_id = ${businessId}
    order by recorded_at desc
    limit 240
  `;
  return rows.map((r) => ({
    id: Number(r.id),
    period: r.period,
    itemKey: r.item_key,
    ownerName: r.owner_name,
    result: r.result,
    notes: r.notes,
    recordedAt: toIsoTimestamp(r.recorded_at),
  }));
}

/** Drop the audit rows for one client. Other clients of the same account stay. */
export async function deleteClientAudit(
  sql: Sql,
  userId: string,
  businessId: string,
): Promise<void> {
  await sql`delete from review_events where user_id = ${userId} and business_id = ${businessId}`;
  await sql`delete from engagement_marks where user_id = ${userId} and business_id = ${businessId}`;
}
