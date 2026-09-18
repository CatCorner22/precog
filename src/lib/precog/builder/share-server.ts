import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import type { IndustryId } from "../industry";
import type { MapHealthReport } from "../process-graph";

/** Frozen, self-contained view of a map for the public share page. */
export interface SharedMapPayload {
  version: 1;
  businessName: string;
  industry: IndustryId;
  industryLabel: string;
  teamLabel: string;
  generatedAt: string;
  health: Pick<MapHealthReport, "score" | "bandLabel" | "summary" | "dimensions" | "processCount" | "avgHeat" | "hotProcesses">;
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
};

function makeToken(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const createMapShare = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { payload: SharedMapPayload; expiresInDays?: number }) => ({
    payload: input.payload,
    expiresInDays: Math.min(365, Math.max(1, Number(input.expiresInDays) || 30)),
  }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const token = makeToken();
    const expires = new Date(Date.now() + data.expiresInDays * 86_400_000).toISOString();
    await sql`
      insert into map_shares (token, user_id, business_name, industry, payload, expires_at)
      values (
        ${token},
        ${context.userId},
        ${data.payload.businessName.slice(0, 80)},
        ${data.payload.industry},
        ${JSON.stringify(data.payload)}::jsonb,
        ${expires}::timestamptz
      )
    `;
    return { token, expiresAt: expires };
  });

export const listMapShares = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql<Omit<ShareRow, "payload">>`
      select token, business_name, industry, created_at, expires_at, revoked_at
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

/** Public: anyone with the token can read a live, non-revoked, non-expired share. */
export const loadMapShare = createServerFn({ method: "GET" })
  .validator((input: { token: string }) => ({ token: String(input.token).slice(0, 64) }))
  .handler(async ({ data }) => {
    if (!/^[a-f0-9]{24,64}$/.test(data.token)) return { found: false as const, reason: "invalid" as const };
    const sql = await getSql();
    const rows = await sql<ShareRow>`
      select token, business_name, industry, payload, created_at, expires_at, revoked_at
      from map_shares
      where token = ${data.token}
    `;
    const row = rows[0];
    if (!row) return { found: false as const, reason: "missing" as const };
    if (row.revoked_at) return { found: false as const, reason: "revoked" as const };
    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now())
      return { found: false as const, reason: "expired" as const };
    return {
      found: true as const,
      payload: row.payload,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    };
  });
