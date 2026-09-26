import type { Sql } from "@/lib/db";
import type { PracticeProfile } from "../../practice-profile";
import { resolveTemplate } from "../../active-template";
import { normalizeProfile } from "../../practice-profile";
import { decryptSecret, encryptSecret, qboConfigured, query, refreshTokens } from "./client.server";
import {
  diffSnapshots,
  employeesFromQuery,
  vendorsFromQuery,
  type IntegrationDrift,
} from "./model";
import {
  insertSnapshot,
  listConnectionsDue,
  listSnapshots,
  markSynced,
  updateTokens,
  type ConnectionRow,
} from "./store";

/** How old a reading may get before the scheduled run re-reads the books. */
const SYNC_STALE_DAYS = 28;

/**
 * One reading of a connected company: refresh the access token when it is
 * about to lapse, pull vendors and employees, store the snapshot, and return
 * what changed against the reading before, matched to the duty map's people.
 */
export async function syncConnection(
  sql: Sql,
  connection: ConnectionRow,
): Promise<IntegrationDrift> {
  let accessToken = decryptSecret(connection.accessTokenEnc);
  if (Date.parse(connection.accessExpiresAt) - Date.now() < 60_000) {
    const fresh = await refreshTokens(decryptSecret(connection.refreshTokenEnc));
    await updateTokens(sql, connection.ownerUserId, connection.businessId, {
      accessTokenEnc: encryptSecret(fresh.accessToken),
      refreshTokenEnc: encryptSecret(fresh.refreshToken),
      accessExpiresAt: fresh.accessExpiresAt,
      refreshExpiresAt: fresh.refreshExpiresAt,
    });
    accessToken = fresh.accessToken;
  }

  const [vendorBody, employeeBody] = await Promise.all([
    readList(connection.realmId, accessToken, "Vendor"),
    readList(connection.realmId, accessToken, "Employee"),
  ]);
  const [previous] = await listSnapshots(sql, connection.ownerUserId, connection.businessId, 1);
  const current = await insertSnapshot(sql, connection.ownerUserId, connection.businessId, {
    vendors: vendorsFromQuery(vendorBody),
    employees: employeesFromQuery(employeeBody),
  });
  const rows = await sql<{ profile: PracticeProfile }>`
    select profile from businesses
    where user_id = ${connection.ownerUserId} and id = ${connection.businessId}
  `;
  const people = rows[0] ? resolveTemplate(normalizeProfile(rows[0].profile)).people : [];
  await markSynced(sql, connection.ownerUserId, connection.businessId, null);
  return diffSnapshots(previous ?? null, current, people);
}

/** Intuit's largest page. */
const PAGE_SIZE = 1000;
/** A safety stop: 20 pages is 20,000 names, far past a 2-50 person business. */
const MAX_PAGES = 20;

/**
 * Every vendor or employee, active or not, page by page. QuickBooks returns
 * only active name-list rows unless the query asks for both, and a person
 * made inactive is exactly the release the drift has to see.
 */
async function readList(
  realmId: string,
  accessToken: string,
  entity: "Vendor" | "Employee",
): Promise<{ QueryResponse: Record<string, unknown[]> }> {
  const rows: unknown[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const body = (await query(
      realmId,
      accessToken,
      `select * from ${entity} where Active in (true, false) startposition ${page * PAGE_SIZE + 1} maxresults ${PAGE_SIZE}`,
    )) as { QueryResponse?: Record<string, unknown> } | null;
    const found = body?.QueryResponse?.[entity];
    const batch = Array.isArray(found) ? found : [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return { QueryResponse: { [entity]: rows } };
}

/** The scheduled pass: every connection whose reading is stale. Errors are recorded per connection. */
export async function syncDueConnections(sql: Sql): Promise<{ synced: number; failed: number }> {
  if (!qboConfigured()) return { synced: 0, failed: 0 };
  let synced = 0;
  let failed = 0;
  for (const connection of await listConnectionsDue(sql, SYNC_STALE_DAYS)) {
    try {
      await syncConnection(sql, connection);
      synced += 1;
    } catch (err) {
      failed += 1;
      await markSynced(
        sql,
        connection.ownerUserId,
        connection.businessId,
        (err instanceof Error ? err.message : String(err)).slice(0, 300),
      );
    }
  }
  return { synced, failed };
}
