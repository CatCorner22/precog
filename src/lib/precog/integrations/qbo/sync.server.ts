import type { Sql } from "@/lib/db";
import { reportServerError } from "@/lib/observability/report.server";
import {
  decryptSecret,
  encryptSecret,
  IntuitTokenError,
  qboConfigured,
  query,
  refreshTokens,
  revokeToken,
  type TokenSet,
} from "./client.server";
import {
  diffSnapshots,
  employeesFromQuery,
  vendorsFromQuery,
  type IntegrationDrift,
  type QboSnapshot,
} from "./model";
import {
  deleteConnection,
  insertSnapshot,
  listConnectionsDue,
  listSnapshots,
  loadConnection,
  mapPeopleFor,
  markSynced,
  sealReading,
  updateTokens,
  type ConnectionRow,
  type QboReading,
} from "./store";

/**
 * One reading of a connected company: refresh the access token when it is
 * about to lapse, pull vendors and employees, store the snapshot, and return
 * what changed against the reading before, matched to the duty map's people.
 * A reading identical to the newest one is not stored again, so pressing
 * "Read the books now" twice keeps the change the first press found.
 */
export async function syncConnection(
  sql: Sql,
  connection: ConnectionRow,
): Promise<IntegrationDrift> {
  const accessToken = await freshAccessToken(sql, connection);
  const [vendorBody, employeeBody] = await Promise.all([
    readList(connection.realmId, accessToken, "Vendor"),
    readList(connection.realmId, accessToken, "Employee"),
  ]);
  const reading = sealReading({
    vendors: vendorsFromQuery(vendorBody),
    employees: employeesFromQuery(employeeBody),
  });

  const { ownerUserId, businessId } = connection;
  const [newest, beforeNewest] = await listSnapshots(sql, ownerUserId, businessId, 2);
  let current: QboSnapshot;
  let previous: QboSnapshot | null;
  if (newest && sameReading(newest, reading)) {
    current = newest;
    previous = beforeNewest ?? null;
  } else {
    current = await insertSnapshot(sql, ownerUserId, businessId, reading);
    previous = newest ?? null;
  }
  await markSynced(sql, ownerUserId, businessId, null);
  return diffSnapshots(previous, current, await mapPeopleFor(sql, ownerUserId, businessId));
}

/**
 * The scheduled pass: every connection whose reading is stale. A failure is
 * recorded on the connection as a sentence the advisor can act on; the raw
 * error goes to the server log.
 */
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
      await recordReadingFailure(sql, connection, err);
    }
  }
  return { synced, failed };
}

/**
 * Revokes the connection at Intuit when the stored token can still be read,
 * then removes it here either way: a changed INTEGRATION_KEY must not leave
 * a connection nobody can remove.
 */
export async function removeConnection(
  sql: Sql,
  connection: Pick<ConnectionRow, "ownerUserId" | "businessId" | "refreshTokenEnc">,
): Promise<void> {
  let refreshToken: string | null = null;
  try {
    refreshToken = decryptSecret(connection.refreshTokenEnc);
  } catch {
    // The key changed; Intuit keeps the grant until it lapses or the company revokes it.
  }
  if (refreshToken) await revokeToken(refreshToken);
  await deleteConnection(sql, connection.ownerUserId, connection.businessId);
}

/**
 * Records a failed reading on the connection and returns the sentence shown
 * for it: Intuit, Node crypto and fetch errors mean nothing to an advisor.
 */
export async function recordReadingFailure(
  sql: Sql,
  connection: Pick<ConnectionRow, "ownerUserId" | "businessId">,
  err: unknown,
): Promise<string> {
  await reportServerError(err, "qbo-reading");
  const message = readingFailureMessage(err);
  await markSynced(sql, connection.ownerUserId, connection.businessId, message);
  return message;
}

function readingFailureMessage(err: unknown): string {
  if (isTimeout(err)) {
    return "QuickBooks did not answer in time. Try again later.";
  }
  if (
    err instanceof ConnectionRefused ||
    (err instanceof Error && /answered 401/.test(err.message))
  ) {
    return "QuickBooks no longer accepts this connection. Disconnect and connect again.";
  }
  return "QuickBooks refused the request. Try again later.";
}

function isTimeout(err: unknown): boolean {
  return err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
}

/**
 * The stored tokens cannot be read (the key changed) or Intuit refused the
 * grant itself. Only connecting again helps, so the advisor is told to.
 */
class ConnectionRefused extends Error {
  constructor(cause: unknown) {
    super("QuickBooks no longer accepts this connection", { cause });
    this.name = "ConnectionRefused";
  }
}

/**
 * A usable access token. When two readings refresh at once, Intuit's
 * rotating refresh token must not be overwritten by the superseded pair, so
 * the loser of the write uses the token the winner stored.
 */
async function freshAccessToken(sql: Sql, connection: ConnectionRow): Promise<string> {
  if (Date.parse(connection.accessExpiresAt) - Date.now() >= REFRESH_MARGIN_MS) {
    return unseal(connection.accessTokenEnc);
  }
  const refreshToken = unseal(connection.refreshTokenEnc);
  let fresh: TokenSet;
  try {
    fresh = await refreshTokens(refreshToken);
  } catch (err) {
    // An Intuit outage or a network failure is not a revoked grant: telling
    // the advisor to disconnect would delete the readings for nothing.
    if (err instanceof IntuitTokenError && err.grantRefused) throw new ConnectionRefused(err);
    throw err;
  }
  const stored = await updateTokens(sql, connection, {
    accessTokenEnc: encryptSecret(fresh.accessToken),
    refreshTokenEnc: encryptSecret(fresh.refreshToken),
    accessExpiresAt: fresh.accessExpiresAt,
    refreshExpiresAt: fresh.refreshExpiresAt,
  });
  if (stored) return fresh.accessToken;
  const winner = await loadConnection(sql, connection.ownerUserId, connection.businessId);
  if (!winner) throw new Error("Someone removed the QuickBooks connection during the reading");
  return unseal(winner.accessTokenEnc);
}

function unseal(sealed: string): string {
  try {
    return decryptSecret(sealed);
  } catch (err) {
    throw new ConnectionRefused(err);
  }
}

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

function sameReading(snapshot: QboSnapshot, reading: QboReading): boolean {
  return (
    canonical(snapshot.vendors) === canonical(reading.vendors) &&
    canonical(snapshot.employees) === canonical(reading.employees)
  );
}

/** Rows as text with sorted keys: jsonb does not keep the key order they were written in. */
function canonical(rows: readonly object[]): string {
  return JSON.stringify(
    rows.map((row) => Object.entries(row).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
  );
}

/** How old a reading may get before the scheduled run re-reads the books. */
const SYNC_STALE_DAYS = 28;
/** Intuit's largest page. */
const PAGE_SIZE = 1000;
/** A safety stop: 20 pages is 20,000 names, far past a 2-50 person business. */
const MAX_PAGES = 20;
/** Refresh when the access token has less than this left. */
const REFRESH_MARGIN_MS = 60_000;
