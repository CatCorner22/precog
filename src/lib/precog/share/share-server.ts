import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, type Sql } from "@/lib/db";
import { randomHex } from "@/lib/web-crypto";
import { invalidRequest, requireObject } from "@/lib/request-errors";
import { DAY_MS } from "../dates";
import { toIsoTimestamp, toIsoTimestampOrNull } from "../iso-time";
import { SlidingWindowLimiter } from "../llm/rate-limit";
import { parseLoadShareInput } from "../public-inputs";
import { resolveBusinessOwner } from "../business-store";
import { resolveTemplate } from "../active-template";
import type { PracticeProfile } from "../practice-profile";
import { checkPasscodeGuess, hashPasscode, purgeOldPasscodeAttempts } from "./share-attempts";
import { redactSharePayload } from "./share-payload";
import { parseCreateShareInput, type SharedMapPayload } from "./share-schema";
import {
  insertMapShare,
  listMapShareSummaries,
  purgeOldShareViews,
  recordShareView,
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
      businessName: payload.businessName.slice(0, 80),
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

export const listMapShares = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    await purgeShareLogs(sql);
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

/**
 * Public: anyone with the token can read a live, non-revoked, non-expired share.
 * POST so the passcode travels in the body, not in a URL that lands in access
 * logs and browser history.
 */
export const loadMapShare = createServerFn({ method: "POST" })
  .validator((input: { token: string; passcode?: string }) => parseLoadShareInput(input))
  .handler(async ({ data }) => {
    if (!/^[a-f0-9]{24,64}$/.test(data.token))
      return { found: false as const, reason: "invalid" as const };
    const sql = await getSql();
    const rows = await sql<ShareRow>`
      select token, payload, created_at, expires_at, revoked_at, redacted, passcode_salt, passcode_hash
      from map_shares
      where token = ${data.token}
    `;
    const row = rows[0];
    if (!row) return { found: false as const, reason: "missing" as const };
    if (row.revoked_at || !(await shareStillReachable(sql, row.token)))
      return { found: false as const, reason: "revoked" as const };
    const expiresAt = toIsoTimestampOrNull(row.expires_at);
    if (expiresAt && new Date(expiresAt).getTime() < Date.now())
      return { found: false as const, reason: "expired" as const };
    const [{ createHash, timingSafeEqual }, { requestIp }, { getRequest }] = await Promise.all([
      import("node:crypto"),
      import("@/lib/request-ip.server"),
      import("@tanstack/react-start/server"),
    ]);
    const ip = requestIp();
    const ipHash = createHash("sha256").update(`${row.token}:${ip}`).digest("hex").slice(0, 32);
    if (row.passcode_hash) {
      if (!data.passcode) return { found: false as const, reason: "passcode" as const };
      const passcode = data.passcode;
      const salt = row.passcode_salt;
      if (!salt) {
        // A hash without its salt cannot match any guess; refuse and say so in the log.
        console.error("Share has a passcode hash but no salt", row.token.slice(0, 8));
        return { found: false as const, reason: "passcode_wrong" as const };
      }
      // Two limits: the per-process limiter answers fast; the per-token count
      // in Postgres holds across instances and cold starts. The guess takes
      // its place in that count before the passcode is hashed, in one
      // statement, so concurrent guesses cannot all slip under the limit.
      if (!passcodeLimiter.take(ip).allowed)
        return { found: false as const, reason: "rate_limited" as const };
      const expected = Buffer.from(row.passcode_hash, "hex");
      const guess = await checkPasscodeGuess(sql, row.token, ipHash, async () => {
        const actual = Buffer.from(await hashPasscode(passcode, salt), "hex");
        return expected.length === actual.length && timingSafeEqual(expected, actual);
      });
      if (guess === "locked") return { found: false as const, reason: "locked" as const };
      if (guess === "wrong") return { found: false as const, reason: "passcode_wrong" as const };
    }
    await recordShareView(sql, {
      token: row.token,
      ipHash,
      userAgent: getRequest()?.headers.get("user-agent")?.slice(0, 200) ?? null,
    }).catch((error) => console.error("Failed to record shared map view", error));
    return {
      found: true as const,
      payload: row.payload,
      createdAt: toIsoTimestamp(row.created_at),
      expiresAt,
      redacted: Boolean(row.redacted),
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

/** How often one server instance purges the view and failed-guess logs. */
const PURGE_INTERVAL_MS = 60 * 60_000;
let lastPurgeAt = 0;

/**
 * Owner-triggered housekeeping: view and failed-guess logs are kept for a
 * bounded period only. Runs at most once an hour per instance, not on every
 * open of the share panel.
 */
async function purgeShareLogs(sql: Sql): Promise<void> {
  if (Date.now() - lastPurgeAt < PURGE_INTERVAL_MS) return;
  lastPurgeAt = Date.now();
  await purgeOldShareViews(sql).catch((error) =>
    console.error("Failed to purge old share views", error),
  );
  await purgeOldPasscodeAttempts(sql).catch((error) =>
    console.error("Failed to purge old passcode attempts", error),
  );
}
