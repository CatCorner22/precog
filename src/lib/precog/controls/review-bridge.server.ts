import type { Sql } from "@/lib/db";
import { controlExecutionLogReady } from "@/lib/migration-status.server";
import { reportServerError } from "@/lib/observability/report.server";
import { clientErrorStatus } from "@/lib/request-errors";
import { DIFFERENT_CONTENT } from "./executions/model";
import { executeControlCommand } from "./executions/store";
import { bridgeEnabled, bridgeRecordCommand, type MonthlyBridgeInput } from "./review-bridge";

/** A monthly review result as recordMonthlyReview saved it. */
export type SavedMonthlyReview = Pick<
  MonthlyBridgeInput,
  "businessId" | "period" | "itemKey" | "ownerName" | "result" | "notes"
> & { dueOn: string | null };

export interface MonthlyBridgeOutcome {
  evidenceBridged: boolean;
  /**
   * "bridge_disabled", "migration_pending", "already_recorded" (the log holds an
   * earlier result for this check and month), "bridge_failed" (a failure of
   * ours), or a refusal's message; null when nothing went wrong.
   */
  evidenceSkippedReason: string | null;
}

/**
 * Records a Done or Exception result in the control evidence log, dated
 * `today`, the day the owner recorded it. The review's due date only becomes
 * the exception's follow-up due date. A failure never undoes the monthly
 * review itself and never throws; it is returned as the reason, and anything
 * but a 409 refusal is reported.
 */
export async function bridgeMonthlyReview(
  sql: Sql,
  actorId: string,
  review: SavedMonthlyReview,
  today: string,
): Promise<MonthlyBridgeOutcome> {
  if (review.result === "skipped") return { evidenceBridged: false, evidenceSkippedReason: null };
  if (!bridgeEnabled()) return { evidenceBridged: false, evidenceSkippedReason: "bridge_disabled" };
  try {
    if (!(await controlExecutionLogReady(sql)))
      return { evidenceBridged: false, evidenceSkippedReason: "migration_pending" };
    const command = bridgeRecordCommand({
      ...review,
      dueOn: review.dueOn ?? today,
      performedOn: today,
      baseRevision: 0,
      followUpOwner: review.ownerName,
      followUpDueOn: review.dueOn ?? today,
    });
    if (!command) return { evidenceBridged: false, evidenceSkippedReason: null };
    await executeControlCommand(sql, actorId, review.businessId, command);
    return { evidenceBridged: true, evidenceSkippedReason: null };
  } catch (error) {
    const status = clientErrorStatus(error);
    // A 409 is an expected refusal (an earlier result, a concurrent change, a full
    // log), not a failure of ours. A 400 means the bridge built a bad command.
    if (status !== 409) await reportServerError(error, "monthly-review-bridge");
    // Only a refusal's message is meant for the owner.
    const refusal = status !== null && error instanceof Error ? error.message : null;
    return {
      evidenceBridged: false,
      evidenceSkippedReason:
        refusal === DIFFERENT_CONTENT
          ? "already_recorded"
          : (refusal?.slice(0, 200) ?? "bridge_failed"),
    };
  }
}
