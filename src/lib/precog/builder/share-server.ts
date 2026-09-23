import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { SlidingWindowLimiter } from "../llm/rate-limit";
import type { IndustryId } from "../industry";
import type { MapHealthReport } from "../process-graph";
import { validateSharePayload } from "./share-schema";
import { passcodeLocked, recordPasscodeFailure } from "./share-attempts";
import { purgeOldShareViews } from "../account-store";
import { insertMapShare, listMapShareSummaries, ShareLimitError } from "./share-store";

/** Frozen, self-contained view of a map for the public share page. */
export interface SharedMapPayload {
  version: 1;
  businessName: string;
  industry: IndustryId;
  industryLabel: string;
  teamLabel: string;
  generatedAt: string;
  health: Pick<
    MapHealthReport,
    "score" | "bandLabel" | "summary" | "dimensions" | "processCount" | "avgHeat" | "hotProcesses"
  >;
  processes: {
    id: string;
    name: string;
    description: string;
    stage: number;
    heat: number;
    owners: string[];
    controls: { name: string; segregated: boolean }[];
    risks: { title: string; kind: string; severity: number; likelihood: number }[];
    dependencies: string[];
    evidence: { label: string; frequency: string; status: string }[];
  }[];
  people: { name: string; role: string }[];
  issues: string[];
  actions: { title: string; why: string; effort: string }[];
  /** Optional note from the owner to the reader. */
  note?: string;
}

type ShareRow = {
  token: string;
  business_name: string;
  industry: string;
  payload: SharedMapPayload;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  redacted: boolean;
  passcode_salt: string | null;
  passcode_hash: string | null;
};

function makeToken(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const passcodeLimiter = new SlidingWindowLimiter({ limit: 20, windowMs: 60_000 });

export const createMapShare = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      payload: SharedMapPayload;
      expiresInDays?: number;
      redacted?: boolean;
      passcode?: string;
    }) => {
      const passcode = input.passcode?.trim();
      return {
        payload: validateSharePayload(input.payload),
        expiresInDays: Math.min(365, Math.max(1, Number(input.expiresInDays) || 30)),
        redacted: Boolean(input.redacted),
        // Eight characters or more: a four-digit PIN falls to a few thousand guesses.
        passcode: passcode && passcode.length >= 8 && passcode.length <= 64 ? passcode : undefined,
      };
    },
  )
  .handler(async ({ context, data }) => {
    const { randomBytes, scryptSync } = await import("node:crypto");
    const sql = await getSql();
    const token = makeToken();
    const expires = new Date(Date.now() + data.expiresInDays * 86_400_000).toISOString();
    let passcodeSalt: string | undefined;
    let passcodeHash: string | undefined;
    if (data.passcode) {
      passcodeSalt = randomBytes(16).toString("hex");
      passcodeHash = scryptSync(data.passcode, passcodeSalt, 32).toString("hex");
    }
    const stored = await insertMapShare(sql, {
      token,
      userId: context.userId,
      businessName: data.payload.businessName.slice(0, 80),
      industry: data.payload.industry,
      payloadJson: JSON.stringify(data.payload),
      expiresAt: expires,
      redacted: data.redacted,
      passcodeSalt: passcodeSalt ?? null,
      passcodeHash: passcodeHash ?? null,
    });
    if (!stored) throw new ShareLimitError();
    return { token, expiresAt: expires };
  });

export const listMapShares = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    // Owner-triggered housekeeping: view logs are kept for a bounded period only.
    await purgeOldShareViews(sql).catch((error) =>
      console.error("Failed to purge old share views", error),
    );
    // Every live link, then the newest revoked or expired ones: a live link
    // that dropped off the list could not be revoked from the app.
    return listMapShareSummaries(sql, context.userId);
  });

export const revokeMapShare = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { token: string }) => ({ token: String(input.token).slice(0, 64) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await sql`
      update map_shares set revoked_at = now()
      where token = ${data.token} and user_id = ${context.userId}
    `;
    return { ok: true as const };
  });

/**
 * Public: anyone with the token can read a live, non-revoked, non-expired share.
 * POST so the passcode travels in the body, not in a URL that lands in access
 * logs and browser history.
 */
export const loadMapShare = createServerFn({ method: "POST" })
  .validator((input: { token: string; passcode?: string }) => ({
    token: String(input.token).slice(0, 64),
    passcode: input.passcode?.trim(),
  }))
  .handler(async ({ data }) => {
    if (!/^[a-f0-9]{24,64}$/.test(data.token))
      return { found: false as const, reason: "invalid" as const };
    const sql = await getSql();
    const rows = await sql<ShareRow>`
      select
        token, business_name, industry, payload, created_at, expires_at, revoked_at,
        redacted, passcode_salt, passcode_hash
      from map_shares
      where token = ${data.token}
    `;
    const row = rows[0];
    if (!row) return { found: false as const, reason: "missing" as const };
    if (row.revoked_at) return { found: false as const, reason: "revoked" as const };
    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now())
      return { found: false as const, reason: "expired" as const };
    const [{ createHash, scrypt, timingSafeEqual }, { requestIp }, { getRequest }] =
      await Promise.all([
        import("node:crypto"),
        import("@/lib/request-ip.server"),
        import("@tanstack/react-start/server"),
      ]);
    const ipHash = createHash("sha256")
      .update(`${row.token}:${requestIp()}`)
      .digest("hex")
      .slice(0, 32);
    if (row.passcode_hash) {
      if (!data.passcode) return { found: false as const, reason: "passcode" as const };
      // Two limits: the per-process limiter answers fast; the per-token count
      // in Postgres holds across instances and cold starts.
      const attempt = passcodeLimiter.take(requestIp());
      if (!attempt.allowed) return { found: false as const, reason: "rate_limited" as const };
      if (await passcodeLocked(sql, row.token))
        return { found: false as const, reason: "rate_limited" as const };
      const expected = Buffer.from(row.passcode_hash, "hex");
      // Asynchronous: a guess must not block the event loop for every other request.
      const actual = await new Promise<Buffer>((resolve, reject) =>
        scrypt(data.passcode as string, row.passcode_salt ?? "", expected.length, (err, key) =>
          err ? reject(err) : resolve(key),
        ),
      );
      if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
        await recordPasscodeFailure(sql, row.token, ipHash).catch((error) =>
          console.error("Failed to record a passcode failure", error),
        );
        return { found: false as const, reason: "passcode_wrong" as const };
      }
    }
    try {
      await sql`
        insert into map_share_views (token, ip_hash, user_agent)
        values (
          ${row.token},
          ${ipHash},
          ${getRequest()?.headers.get("user-agent")?.slice(0, 200) ?? null}
        )
      `;
    } catch (error) {
      console.error("Failed to record shared map view", error);
    }
    return {
      found: true as const,
      payload: row.payload,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      redacted: Boolean(row.redacted),
    };
  });
