import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, type Sql } from "@/lib/db";
import { randomHex } from "@/lib/web-crypto";
import { invalidRequest, RequestError, requireObject } from "@/lib/request-errors";
import { DAY_MS, localDateKey } from "../dates";
import { toIsoTimestamp, toIsoTimestampOrNull } from "../iso-time";
import { SlidingWindowLimiter } from "../llm/rate-limit";
import { parseLoadShareInput } from "../public-inputs";
import { MAX_BUSINESS_NAME } from "../business-id";
import { resolveBusinessOwner } from "../business-store";
import { resolveTemplate } from "../active-template";
import { loadEntitlements, requireEntitlementForBusiness } from "../firm/entitlements.server";
import { loadFirmFor } from "../firm/store";
import type { PracticeProfile } from "../practice-profile";
import { requireBusinessRole, requireReportVersion } from "../firm/access.server";
import { checkPasscodeGuess, hashPasscode } from "./share-attempts";
import {
  parseCreateShareInput,
  SHARE_PASSCODE_MIN,
  validateSharePayload,
  type SharedMapPayload,
} from "./share-schema";
import { clamp } from "../number";
import { recordAuditForBusiness } from "../firm/audit.server";
import {
  insertMapShare,
  listMapShareSummaries,
  loadReportShareRow,
  loadSharedReport,
  recordShareView,
  reportShareRefusal,
  revokeShareOnce,
  ShareLimitError,
  shareStillReachable,
} from "./share-store";

export type { SharedMapPayload };

/** The refusal for a map link to a business the caller cannot reach (or not saved yet). */
export const MAP_SHARE_UNSAVED = "Save this business to your account before sharing it.";

/** How the shared page names a link's maker on a link that hides names and was not made by a firm. */
const SHARED_BY_OWN_ACCOUNT = "the business's own account";

/**
 * The page a map link prints, built here from the business as saved, never
 * from what the browser sends: the figures, the process list, the issues and
 * the week's actions are the ones the map builder computes from the same
 * profile. Refused (403) when the caller cannot reach the business, including
 * one whose first save has not reached the account. The page names who made
 * the link (the firm, for a firm's work on a business; else the account) and
 * when the business was last saved. Hiding names scrubs every person on the
 * saved team, people who have left included (buildSharePayload).
 */
async function storedMapPayload(
  sql: Sql,
  callerId: string,
  businessId: string,
  { note, redacted }: { note: string; redacted: boolean },
): Promise<{ businessOwnerId: string; payload: SharedMapPayload }> {
  const businessOwnerId = await resolveBusinessOwner(sql, callerId, businessId);
  if (!businessOwnerId) throw new RequestError(403, MAP_SHARE_UNSAVED);
  const rows = await sql<{
    name: string;
    industry: string;
    profile: PracticeProfile;
    updated_at: unknown;
    user_id: string;
    firm_user_id: string | null;
    granted_at: unknown;
    firm_name: string | null;
    caller_name: string | null;
  }>`
    select b.name, b.industry, b.profile, b.updated_at, b.user_id, b.firm_user_id, b.granted_at,
      f.name as firm_name,
      (select u.name from "user" u where u.id = ${callerId}) as caller_name
    from businesses b
    left join firms f on f.user_id = b.firm_user_id
    where b.user_id = ${businessOwnerId} and b.id = ${businessId} and b.deleted_at is null
  `;
  const row = rows[0];
  if (!row) throw new RequestError(403, MAP_SHARE_UNSAVED);
  const [
    { mergeProfile },
    { buildProcessMapGraph },
    { residualScope },
    { buildWeeklyActions },
    { trackRegisterFreshness },
    { mapAssessed },
    { buildSharePayload },
  ] = await Promise.all([
    import("../profile-merge"),
    import("../process-graph"),
    import("../scoring/scope"),
    import("../weekly-actions/build"),
    import("../continuity/register-state"),
    import("../builder/map-state"),
    import("./share-payload"),
  ]);
  const today = localDateKey(new Date());
  const profile = mergeProfile(
    { profile: row.profile, name: row.name, industry: row.industry },
    today,
  );
  const tpl = resolveTemplate(profile);
  // The inputs the map builder handed in when the browser built the page, so
  // a shared list matches the week's plan the owner sees.
  const { snapshots } = buildProcessMapGraph(tpl, profile.staff, {}, residualScope(profile));
  const actions = buildWeeklyActions({
    tpl,
    staff: profile.staff,
    dualRelease: profile.dualRelease,
    mapSnapshots: snapshots,
    today,
    trackFreshness: trackRegisterFreshness(profile, tpl),
    mapAssessed: mapAssessed(profile),
    decisions: profile.decisions,
    plannedAbsences: profile.plannedAbsences,
    procedures: profile.procedures,
    integrationDriftSummary: profile.integrationDriftSummary,
    accessReconciliation: profile.accessReconciliation,
  });
  // A firm's work on a business carries the firm's name; the business's own
  // account sharing a business it shared with a firm is still the account.
  const byFirm =
    row.firm_user_id !== null &&
    Boolean(row.firm_name) &&
    !(row.user_id === callerId && row.granted_at !== null);
  const account = row.caller_name?.trim();
  const sharedBy = byFirm
    ? (row.firm_name as string)
    : !redacted && account
      ? account
      : SHARED_BY_OWN_ACCOUNT;
  const payload = validateSharePayload({
    ...buildSharePayload(profile, actions, note, redacted),
    sharedBy: sharedBy.slice(0, 200),
    savedAt: toIsoTimestamp(row.updated_at),
  });
  return { businessOwnerId, payload };
}

export const createMapShare = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      businessId: string;
      note?: string;
      expiresInDays?: number;
      redacted?: boolean;
      passcode?: string;
    }) => parseCreateShareInput(input),
  )
  .handler(async ({ context, data }) => {
    const { randomBytes } = await import("node:crypto");
    const sql = await getSql();
    // The link records its business, so deleting the business or removing
    // the member who made it revokes the link.
    const hideNames = data.redacted;
    const { businessOwnerId, payload } = await storedMapPayload(
      sql,
      context.userId,
      data.businessId,
      { note: data.note, redacted: hideNames },
    );
    const token = randomHex(18);
    const expires = new Date(Date.now() + data.expiresInDays * DAY_MS).toISOString();
    const passcodeSalt = data.passcode ? randomBytes(16).toString("hex") : null;
    const passcodeHash =
      data.passcode && passcodeSalt ? await hashPasscode(data.passcode, passcodeSalt) : null;
    const stored = await insertMapShare(sql, {
      token,
      userId: context.userId,
      businessName: payload.businessName.slice(0, MAX_BUSINESS_NAME),
      industry: payload.industry,
      payloadJson: JSON.stringify(payload),
      expiresAt: expires,
      redacted: data.redacted,
      passcodeSalt,
      passcodeHash,
      businessOwnerId,
      businessId: data.businessId,
    });
    if (!stored) throw new ShareLimitError();
    await recordAuditForBusiness(sql, businessOwnerId, data.businessId, {
      actorUserId: context.userId,
      event: "share_created",
      detail: { kind: "map", namesHidden: hideNames },
    });
    return { token, expiresAt: expires, hasPasscode: passcodeHash !== null };
  });

/** The longest passcode a link takes (share-schema.ts keeps the same bound). */
const SHARE_PASSCODE_MAX = 64;

/**
 * createReportShare's input: the version id as the report routes read it, the
 * expiry in days (30 unless given, 1 to 365) and the passcode under the same
 * rule as a map link: typed but out of bounds is refused, not dropped.
 */
function parseCreateReportShareInput(input: unknown): {
  versionId: string;
  expiresInDays: number;
  passcode: string | undefined;
} {
  const raw = requireObject(input);
  if (typeof raw.versionId !== "string" || !/^[\w-]{4,64}$/.test(raw.versionId)) {
    throw new RequestError(400, "Unknown id");
  }
  if (raw.passcode != null && typeof raw.passcode !== "string") throw invalidRequest();
  const passcode = raw.passcode?.trim() || undefined;
  if (passcode && (passcode.length < SHARE_PASSCODE_MIN || passcode.length > SHARE_PASSCODE_MAX)) {
    throw new RequestError(
      400,
      `A passcode needs ${SHARE_PASSCODE_MIN} to ${SHARE_PASSCODE_MAX} characters. Leave it empty for a link without one.`,
    );
  }
  const days = typeof raw.expiresInDays === "number" ? raw.expiresInDays : 30;
  return { versionId: raw.versionId, expiresInDays: clamp(days || 30, 1, 365), passcode };
}

/**
 * Whether a business with no firm may share its reviewed versions: only when
 * its account is in no firm (a member's private business stays refused,
 * since a member reads the firm owner's plan) and that account's own plan
 * allows locked versions (an Assessment inside its window, or a deployment
 * without Stripe). Nothing is read for a firm client.
 */
async function soloShareAllowed(sql: Sql, ownerUserId: string, businessId: string) {
  const rows = await sql<{ firm_user_id: string | null }>`
    select firm_user_id from businesses where user_id = ${ownerUserId} and id = ${businessId}
  `;
  if (!rows[0] || rows[0].firm_user_id !== null) return false;
  if (await loadFirmFor(sql, ownerUserId)) return false;
  return (await loadEntitlements(sql, ownerUserId)).features.lockedVersions;
}

/**
 * A link to a locked report version of a firm's client business, or of a
 * solo owner's business when soloShareAllowed says so. The link stores the
 * version's id, never a copy: the page prints the figures stored at lock
 * through the same renderer as the signed-in version page. Refused for any
 * other solo business, a version not yet reviewed for issuance and a version
 * without stored figures (share-store.ts).
 */
export const createReportShare = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { versionId: string; expiresInDays?: number; passcode?: string }) =>
    parseCreateReportShareInput(input),
  )
  .handler(async ({ context, data }) => {
    const { randomBytes } = await import("node:crypto");
    const sql = await getSql();
    const where = await requireReportVersion(sql, context.userId, data.versionId);
    // Issuing a link is the firm's work on a business with a firm (decision
    // 26): a business its owner shared with a firm reads every version the
    // firm locked but shares none of them.
    await requireBusinessRole(sql, context.userId, where.ownerUserId, where.businessId, "any");
    const allowSolo = await soloShareAllowed(sql, where.ownerUserId, where.businessId);
    const refusal = await reportShareRefusal(sql, where.ownerUserId, data.versionId, {
      allowSolo,
    });
    if (refusal) throw new RequestError(409, refusal);
    // Minting a link is a new issuance action, like locking: it needs the
    // plan even though already-issued links keep serving whatever the plan.
    // The plan is the business's controller's, as lockReport reads it.
    await requireEntitlementForBusiness(sql, where.ownerUserId, where.businessId, "lockedVersions");
    const names = await sql<{ name: string; industry: string }>`
      select name, industry from businesses
      where user_id = ${where.ownerUserId} and id = ${where.businessId}
    `;
    const token = randomHex(18);
    const expires = new Date(Date.now() + data.expiresInDays * DAY_MS).toISOString();
    const passcodeSalt = data.passcode ? randomBytes(16).toString("hex") : null;
    const passcodeHash =
      data.passcode && passcodeSalt ? await hashPasscode(data.passcode, passcodeSalt) : null;
    const stored = await insertMapShare(sql, {
      token,
      userId: context.userId,
      businessName: (names[0]?.name ?? "").slice(0, MAX_BUSINESS_NAME),
      industry: names[0]?.industry ?? "",
      payloadJson: "{}",
      expiresAt: expires,
      redacted: false,
      passcodeSalt,
      passcodeHash,
      businessOwnerId: where.ownerUserId,
      businessId: where.businessId,
      reportVersionId: data.versionId,
    });
    if (!stored) throw new ShareLimitError();
    await recordAuditForBusiness(sql, where.ownerUserId, where.businessId, {
      actorUserId: context.userId,
      event: "share_created",
      detail: { kind: "report", versionId: data.versionId },
    });
    return { token, expiresAt: expires, hasPasscode: passcodeHash !== null };
  });

export const listMapShares = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    // View and failed-guess logs past their retention are purged by the
    // weekly job (routes/api/cron/digest.ts), not on every open of this panel.
    // Every live link, then the newest revoked or expired ones: a live link
    // that dropped off the list could not be revoked from the app.
    return listMapShareSummaries(sql, context.userId);
  });

export const revokeMapShare = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { token: string }) => {
    const raw = requireObject(input);
    if (typeof raw.token !== "string") throw invalidRequest();
    return { token: raw.token.slice(0, 64) };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    // The maker, or the firm owner for a link to one of the firm's clients.
    // Only the call that ended a live link writes the log; a repeat writes nothing.
    const revoked = await revokeShareOnce(sql, context.userId, data.token);
    if (revoked?.outcome === "revoked" && revoked.businessOwnerId && revoked.businessId) {
      await recordAuditForBusiness(sql, revoked.businessOwnerId, revoked.businessId, {
        actorUserId: context.userId,
        event: "share_revoked",
      });
    }
    return { ok: true as const };
  });

type ShareRefusal = "unavailable" | "passcode" | "passcode_wrong" | "rate_limited" | "locked";

/**
 * The steps every public share load takes before it hands anything back:
 * revocation, whether the maker still reaches the business, expiry, the
 * passcode with its per-token attempt window, and the view log. Returns the
 * reason a link does not open, or null when it does. A missing, revoked, or
 * expired link all read as "unavailable", so a prober cannot tell a real
 * token from a made-up one; only the passcode flow keeps its own reasons,
 * and guessing there meets the attempt window and lockout.
 */
async function openShare(
  sql: Sql,
  share: {
    token: string;
    expiresAt: string | null;
    revokedAt: string | null;
    passcodeSalt: string | null;
    passcodeHash: string | null;
  },
  passcode: string | undefined,
  label: string,
): Promise<ShareRefusal | null> {
  if (share.revokedAt || !(await shareStillReachable(sql, share.token))) return "unavailable";
  if (share.expiresAt && new Date(share.expiresAt).getTime() < Date.now()) return "unavailable";
  const [{ createHash, timingSafeEqual }, { requestIp }, { getRequest }] = await Promise.all([
    import("node:crypto"),
    import("@/lib/request-ip.server"),
    import("@tanstack/react-start/server"),
  ]);
  const ip = requestIp();
  const ipHash = createHash("sha256").update(`${share.token}:${ip}`).digest("hex").slice(0, 32);
  if (share.passcodeHash) {
    if (!passcode) return "passcode";
    const salt = share.passcodeSalt;
    if (!salt) {
      // A hash without its salt cannot match any guess; refuse and say so in the log.
      console.error("Share has a passcode hash but no salt", share.token.slice(0, 8));
      return "passcode_wrong";
    }
    // Two limits: the per-process limiter answers fast; the per-token count
    // in Postgres holds across instances and cold starts. The guess takes
    // its place in that count before the passcode is hashed, in one
    // statement, so concurrent guesses cannot all slip under the limit.
    if (!passcodeLimiter.take(ip).allowed) return "rate_limited";
    const expected = Buffer.from(share.passcodeHash, "hex");
    const guess = await checkPasscodeGuess(sql, share.token, ipHash, async () => {
      const actual = Buffer.from(await hashPasscode(passcode, salt), "hex");
      return expected.length === actual.length && timingSafeEqual(expected, actual);
    });
    if (guess === "locked") return "locked";
    if (guess === "wrong") return "passcode_wrong";
  }
  await recordShareView(sql, {
    token: share.token,
    ipHash,
    userAgent: getRequest()?.headers.get("user-agent")?.slice(0, 200) ?? null,
  }).catch((error) => console.error(`Failed to record shared ${label} view`, error));
  return null;
}

const TOKEN_SHAPE = /^[a-f0-9]{24,64}$/;

/**
 * Public: anyone with the token can read a live, non-revoked, non-expired share.
 * POST so the passcode travels in the body, not in a URL that lands in access
 * logs and browser history.
 */
export const loadMapShare = createServerFn({ method: "POST" })
  .validator((input: { token: string; passcode?: string }) => parseLoadShareInput(input))
  .handler(async ({ data }) => {
    // audit: exempt (a visitor opening a link; the link keeps its own view log)
    if (!TOKEN_SHAPE.test(data.token))
      return { found: false as const, reason: "unavailable" as const };
    const { requestIp } = await import("@/lib/request-ip.server");
    // Every open counts, passcode or not: an unprotected link otherwise
    // answers unlimited reads, each writing a view row.
    takeShareViewAllowance(requestIp());
    const sql = await getSql();
    const rows = await sql<ShareRow>`
      select token, payload, created_at, expires_at, revoked_at, redacted, passcode_salt, passcode_hash
      from map_shares
      where token = ${data.token} and report_version_id is null
    `;
    const row = rows[0];
    if (!row) return { found: false as const, reason: "unavailable" as const };
    const expiresAt = toIsoTimestampOrNull(row.expires_at);
    const refused = await openShare(
      sql,
      {
        token: row.token,
        expiresAt,
        revokedAt: toIsoTimestampOrNull(row.revoked_at),
        passcodeSalt: row.passcode_salt,
        passcodeHash: row.passcode_hash,
      },
      data.passcode,
      "map",
    );
    if (refused) return { found: false as const, reason: refused };
    return {
      found: true as const,
      payload: row.payload,
      createdAt: toIsoTimestamp(row.created_at),
      expiresAt,
      redacted: Boolean(row.redacted),
    };
  });

/**
 * Public: the locked version a report link names, with the figures stored at
 * lock, the firm as frozen into the version and the slice of the business
 * the printed report reads (report-share-profile.ts). The same checks as a
 * map link; a map token answers "unavailable" here, as a report token does there.
 */
export const loadReportShare = createServerFn({ method: "POST" })
  .validator((input: { token: string; passcode?: string }) => parseLoadShareInput(input))
  .handler(async ({ data }) => {
    // audit: exempt (a visitor opening a link; the link keeps its own view log)
    if (!TOKEN_SHAPE.test(data.token))
      return { found: false as const, reason: "unavailable" as const };
    // The same per-address allowance as a shared map: a report link is public too.
    const { requestIp } = await import("@/lib/request-ip.server");
    takeShareViewAllowance(requestIp());
    const sql = await getSql();
    const row = await loadReportShareRow(sql, data.token);
    if (!row) return { found: false as const, reason: "unavailable" as const };
    const refused = await openShare(sql, row, data.passcode, "report");
    if (refused) return { found: false as const, reason: refused };
    const report = await loadSharedReport(sql, row, localDateKey(new Date()));
    if (!report) return { found: false as const, reason: "unavailable" as const };
    return {
      found: true as const,
      kind: "report" as const,
      ...report,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
    };
  });

type ShareRow = {
  token: string;
  payload: SharedMapPayload;
  /** timestamptz columns: both drivers return a Date. */
  created_at: unknown;
  expires_at: unknown;
  revoked_at: unknown;
  redacted: boolean;
  passcode_salt: string | null;
  passcode_hash: string | null;
};

const passcodeLimiter = new SlidingWindowLimiter({ limit: 20, windowMs: 60_000 });

/** Opens of any shared map or report one address may make a minute, passcode or not. */
export const SHARE_VIEWS_PER_MINUTE = 60;
const shareViewLimiter = new SlidingWindowLimiter({
  limit: SHARE_VIEWS_PER_MINUTE,
  windowMs: 60_000,
});

/** Refuses (429) an address past its per-minute share-open allowance. */
export function takeShareViewAllowance(ip: string, limiter = shareViewLimiter): void {
  if (limiter.take(ip).allowed) return;
  throw new RequestError(
    429,
    `Precog opens at most ${SHARE_VIEWS_PER_MINUTE} shared links a minute from one address. Wait a minute, then open the link again.`,
  );
}
