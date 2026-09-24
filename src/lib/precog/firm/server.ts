import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { RequestError, requireObject } from "@/lib/request-errors";
import { isBusinessId } from "../profile-input";
import type { FirmPlan } from "./pricing";
import {
  insertReviewEvent,
  listClientEngagements,
  listReviewEvents,
  loadFirm,
  saveFirm,
  upsertEngagementMark,
} from "./store";
import type { ReviewItemKey, ReviewResult } from "./reviews";

const PLANS = new Set<FirmPlan>(["assessment", "monthly"]);
const RESULTS = new Set<ReviewResult>(["done", "exception", "skipped"]);
const KEYS = new Set<ReviewItemKey>([
  "bank_statement",
  "cleared_checks",
  "payroll_headcount",
  "new_vendors",
]);

export const getFirm = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    return { firm: await loadFirm(sql, context.userId) };
  });

export const saveFirmProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { name: string; plan: FirmPlan }) => {
    const raw = requireObject(input);
    if (typeof raw.name !== "string" || !raw.name.trim()) {
      throw new RequestError(400, "The firm needs a name");
    }
    if (typeof raw.plan !== "string" || !PLANS.has(raw.plan as FirmPlan)) {
      throw new RequestError(400, "Unknown firm plan");
    }
    return { name: raw.name.trim().slice(0, 120), plan: raw.plan as FirmPlan };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    return { firm: await saveFirm(sql, context.userId, data.name, data.plan) };
  });

export const listFirmClients = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    return { clients: await listClientEngagements(sql, context.userId) };
  });

export const recordEngagement = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      businessId: string;
      startedAt?: string | null;
      mapCompletedAt?: string | null;
      reportSentAt?: string | null;
      openFindings: number;
      acceptedFindings: number;
    }) => {
      const raw = requireObject(input);
      if (!isBusinessId(raw.businessId)) throw new RequestError(400, "Unknown business id");
      const openFindings = Number(raw.openFindings);
      const acceptedFindings = Number(raw.acceptedFindings);
      if (!Number.isFinite(openFindings) || !Number.isFinite(acceptedFindings)) {
        throw new RequestError(400, "Finding counts must be numbers");
      }
      return {
        businessId: raw.businessId,
        startedAt: typeof raw.startedAt === "string" ? raw.startedAt : null,
        mapCompletedAt: typeof raw.mapCompletedAt === "string" ? raw.mapCompletedAt : null,
        reportSentAt: typeof raw.reportSentAt === "string" ? raw.reportSentAt : null,
        openFindings: Math.max(0, Math.round(openFindings)),
        acceptedFindings: Math.max(0, Math.round(acceptedFindings)),
      };
    },
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const owned = await sql<{ id: string }>`
      select id from businesses where user_id = ${context.userId} and id = ${data.businessId}
    `;
    if (!owned[0]) throw new RequestError(404, "That client is not on this account");
    await upsertEngagementMark(sql, context.userId, data);
    return { ok: true as const };
  });

export const recordMonthlyReview = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      businessId: string;
      period: string;
      itemKey: ReviewItemKey;
      ownerName: string;
      dueOn?: string | null;
      result: ReviewResult;
      notes?: string;
    }) => {
      const raw = requireObject(input);
      if (!isBusinessId(raw.businessId)) throw new RequestError(400, "Unknown business id");
      if (typeof raw.period !== "string" || !/^\d{4}-\d{2}$/.test(raw.period)) {
        throw new RequestError(400, "Period must be YYYY-MM");
      }
      if (typeof raw.itemKey !== "string" || !KEYS.has(raw.itemKey as ReviewItemKey)) {
        throw new RequestError(400, "Unknown review item");
      }
      if (typeof raw.result !== "string" || !RESULTS.has(raw.result as ReviewResult)) {
        throw new RequestError(400, "Unknown review result");
      }
      const dueOn =
        typeof raw.dueOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.dueOn) ? raw.dueOn : null;
      return {
        businessId: raw.businessId,
        period: raw.period,
        itemKey: raw.itemKey as ReviewItemKey,
        ownerName: typeof raw.ownerName === "string" ? raw.ownerName.trim().slice(0, 80) : "",
        dueOn,
        result: raw.result as ReviewResult,
        notes: typeof raw.notes === "string" ? raw.notes.trim().slice(0, 500) : "",
      };
    },
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const owned = await sql<{ id: string }>`
      select id from businesses where user_id = ${context.userId} and id = ${data.businessId}
    `;
    if (!owned[0]) throw new RequestError(404, "That client is not on this account");
    await insertReviewEvent(sql, context.userId, data);
    return { ok: true as const };
  });

export const listMonthlyReviews = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { businessId: string }) => {
    const raw = requireObject(input);
    if (!isBusinessId(raw.businessId)) throw new RequestError(400, "Unknown business id");
    return { businessId: raw.businessId };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    return { events: await listReviewEvents(sql, context.userId, data.businessId) };
  });
