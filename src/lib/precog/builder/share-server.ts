import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { SlidingWindowLimiter } from "../llm/rate-limit";
import type { IndustryId } from "../industry";
import type { MapHealthReport } from "../process-graph";
import { validateSharePayload } from "./share-schema";

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

type ShareListRow = Pick<
  ShareRow,
  "token" | "business_name" | "industry" | "created_at" | "expires_at" | "revoked_at" | "redacted"
> & {
  has_passcode: boolean;
  views: number;
  last_viewed_at: string | null;
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
        passcode: passcode && passcode.length >= 4 && passcode.length <= 64 ? passcode : undefined,
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
    await sql`
      insert into map_shares (
        token, user_id, business_name, industry, payload, expires_at,
        redacted, passcode_salt, passcode_hash
      )
      values (
        ${token},
        ${context.userId},
        ${data.payload.businessName.slice(0, 80)},
        ${data.payload.industry},
        ${JSON.stringify(data.payload)}::jsonb,
        ${expires}::timestamptz,
        ${data.redacted},
        ${passcodeSalt ?? null},
        ${passcodeHash ?? null}
      )
    `;
    return { token, expiresAt: expires };
  });

export const listMapShares = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql<ShareListRow>`
      select
        token, business_name, industry, created_at, expires_at, revoked_at,
        redacted,
        passcode_hash is not null as has_passcode,
        (select count(*)::int from map_share_views v where v.token = map_shares.token) as views,
        (select max(viewed_at) from map_share_views v where v.token = map_shares.token) as last_viewed_at
      from map_shares
      where user_id = ${context.userId}
      order by created_at desc
      limit 20
    `;
    return rows.map((r) => ({
      token: r.token,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
      revoked: Boolean(r.revoked_at),
      redacted: Boolean(r.redacted),
      hasPasscode: Boolean(r.has_passcode),
      views: Number(r.views ?? 0),
      lastViewedAt: r.last_viewed_at ?? null,
    }));
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
    const [{ createHash, scryptSync, timingSafeEqual }, { requestIp }, { getRequest }] =
      await Promise.all([
        import("node:crypto"),
        import("@/lib/request-ip.server"),
        import("@tanstack/react-start/server"),
      ]);
    if (row.passcode_hash) {
      if (!data.passcode) return { found: false as const, reason: "passcode" as const };
      const attempt = passcodeLimiter.take(requestIp());
      if (!attempt.allowed) return { found: false as const, reason: "rate_limited" as const };
      const expected = Buffer.from(row.passcode_hash, "hex");
      const actual = scryptSync(data.passcode, row.passcode_salt ?? "", expected.length);
      if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
        return { found: false as const, reason: "passcode_wrong" as const };
      }
    }
    try {
      await sql`
        insert into map_share_views (token, ip_hash, user_agent)
        values (
          ${row.token},
          ${createHash("sha256").update(requestIp()).digest("hex").slice(0, 32)},
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
