import type { Sql } from "@/lib/db";
import { toIsoTimestamp, toIsoTimestampOrNull } from "./iso-time";
import { userScope } from "./llm/daily-usage";

/**
 * Everything the app holds for one account, in one JSON document the owner can
 * keep. Passcode hashes and salts are left out on purpose.
 */
export interface AccountExport {
  exportedAt: string;
  user: { id: string; name: string; email: string; createdAt: string } | null;
  businesses: Array<{
    id: string;
    name: string;
    industry: string;
    revision: number;
    updatedAt: string;
    profile: unknown;
  }>;
  snapshots: Array<{
    id: string;
    title: string;
    practiceName: string;
    createdAt: string;
    profile: unknown;
    powerMap: unknown;
    valueCase: unknown;
    valueEvidence: unknown;
  }>;
  shares: Array<{
    token: string;
    businessName: string;
    createdAt: string;
    expiresAt: string | null;
    revokedAt: string | null;
    redacted: boolean;
    payload: unknown;
  }>;
  firm: { name: string; plan: string; updatedAt: string } | null;
  engagements: Array<{
    businessId: string;
    startedAt: string | null;
    mapCompletedAt: string | null;
    reportSentAt: string | null;
    openFindings: number;
    acceptedFindings: number;
  }>;
  reviews: Array<{
    businessId: string;
    period: string;
    itemKey: string;
    ownerName: string;
    result: string;
    notes: string;
    recordedAt: string;
  }>;
}

export async function exportAccountRows(sql: Sql, userId: string): Promise<AccountExport> {
  const users = await sql<{ id: string; name: string; email: string; createdAt: string }>`
    select "id", "name", "email", "createdAt" from "user" where "id" = ${userId}
  `;
  const businesses = await sql<{
    id: string;
    name: string;
    industry: string;
    revision: number | string;
    updated_at: string;
    profile: unknown;
  }>`
    select id, name, industry, revision, updated_at, profile
    from businesses where user_id = ${userId} order by updated_at desc
  `;
  const snapshots = await sql<{
    id: string;
    title: string;
    practice_name: string;
    created_at: string;
    profile_json: unknown;
    power_map_json: unknown;
    value_case_json: unknown;
    value_evidence_json: unknown;
  }>`
    select id, title, practice_name, created_at, profile_json, power_map_json,
      value_case_json, value_evidence_json
    from assessment_snapshots where user_id = ${userId} order by created_at desc
  `;
  const shares = await sql<{
    token: string;
    business_name: string;
    created_at: string;
    expires_at: string | null;
    revoked_at: string | null;
    redacted: boolean;
    payload: unknown;
  }>`
    select token, business_name, created_at, expires_at, revoked_at, redacted, payload
    from map_shares where user_id = ${userId} order by created_at desc
  `;
  const firmRows = await sql<{ name: string; plan: string; updated_at: string }>`
    select name, plan, updated_at from firms where user_id = ${userId}
  `;
  const engagements = await sql<{
    business_id: string;
    started_at: string | null;
    map_completed_at: string | null;
    report_sent_at: string | null;
    open_findings: number | string;
    accepted_findings: number | string;
  }>`
    select business_id, started_at, map_completed_at, report_sent_at, open_findings, accepted_findings
    from engagement_marks where user_id = ${userId}
  `;
  const reviews = await sql<{
    business_id: string;
    period: string;
    item_key: string;
    owner_name: string;
    result: string;
    notes: string;
    recorded_at: string;
  }>`
    select business_id, period, item_key, owner_name, result, notes, recorded_at
    from review_events where user_id = ${userId} order by recorded_at desc
  `;
  const u = users[0];
  const firm = firmRows[0];
  return {
    exportedAt: new Date().toISOString(),
    user: u
      ? { id: u.id, name: u.name, email: u.email, createdAt: toIsoTimestamp(u.createdAt) }
      : null,
    businesses: businesses.map((b) => ({
      id: b.id,
      name: b.name,
      industry: b.industry,
      revision: Number(b.revision),
      updatedAt: toIsoTimestamp(b.updated_at),
      profile: b.profile,
    })),
    snapshots: snapshots.map((s) => ({
      id: s.id,
      title: s.title,
      practiceName: s.practice_name,
      createdAt: toIsoTimestamp(s.created_at),
      profile: s.profile_json,
      powerMap: s.power_map_json,
      valueCase: s.value_case_json,
      valueEvidence: s.value_evidence_json,
    })),
    shares: shares.map((s) => ({
      token: s.token,
      businessName: s.business_name,
      createdAt: toIsoTimestamp(s.created_at),
      expiresAt: toIsoTimestampOrNull(s.expires_at),
      revokedAt: toIsoTimestampOrNull(s.revoked_at),
      redacted: Boolean(s.redacted),
      payload: s.payload,
    })),
    firm: firm
      ? { name: firm.name, plan: firm.plan, updatedAt: toIsoTimestamp(firm.updated_at) }
      : null,
    engagements: engagements.map((e) => ({
      businessId: e.business_id,
      startedAt: toIsoTimestampOrNull(e.started_at),
      mapCompletedAt: toIsoTimestampOrNull(e.map_completed_at),
      reportSentAt: toIsoTimestampOrNull(e.report_sent_at),
      openFindings: Number(e.open_findings),
      acceptedFindings: Number(e.accepted_findings),
    })),
    reviews: reviews.map((r) => ({
      businessId: r.business_id,
      period: r.period,
      itemKey: r.item_key,
      ownerName: r.owner_name,
      result: r.result,
      notes: r.notes,
      recordedAt: toIsoTimestamp(r.recorded_at),
    })),
  };
}

/**
 * Removes every row the account owns and then the account itself. Snapshots
 * and the per-user model-usage counts carry no foreign key to the user, so
 * they are deleted explicitly; shares, share views, share attempts,
 * businesses, the active pointer, sessions and linked accounts cascade from
 * the user row. The app-wide usage count is not the account's and stays.
 */
export async function deleteAccountRows(sql: Sql, userId: string): Promise<void> {
  await sql`delete from assessment_snapshots where user_id = ${userId}`;
  await sql`delete from llm_daily_usage where scope = ${userScope(userId)}`;
  await sql`delete from map_shares where user_id = ${userId}`;
  await sql`delete from businesses where user_id = ${userId}`;
  await sql`delete from business_profiles where user_id = ${userId}`;
  await sql`delete from "user" where "id" = ${userId}`;
}

/** Share view logs older than this are purged whenever an owner lists shares. */
export const SHARE_VIEW_RETENTION_DAYS = 90;

export async function purgeOldShareViews(sql: Sql): Promise<void> {
  await sql`
    delete from map_share_views
    where viewed_at < now() - make_interval(days => ${SHARE_VIEW_RETENTION_DAYS})
  `;
}
