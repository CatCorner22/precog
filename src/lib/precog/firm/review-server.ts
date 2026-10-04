import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { requireObject } from "@/lib/request-errors";
import { requireFirmRole, requireReportVersion } from "./access.server";
import { assertEngagementOpen } from "./engagement-store";
import { requestReportVersionReview, returnReportVersion } from "./reports";
import { idInput } from "./server-inputs";

/**
 * Request and return on a locked version. The preparer, or the firm owner,
 * asks for review; a firm owner or reviewer who did not prepare it returns it
 * with a note. Both are refused on an ended engagement.
 */
export const requestReportReview = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(idInput)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const where = await requireReportVersion(sql, context.userId, data.id);
    await assertEngagementOpen(sql, where.ownerUserId, where.businessId, context.userId);
    const version = await requestReportVersionReview(sql, {
      ownerUserId: where.ownerUserId,
      id: data.id,
      requestedBy: context.userId,
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
    await requireFirmRole(sql, context.userId, ["owner", "reviewer"]);
    await assertEngagementOpen(sql, where.ownerUserId, where.businessId, context.userId);
    const version = await returnReportVersion(sql, {
      ownerUserId: where.ownerUserId,
      id: data.id,
      returnedBy: context.userId,
      note: data.note,
    });
    return { version };
  });
