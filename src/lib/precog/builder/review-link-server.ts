import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import type { PracticeProfile } from "../practice-profile";
import type { EvidenceFrequency } from "../types";
import { getIndustryTemplate } from "../templates";
import type { IndustryId } from "../industry";

export interface CheckinRecord {
  id: string;
  processId: string;
  evidenceId: string;
  doneAt: string;
  byName: string;
  note: string | null;
}

/** What a reviewer sees: just the evidence checklist, never the map internals. */
export interface ReviewerView {
  businessName: string;
  label: string;
  expiresAt: string | null;
  items: {
    processId: string;
    processName: string;
    evidenceId: string;
    label: string;
    frequency: EvidenceFrequency;
    reviewer?: string;
    /** Latest of owner lastDoneAt and any check-in. */
    lastDoneAt: string | null;
    lastBy: string | null;
  }[];
}

type LinkRow = {
  token: string;
  user_id: string;
  business_id: string;
  label: string;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
};

type CheckinRow = {
  id: string;
  process_id: string;
  evidence_id: string;
  done_at: string;
  by_name: string;
  note: string | null;
};

function makeToken(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function makeId(): string {
  return `ci_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function liveLink(token: string): Promise<LinkRow | null> {
  if (!/^[a-f0-9]{24,64}$/.test(token)) return null;
  const sql = await getSql();
  const rows = await sql<LinkRow>`
    select token, user_id, business_id, label, created_at, expires_at, revoked_at
    from review_links where token = ${token}
  `;
  const row = rows[0];
  if (!row || row.revoked_at) return null;
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return null;
  return row;
}

export const createReviewLink = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { businessId: string; label?: string; expiresInDays?: number }) => ({
    businessId: String(input.businessId).slice(0, 64),
    label: String(input.label ?? "Reviewer").trim().slice(0, 60) || "Reviewer",
    expiresInDays: Math.min(365, Math.max(1, Number(input.expiresInDays) || 90)),
  }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const token = makeToken();
    const expires = new Date(Date.now() + data.expiresInDays * 86_400_000).toISOString();
    await sql`
      insert into review_links (token, user_id, business_id, label, expires_at)
      values (${token}, ${context.userId}, ${data.businessId}, ${data.label}, ${expires}::timestamptz)
    `;
    return { token, expiresAt: expires };
  });

export const listReviewLinks = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { businessId: string }) => ({ businessId: String(input.businessId).slice(0, 64) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const rows = await sql<LinkRow>`
      select token, user_id, business_id, label, created_at, expires_at, revoked_at
      from review_links
      where user_id = ${context.userId} and business_id = ${data.businessId}
      order by created_at desc limit 20
    `;
    return rows.map((r) => ({
      token: r.token,
      label: r.label,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
      revoked: Boolean(r.revoked_at),
    }));
  });

export const revokeReviewLink = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { token: string }) => ({ token: String(input.token).slice(0, 64) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await sql`update review_links set revoked_at = now() where token = ${data.token} and user_id = ${context.userId}`;
    return { ok: true as const };
  });

/** Owner: check-ins recorded for a business (newest first). */
export const listCheckins = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { businessId: string }) => ({ businessId: String(input.businessId).slice(0, 64) }))
  .handler(async ({ context, data }): Promise<CheckinRecord[]> => {
    const sql = await getSql();
    const rows = await sql<CheckinRow>`
      select id, process_id, evidence_id, done_at, by_name, note
      from evidence_checkins
      where user_id = ${context.userId} and business_id = ${data.businessId}
      order by done_at desc limit 500
    `;
    return rows.map((r) => ({
      id: r.id,
      processId: r.process_id,
      evidenceId: r.evidence_id,
      doneAt: r.done_at,
      byName: r.by_name,
      note: r.note,
    }));
  });

/** Public: the reviewer's checklist for a live link. */
export const loadReviewerView = createServerFn({ method: "GET" })
  .validator((input: { token: string }) => ({ token: String(input.token).slice(0, 64) }))
  .handler(async ({ data }): Promise<{ found: false; reason: string } | { found: true; view: ReviewerView }> => {
    const link = await liveLink(data.token);
    if (!link) return { found: false, reason: "unavailable" };
    const sql = await getSql();
    const biz = await sql<{ name: string; industry: string; profile: PracticeProfile }>`
      select name, industry, profile from businesses where id = ${link.business_id} and user_id = ${link.user_id}
    `;
    const row = biz[0];
    if (!row) return { found: false, reason: "missing" };
    const processes =
      row.profile.customProcesses ?? getIndustryTemplate((row.industry as IndustryId) || "general").processes;
    const people = row.profile.customPeople ?? getIndustryTemplate((row.industry as IndustryId) || "general").people;
    const checkins = await sql<CheckinRow>`
      select id, process_id, evidence_id, done_at, by_name, note
      from evidence_checkins
      where user_id = ${link.user_id} and business_id = ${link.business_id}
      order by done_at desc
    `;
    const latest = new Map<string, CheckinRow>();
    for (const c of checkins) {
      const k = `${c.process_id}::${c.evidence_id}`;
      if (!latest.has(k)) latest.set(k, c);
    }
    const items: ReviewerView["items"] = [];
    for (const p of processes) {
      for (const e of p.evidence ?? []) {
        const c = latest.get(`${p.id}::${e.id}`);
        const ownerTs = e.lastDoneAt ? new Date(e.lastDoneAt).getTime() : 0;
        const ciTs = c ? new Date(c.done_at).getTime() : 0;
        const useCi = ciTs > ownerTs;
        items.push({
          processId: p.id,
          processName: p.name,
          evidenceId: e.id,
          label: e.label,
          frequency: e.frequency,
          reviewer: e.reviewerPersonId ? people.find((x) => x.id === e.reviewerPersonId)?.name : undefined,
          lastDoneAt: useCi ? c!.done_at : e.lastDoneAt ?? null,
          lastBy: useCi ? c!.by_name : e.lastDoneAt ? "Owner" : null,
        });
      }
    }
    return {
      found: true,
      view: { businessName: row.name, label: link.label, expiresAt: link.expires_at, items },
    };
  });

/** Public: record a completed review via a live link. */
export const submitCheckin = createServerFn({ method: "POST" })
  .validator((input: { token: string; processId: string; evidenceId: string; byName?: string; note?: string }) => ({
    token: String(input.token).slice(0, 64),
    processId: String(input.processId).slice(0, 80),
    evidenceId: String(input.evidenceId).slice(0, 80),
    byName: String(input.byName ?? "").trim().slice(0, 60),
    note: String(input.note ?? "").trim().slice(0, 300),
  }))
  .handler(async ({ data }) => {
    const link = await liveLink(data.token);
    if (!link) return { ok: false as const, reason: "unavailable" as const };
    const sql = await getSql();
    const doneAt = new Date().toISOString();
    await sql`
      insert into evidence_checkins (id, user_id, business_id, process_id, evidence_id, done_at, by_name, note, token)
      values (
        ${makeId()}, ${link.user_id}, ${link.business_id}, ${data.processId}, ${data.evidenceId},
        ${doneAt}::timestamptz, ${data.byName || link.label}, ${data.note || null}, ${link.token}
      )
    `;
    return { ok: true as const, doneAt, byName: data.byName || link.label };
  });
