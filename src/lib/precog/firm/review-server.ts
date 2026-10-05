import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { requireObject } from "@/lib/request-errors";
import { requireBusinessRole, requireReportVersion } from "./access.server";
import { assertEngagementOpen } from "./engagement-store";
import { requestReportVersionReview, returnReportVersion } from "./reports";
import { idInput } from "./server-inputs";
import { recordAuditForBusiness } from "./audit.server";

/**
 * Request and return on a locked version. The preparer, or the firm owner,
 * asks for review; a firm owner or reviewer who did not prepare it returns it
 * with a note. Both need a role in the business's own firm (a business its
 * owner shared with a firm is the firm's work, not the owner's), and both
 * are refused on an ended engagement.
 */
export const requestReportReview = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(idInput)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const where = await requireReportVersion(sql, context.userId, data.id);
    await requireBusinessRole(sql, context.userId, where.ownerUserId, where.businessId, "any");
    await assertEngagementOpen(sql, where.ownerUserId, where.businessId, context.userId);
    const version = await requestReportVersionReview(sql, {
      ownerUserId: where.ownerUserId,
      id: data.id,
      requestedBy: context.userId,
    });
    await recordAuditForBusiness(sql, where.ownerUserId, where.businessId, {
      actorUserId: context.userId,
      event: "version_review_requested",
      subjectUserId: version.reviewRequestedFrom,
      detail: { versionId: data.id, versionNo: version.versionNo },
    });
    return { version };
  });

export const returnReport = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; note: string }) => {
    const raw = requireObject(input);
    // The store refuses an empty or over-long note with its own words.
    return { ...idInput(input), note: typeof raw.note === "string" ? raw.note.slice(0, 2000) : "" };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const where = await requireReportVersion(sql, context.userId, data.id);
    await requireBusinessRole(sql, context.userId, where.ownerUserId, where.businessId, [
      "owner",
      "reviewer",
    ]);
    await assertEngagementOpen(sql, where.ownerUserId, where.businessId, context.userId);
    const version = await returnReportVersion(sql, {
      ownerUserId: where.ownerUserId,
      id: data.id,
      returnedBy: context.userId,
      note: data.note,
    });
    // The note itself stays on the version.
    await recordAuditForBusiness(sql, where.ownerUserId, where.businessId, {
      actorUserId: context.userId,
      event: "version_returned",
      subjectUserId: version.preparedBy,
      detail: { versionId: data.id, versionNo: version.versionNo },
    });
    return { version };
  });
