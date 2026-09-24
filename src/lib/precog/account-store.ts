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
  const u = users[0];
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
