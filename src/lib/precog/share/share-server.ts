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
import { requireEntitlement } from "../firm/entitlements.server";
import type { PracticeProfile } from "../practice-profile";
import { requireReportVersion } from "../firm/access.server";
import { checkPasscodeGuess, hashPasscode } from "./share-attempts";
import { redactSharePayload } from "./share-payload";
import { parseCreateShareInput, SHARE_PASSCODE_MIN, type SharedMapPayload } from "./share-schema";
import { clamp } from "../number";
import {
  insertMapShare,
  listMapShareSummaries,
  loadReportShareRow,
  loadSharedReport,
  recordShareView,
  reportShareRefusal,
  revokeShare,
  ShareLimitError,
  shareStillReachable,
} from "./share-store";

export type { SharedMapPayload };

/** Names on the saved business, including people who have left. */
async function rosterForShare(
  sql: Sql,
  ownerId: string,
  businessId: string,
): Promise<{ name: string; role: string }[]> {
  const rows = await sql<{ profile: PracticeProfile }>`
    select profile from businesses
    where user_id = ${ownerId} and id = ${businessId} and deleted_at is null
  `;
  const profile = rows[0]?.profile;
  if (!profile || typeof profile !== "object") return [];
  try {
    return resolveTemplate(profile)
      .people.filter((person) => person.name.trim())
      .map((person) => ({ name: person.name, role: person.role }));
  } catch {
    return [];
  }
}

export const createMapShare = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      businessId: string;
      payload: SharedMapPayload;
      expiresInDays?: number;
      redacted?: boolean;
      passcode?: string;
    }) => parseCreateShareInput(input),
  )
  .handler(async ({ context, data }) => {
    const { randomBytes } = await import("node:crypto");
    const sql = await getSql();
    // The link records its business, so deleting the business or removing
    // the member who made it revokes the link. A business with no row yet (a
    // new one whose first save is still on its way) is the caller's own:
    // nothing stored can be reached through it, and deleting it later still
    // revokes the link.
    const businessOwnerId =
      (await resolveBusinessOwner(sql, context.userId, data.businessId)) ?? context.userId;
    const token = randomHex(18);
    const expires = new Date(Date.now() + data.expiresInDays * DAY_MS).toISOString();
    const roster = await rosterForShare(sql, businessOwnerId, data.businessId);
    const team = [...roster, ...data.payload.people];
    // The browser may set namesHidden and keep the names. Scrub from the
    // stored roster, including people who have left, and ignore that flag.
    const hideNames = data.redacted || data.payload.namesHidden === true;
    const payload = hideNames ? redactSharePayload(data.payload, team) : data.payload;
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
 * A link to a locked report version of a firm's client business. The link
 * stores the version's id, never a copy: the page prints the figures stored
 * at lock through the same renderer as the signed-in version page. Refused
 * for a solo business, a version not yet reviewed for issuance and a version
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
    const refusal = await reportShareRefusal(sql, where.ownerUserId, data.versionId);
    if (refusal) throw new RequestError(409, refusal);
    // Minting a link is a new issuance action, like locking: it needs the
    // plan even though already-issued links keep serving whatever the plan.
    await requireEntitlement(sql, context.userId, "lockedVersions");
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
    await revokeShare(sql, context.userId, data.token);
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
