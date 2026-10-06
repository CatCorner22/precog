import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { invalidRequest, RequestError, requireObject } from "@/lib/request-errors";
import { requireBusinessOwner, requireBusinessRole, requireFirmRole } from "./access.server";
import { parseEngagementInput, RETENTION_REFUSAL, type EngagementStatus } from "./engagement-row";
import {
  loadClientFirm,
  loadEngagement,
  loadFirmRetention,
  loadReviewLog,
  saveEngagement as saveEngagementRow,
  saveFirmRetention as saveFirmRetentionRow,
  setEngagementStatus as setEngagementStatusRow,
} from "./engagement-store";
import { businessInput } from "./server-inputs";
import { recordAudit, recordAuditForBusiness } from "./audit.server";

/**
 * The engagement of one client business: scope, period, preparer, reviewer
 * and status, with the firm's retention period; the monthly review log only
 * when the archive asks for it. `firmClient` is false for a business with no
 * firm, which has no engagement to show.
 */
export const getEngagement = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { businessId?: string; withReviews?: boolean }) => {
    const raw = requireObject(input);
    return {
      businessId:
        raw.businessId === undefined
          ? null
          : businessInput({ businessId: raw.businessId as string }).businessId,
      withReviews: raw.withReviews === true,
    };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    // Without a business: the retention period of the caller's own firm, for
    // the firm settings (null when the caller owns no firm).
    if (data.businessId === null) {
      return {
        firmClient: false,
        engagement: null,
        retentionYears: await loadFirmRetention(sql, context.userId),
        reviews: null,
      };
    }
    const owner = await requireBusinessOwner(sql, context.userId, data.businessId);
    const [firm, engagement, reviews] = await Promise.all([
      loadClientFirm(sql, owner, data.businessId),
      loadEngagement(sql, owner, data.businessId),
      data.withReviews ? loadReviewLog(sql, owner, data.businessId) : Promise.resolve(null),
    ]);
    // The review log is read for the engagement archive download.
    if (data.withReviews) {
      await recordAuditForBusiness(sql, owner, data.businessId, {
        actorUserId: context.userId,
        event: "export_run",
        detail: { kind: "engagement_archive" },
      });
    }
    return {
      firmClient: firm !== null,
      engagement,
      retentionYears: firm?.retentionYears ?? null,
      reviews,
    };
  });

export const saveEngagement = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      businessId: string;
      scope: string;
      periodStart: string | null;
      periodEnd: string | null;
      preparerUserId: string | null;
      reviewerUserId: string | null;
    }) => ({ ...businessInput(input), ...parseEngagementInput(input) }),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const owner = await requireBusinessOwner(sql, context.userId, data.businessId);
    // The engagement is the firm's work: a granted business's own account,
    // outside the firm, reads it and does not change it (decision 26). Who
    // prepares and who reviews, the scope and the period that print on every
    // locked version are the firm owner's staffing decision, so a preparer
    // or reviewer reads them and does not change them (CPA-8).
    await requireBusinessRole(sql, context.userId, owner, data.businessId, ["owner"]);
    const { businessId, ...fields } = data;
    const engagement = await saveEngagementRow(sql, {
      ownerUserId: owner,
      businessId,
      actorUserId: context.userId,
      ...fields,
    });
    await recordAuditForBusiness(sql, owner, businessId, {
      actorUserId: context.userId,
      event: "engagement_saved",
    });
    return { engagement };
  });

/** Ends or reopens a client's engagement; the firm owner's alone. */
export const setEngagementStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { businessId: string; status: EngagementStatus }) => {
    const raw = requireObject(input);
    if (raw.status !== "active" && raw.status !== "ended") throw invalidRequest();
    return { ...businessInput(input), status: raw.status as EngagementStatus };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const owner = await requireBusinessOwner(sql, context.userId, data.businessId);
    // The store checks, under the engagement's locks, that the caller owns the
    // business's firm (or the business, when it has no firm).
    const { engagement, changed } = await setEngagementStatusRow(
      sql,
      owner,
      data.businessId,
      data.status,
      context.userId,
    );
    // Ending an ended engagement, or reopening an open one, changes nothing.
    const firm = changed ? await loadClientFirm(sql, owner, data.businessId) : null;
    if (firm) {
      await recordAudit(sql, {
        firmUserId: firm.firmUserId,
        actorUserId: context.userId,
        event: data.status === "ended" ? "engagement_ended" : "engagement_reopened",
        businessId: data.businessId,
      });
    }
    return { engagement };
  });

/** How long the firm keeps a deleted client's records; the firm owner's alone. */
export const saveFirmRetention = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { years: number }) => {
    const years = requireObject(input).years;
    if (typeof years !== "number" || !Number.isInteger(years)) {
      throw new RequestError(400, RETENTION_REFUSAL);
    }
    return { years };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const firm = await requireFirmRole(sql, context.userId, ["owner"]);
    const retentionYears = await saveFirmRetentionRow(sql, firm.firmUserId, data.years);
    await recordAudit(sql, {
      firmUserId: firm.firmUserId,
      actorUserId: context.userId,
      event: "retention_changed",
      detail: { years: retentionYears },
    });
    return { retentionYears };
  });
