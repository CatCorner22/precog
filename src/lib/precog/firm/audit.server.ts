import type { Sql } from "@/lib/db";
import { reportServerError } from "@/lib/observability/report.server";
import { inTransaction } from "@/lib/sql-transaction";
import { toIsoTimestamp } from "../iso-time";

/**
 * The firm's activity log (migration 0048): one row per thing done to a
 * firm's file, insert-only. The events are the database's check list; a new
 * one needs a migration that widens it.
 */
export const AUDIT_EVENTS = [
  "member_invited",
  "invite_revoked",
  "member_joined",
  "member_left",
  "member_removed",
  "role_changed",
  "ownership_transferred",
  "letterhead_changed",
  "retention_changed",
  "client_deleted",
  "client_restored",
  "client_handed_over",
  "client_granted",
  "client_handed_back",
  "engagement_saved",
  "engagement_ended",
  "engagement_reopened",
  "share_created",
  "share_revoked",
  "version_locked",
  "version_review_requested",
  "version_returned",
  "version_reviewed",
  "version_sent",
  "owner_email_set",
  "quickbooks_connected",
  "quickbooks_disconnected",
  "export_run",
  "plan_changed",
  "operator_lookup",
  "operator_linked_stripe",
  "operator_lifted_cap",
] as const;

export type AuditEvent = (typeof AUDIT_EVENTS)[number];

export interface AuditInput {
  /** The firm whose log takes the row: its owner's account id. */
  firmUserId: string;
  /** Who acted; null for Stripe or a scheduled run. */
  actorUserId: string | null;
  event: AuditEvent;
  businessId?: string | null;
  /** The person the event is about (a member, an invitee's account). */
  subjectUserId?: string | null;
  /** A few facts about the event; never an address, a token or a figure. */
  detail?: Record<string, unknown>;
}

/** Retention when the firm's row is gone (the firm's own default). */
const DEFAULT_RETENTION_YEARS = 7;

/**
 * Writes one row inside the caller's transaction and throws on failure, so a
 * change and its record commit together or not at all (the operator's
 * actions). The actor's name is read in the same statement, as it is now.
 */
export async function insertAudit(tx: Sql, input: AuditInput): Promise<void> {
  await tx`
    insert into firm_audit_log
      (firm_user_id, actor_user_id, actor_name, event, business_id, subject_user_id, detail)
    values (
      ${input.firmUserId},
      ${input.actorUserId},
      coalesce((select coalesce(nullif(u.name, ''), u.email, '') from "user" u
        where u.id = ${input.actorUserId}), ''),
      ${input.event},
      ${input.businessId ?? null},
      ${input.subjectUserId ?? null},
      ${JSON.stringify(input.detail ?? {})}::jsonb
    )
  `;
}

/**
 * Writes one row after the action it records has committed. A failed write
 * is reported and swallowed: the log never fails the action it rides on.
 * Never call it inside a transaction (a failed insert would abort it).
 */
export async function recordAudit(sql: Sql, input: AuditInput): Promise<void> {
  try {
    await insertAudit(sql, input);
  } catch (err) {
    await reportServerError(err, "audit");
  }
}

/**
 * Writes to the log of the firm `accountUserId` works in (owner or member);
 * nothing for an account in no firm.
 */
export async function recordAuditForAccount(
  sql: Sql,
  accountUserId: string,
  input: Omit<AuditInput, "firmUserId">,
): Promise<void> {
  try {
    // The firm loadFirmFor (store.ts) names: the account's own, else the one it joined.
    const rows = await sql<{ firm_user_id: string }>`
      select m.firm_user_id from firm_members m
      join firms f on f.user_id = m.firm_user_id
      where m.member_user_id = ${accountUserId}
      order by (m.firm_user_id = ${accountUserId}) desc, m.joined_at asc
      limit 1
    `;
    const firmUserId = rows[0]?.firm_user_id;
    if (!firmUserId) return;
    await insertAudit(sql, { ...input, firmUserId });
  } catch (err) {
    await reportServerError(err, "audit");
  }
}

/**
 * Writes to the log of the firm working on a business (its row's firm, live
 * or deleted); nothing for a business with no firm.
 */
export async function recordAuditForBusiness(
  sql: Sql,
  ownerUserId: string,
  businessId: string,
  input: Omit<AuditInput, "firmUserId" | "businessId">,
): Promise<void> {
  try {
    const rows = await sql<{ firm_user_id: string | null }>`
      select firm_user_id from businesses where user_id = ${ownerUserId} and id = ${businessId}
    `;
    const firmUserId = rows[0]?.firm_user_id;
    if (!firmUserId) return;
    await insertAudit(sql, { ...input, firmUserId, businessId });
  } catch (err) {
    await reportServerError(err, "audit");
  }
}

/**
 * Lets this transaction update or delete activity-log rows. Transaction-local:
 * it ends with the transaction. Only the account deletion, the retention
 * purge and the ownership transfer call it.
 */
export async function withAuditBypass(tx: Sql): Promise<void> {
  await tx`select set_config('precog.audit_bypass', 'on', true)`;
}

/**
 * Removes activity rows older than their firm's retention period, each by
 * its own age (7 years when the firm's row is gone). Returns how many went.
 */
export async function purgeExpiredAudit(sql: Sql): Promise<number> {
  return inTransaction(sql, async (tx) => {
    await withAuditBypass(tx);
    const rows = await tx<{ id: number }>`
      delete from firm_audit_log l
      where l.occurred_at < now() - make_interval(years => coalesce(
        (select f.retention_years from firms f where f.user_id = l.firm_user_id),
        ${DEFAULT_RETENTION_YEARS}::int
      ))
      returning l.id
    `;
    return rows.length;
  });
}

export interface FirmActivityRow {
  actorName: string;
  event: string;
  businessId: string | null;
  subjectUserId: string | null;
  detail: unknown;
  occurredAt: string;
}

/** The firm's log, newest first, for the firm owner's export. */
export async function listFirmActivity(sql: Sql, firmUserId: string): Promise<FirmActivityRow[]> {
  const rows = await sql<{
    actor_name: string;
    event: string;
    business_id: string | null;
    subject_user_id: string | null;
    detail: unknown;
    occurred_at: string;
  }>`
    select actor_name, event, business_id, subject_user_id, detail, occurred_at
    from firm_audit_log where firm_user_id = ${firmUserId}
    order by occurred_at desc, id desc
  `;
  return rows.map((r) => ({
    actorName: r.actor_name,
    event: r.event,
    businessId: r.business_id,
    subjectUserId: r.subject_user_id,
    detail: r.detail,
    occurredAt: toIsoTimestamp(r.occurred_at),
  }));
}
