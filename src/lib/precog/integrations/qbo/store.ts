import type { Sql } from "@/lib/db";
import { toIsoTimestamp, toIsoTimestampOrNull } from "../../iso-time";
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
  realmId: string;
  connectedAt: string;
  lastSyncedAt: string | null;
  lastError: string | null;
  refreshExpiresAt: string;
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

export function statusOf(row: ConnectionRow): ConnectionStatus {
  return {
    realmId: row.realmId,
    connectedAt: row.connectedAt,
    lastSyncedAt: row.lastSyncedAt,
    lastError: row.lastError,
    refreshExpiresAt: row.refreshExpiresAt,
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
    connectedBy: string;
  },
): Promise<void> {
  await sql`
    insert into integration_connections (
      user_id, business_id, provider, realm_id, access_token_enc, refresh_token_enc,
      access_expires_at, refresh_expires_at, connected_by, connected_at, last_error
    )
    values (
      ${input.ownerUserId}, ${input.businessId}, 'qbo', ${input.realmId},
      ${input.accessTokenEnc}, ${input.refreshTokenEnc},
      ${input.accessExpiresAt}, ${input.refreshExpiresAt}, ${input.connectedBy}, now(), null
    )
    on conflict (user_id, business_id, provider) do update set
      realm_id = excluded.realm_id,
      access_token_enc = excluded.access_token_enc,
      refresh_token_enc = excluded.refresh_token_enc,
      access_expires_at = excluded.access_expires_at,
      refresh_expires_at = excluded.refresh_expires_at,
      connected_by = excluded.connected_by,
      connected_at = now(),
      last_error = null
  `;
}

export async function updateTokens(
  sql: Sql,
  ownerUserId: string,
  businessId: string,
  tokens: {
    accessTokenEnc: string;
    refreshTokenEnc: string;
    accessExpiresAt: string;
    refreshExpiresAt: string;
  },
): Promise<void> {
  await sql`
    update integration_connections set
      access_token_enc = ${tokens.accessTokenEnc},
      refresh_token_enc = ${tokens.refreshTokenEnc},
      access_expires_at = ${tokens.accessExpiresAt},
      refresh_expires_at = ${tokens.refreshExpiresAt}
    where user_id = ${ownerUserId} and business_id = ${businessId} and provider = 'qbo'
  `;
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

export async function deleteConnection(
  sql: Sql,
  ownerUserId: string,
  businessId: string,
): Promise<void> {
  await sql`
    delete from integration_connections
    where user_id = ${ownerUserId} and business_id = ${businessId} and provider = 'qbo'
  `;
  await sql`
    delete from integration_snapshots
    where user_id = ${ownerUserId} and business_id = ${businessId} and provider = 'qbo'
  `;
}

export async function insertSnapshot(
  sql: Sql,
  ownerUserId: string,
  businessId: string,
  snapshot: { vendors: QboVendor[]; employees: QboEmployee[] },
): Promise<QboSnapshot> {
  const rows = await sql<{ taken_at: string }>`
    insert into integration_snapshots (user_id, business_id, provider, vendors, employees)
    values (
      ${ownerUserId}, ${businessId}, 'qbo',
      ${JSON.stringify(snapshot.vendors)}::jsonb, ${JSON.stringify(snapshot.employees)}::jsonb
    )
    returning taken_at
  `;
  // Keep the last twelve readings per business.
  await sql`
    delete from integration_snapshots
    where user_id = ${ownerUserId} and business_id = ${businessId} and provider = 'qbo'
      and id not in (
        select id from integration_snapshots
        where user_id = ${ownerUserId} and business_id = ${businessId} and provider = 'qbo'
        order by taken_at desc limit 12
      )
  `;
  return { takenAt: toIsoTimestamp(rows[0].taken_at), ...snapshot };
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
    order by taken_at desc limit ${limit}::int
  `;
  return rows.map((r) => ({
    takenAt: toIsoTimestamp(r.taken_at),
    vendors: r.vendors,
    employees: r.employees,
  }));
}
