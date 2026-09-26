import type { Sql } from "@/lib/db";
import { inTransaction } from "@/lib/sql-transaction";
import { toIsoTimestamp, toIsoTimestampOrNull } from "../../iso-time";
import { resolveTemplate } from "../../active-template";
import { normalizeProfile, type PracticeProfile } from "../../practice-profile";
import { digestSecret } from "./client.server";
import type { QboEmployee, QboSnapshot, QboVendor } from "./model";

export interface ConnectionRow {
  ownerUserId: string;
  businessId: string;
  realmId: string;
  accessTokenEnc: string;
  refreshTokenEnc: string;
  accessExpiresAt: string;
  refreshExpiresAt: string;
  connectedAt: string;
  lastSyncedAt: string | null;
  lastError: string | null;
}

/** What the firm workspace shows about a connection; never the tokens. */
export interface ConnectionStatus {
  connectedAt: string;
  lastSyncedAt: string | null;
  lastError: string | null;
  /** The permission QuickBooks gave has lapsed; only a new connection reads the books again. */
  needsReconnect: boolean;
}

/** The vendor and employee lists of one reading. */
export interface QboReading {
  vendors: QboVendor[];
  employees: QboEmployee[];
}

export function statusOf(row: ConnectionRow, now = Date.now()): ConnectionStatus {
  return {
    connectedAt: row.connectedAt,
    lastSyncedAt: row.lastSyncedAt,
    lastError: row.lastError,
    needsReconnect: Date.parse(row.refreshExpiresAt) <= now,
  };
}

export async function saveConnection(
  sql: Sql,
  input: {
    ownerUserId: string;
    businessId: string;
    realmId: string;
    accessTokenEnc: string;
    refreshTokenEnc: string;
    accessExpiresAt: string;
    refreshExpiresAt: string;
  },
): Promise<void> {
  await sql`
    insert into integration_connections (
      user_id, business_id, provider, realm_id, access_token_enc, refresh_token_enc,
      access_expires_at, refresh_expires_at, connected_at, last_error
    )
    values (
      ${input.ownerUserId}, ${input.businessId}, 'qbo', ${input.realmId},
      ${input.accessTokenEnc}, ${input.refreshTokenEnc},
      ${input.accessExpiresAt}, ${input.refreshExpiresAt}, now(), null
    )
    on conflict (user_id, business_id, provider) do update set
      realm_id = excluded.realm_id,
      access_token_enc = excluded.access_token_enc,
      refresh_token_enc = excluded.refresh_token_enc,
      access_expires_at = excluded.access_expires_at,
      refresh_expires_at = excluded.refresh_expires_at,
      connected_at = now(),
      last_error = null
  `;
}

/**
 * Stores a refreshed token pair, but only over the refresh token it was made
 * from. Intuit rotates refresh tokens, so when two readings refresh at once
 * the later write would keep a superseded pair; this returns false instead,
 * and the caller uses the pair the other reading stored.
 */
export async function updateTokens(
  sql: Sql,
  connection: Pick<ConnectionRow, "ownerUserId" | "businessId" | "refreshTokenEnc">,
  tokens: {
    accessTokenEnc: string;
    refreshTokenEnc: string;
    accessExpiresAt: string;
    refreshExpiresAt: string;
  },
): Promise<boolean> {
  const rows = await sql<{ updated: number }>`
    update integration_connections set
      access_token_enc = ${tokens.accessTokenEnc},
      refresh_token_enc = ${tokens.refreshTokenEnc},
      access_expires_at = ${tokens.accessExpiresAt},
      refresh_expires_at = ${tokens.refreshExpiresAt}
    where user_id = ${connection.ownerUserId} and business_id = ${connection.businessId}
      and provider = 'qbo' and refresh_token_enc = ${connection.refreshTokenEnc}
    returning 1 as updated
  `;
  return rows.length > 0;
}

export async function loadConnection(
  sql: Sql,
  ownerUserId: string,
  businessId: string,
): Promise<ConnectionRow | null> {
  const rows = await sql<RawConnection>`
    select * from integration_connections
    where user_id = ${ownerUserId} and business_id = ${businessId} and provider = 'qbo'
  `;
  return rows[0] ? toRow(rows[0]) : null;
}

/** Connections not read within `staleDays`, on live businesses only. */
export async function listConnectionsDue(sql: Sql, staleDays: number): Promise<ConnectionRow[]> {
  const rows = await sql<RawConnection>`
    select c.* from integration_connections c
    join businesses b on b.user_id = c.user_id and b.id = c.business_id and b.deleted_at is null
    where c.provider = 'qbo'
      and (c.last_synced_at is null
        or c.last_synced_at < now() - make_interval(days => ${staleDays}::int))
      and c.refresh_expires_at > now()
    order by c.last_synced_at asc nulls first
    limit 50
  `;
  return rows.map(toRow);
}

export async function markSynced(
  sql: Sql,
  ownerUserId: string,
  businessId: string,
  error: string | null,
): Promise<void> {
  await sql`
    update integration_connections set
      last_synced_at = case when ${error}::text is null then now() else last_synced_at end,
      last_error = ${error}
    where user_id = ${ownerUserId} and business_id = ${businessId} and provider = 'qbo'
  `;
}

/** Removes the connection and every reading taken through it, together. */
export async function deleteConnection(
  sql: Sql,
  ownerUserId: string,
  businessId: string,
): Promise<void> {
  await inTransaction(sql, async (tx) => {
    await tx`
      delete from integration_connections
      where user_id = ${ownerUserId} and business_id = ${businessId} and provider = 'qbo'
    `;
    await tx`
      delete from integration_snapshots
      where user_id = ${ownerUserId} and business_id = ${businessId} and provider = 'qbo'
    `;
  });
}

/**
 * Stores one reading and keeps the last twelve. Account numbers, addresses
 * and emails are stored as keyed digests: the drift only asks whether they
 * changed, never what they are.
 */
export async function insertSnapshot(
  sql: Sql,
  ownerUserId: string,
  businessId: string,
  reading: QboReading,
): Promise<QboSnapshot> {
  const sealed = sealReading(reading);
  const rows = await sql<{ taken_at: string }>`
    insert into integration_snapshots (user_id, business_id, provider, vendors, employees)
    values (
      ${ownerUserId}, ${businessId}, 'qbo',
      ${JSON.stringify(sealed.vendors)}::jsonb, ${JSON.stringify(sealed.employees)}::jsonb
    )
    returning taken_at
  `;
  await sql`
    delete from integration_snapshots
    where user_id = ${ownerUserId} and business_id = ${businessId} and provider = 'qbo'
      and id not in (
        select id from integration_snapshots
        where user_id = ${ownerUserId} and business_id = ${businessId} and provider = 'qbo'
        order by taken_at desc limit ${SNAPSHOTS_KEPT}::int
      )
  `;
  return { takenAt: toIsoTimestamp(rows[0].taken_at), ...sealed };
}

/** The newest readings, newest first. */
export async function listSnapshots(
  sql: Sql,
  ownerUserId: string,
  businessId: string,
  limit = 2,
): Promise<QboSnapshot[]> {
  const rows = await sql<{ taken_at: string; vendors: QboVendor[]; employees: QboEmployee[] }>`
    select taken_at, vendors, employees from integration_snapshots
    where user_id = ${ownerUserId} and business_id = ${businessId} and provider = 'qbo'
    order by taken_at desc, id desc limit ${limit}::int
  `;
  // Readings stored before digests existed are sealed on the way out, so
  // they compare equal to a sealed reading of the same books.
  return rows.map((r) => ({
    takenAt: toIsoTimestamp(r.taken_at),
    ...sealReading({ vendors: r.vendors, employees: r.employees }),
  }));
}

/** The duty map's people for a business, as the drift matches them against payroll. */
export async function mapPeopleFor(
  sql: Sql,
  ownerUserId: string,
  businessId: string,
): Promise<{ name: string; active?: boolean }[]> {
  const rows = await sql<{ profile: PracticeProfile }>`
    select profile from businesses where user_id = ${ownerUserId} and id = ${businessId}
  `;
  return rows[0] ? resolveTemplate(normalizeProfile(rows[0].profile)).people : [];
}

/** A reading with its compare-only fields replaced by digests; digests pass through unchanged. */
export function sealReading(reading: QboReading): QboReading {
  return { vendors: reading.vendors.map(sealRow), employees: reading.employees.map(sealRow) };
}

const SNAPSHOTS_KEPT = 12;
const COMPARE_ONLY_FIELDS = ["email", "address", "accountNumber"] as const;

function sealRow<T extends object>(row: T): T {
  const out = { ...row } as Record<string, unknown>;
  for (const field of COMPARE_ONLY_FIELDS) {
    const value = out[field];
    if (typeof value === "string" && !value.startsWith("hmac:")) out[field] = digestSecret(value);
  }
  return out as T;
}

interface RawConnection {
  user_id: string;
  business_id: string;
  realm_id: string;
  access_token_enc: string;
  refresh_token_enc: string;
  access_expires_at: string;
  refresh_expires_at: string;
  connected_at: string;
  last_synced_at: string | null;
  last_error: string | null;
}

function toRow(r: RawConnection): ConnectionRow {
  return {
    ownerUserId: r.user_id,
    businessId: r.business_id,
    realmId: r.realm_id,
    accessTokenEnc: r.access_token_enc,
    refreshTokenEnc: r.refresh_token_enc,
    accessExpiresAt: toIsoTimestamp(r.access_expires_at),
    refreshExpiresAt: toIsoTimestamp(r.refresh_expires_at),
    connectedAt: toIsoTimestamp(r.connected_at),
    lastSyncedAt: toIsoTimestampOrNull(r.last_synced_at),
    lastError: r.last_error,
  };
}
