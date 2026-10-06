import type { Sql } from "@/lib/db";
import { controlExecutionLogReady } from "@/lib/migration-status.server";
import { reportServerError } from "@/lib/observability/report.server";
import { clientErrorStatus, RequestError } from "@/lib/request-errors";
import { inTransaction } from "@/lib/sql-transaction";
import { resolveBusinessOwner } from "../business-store";
import { lockEngagementWriteAccess } from "../firm/engagement-store";
import { isReviewResult, type ReviewResult } from "../firm/reviews";
import type { ControlExecution } from "./executions/model";
import { executeControlCommand, listControlExecutionChain } from "./executions/store";
import {
  bridgeEnabled,
  bridgeRecordCommand,
  executionRunId,
  monthlyEntryResult,
  monthlyEntryVersion,
  type MonthlyBridgeInput,
  type SupersededEntry,
} from "./review-bridge";

/** A monthly review result as recordMonthlyReview saved it. */
export type SavedMonthlyReview = Pick<
  MonthlyBridgeInput,
  "businessId" | "period" | "itemKey" | "ownerName" | "result" | "notes"
> & { dueOn: string | null };

/**
 * What the bridge wrote to the control evidence log:
 * - "recorded": the first entry for this check and month;
 * - "corrected": a new entry that corrects the latest one, because this result
 *   differs from it (its note reads "Corrects the entry of <date>: now <result>.");
 * - "withdrawn": a new entry that withdraws the latest one, because the check
 *   is now Skipped (its note says the entry withdraws the check as skipped).
 */
export type MonthlyBridgeStatus = "recorded" | "corrected" | "withdrawn";

export interface MonthlyBridgeOutcome {
  /** True when this call wrote an entry (evidenceStatus says which kind). */
  evidenceBridged: boolean;
  /** "recorded", "corrected" or "withdrawn" when an entry was written; null otherwise. */
  evidenceStatus: MonthlyBridgeStatus | null;
  /**
   * "bridge_disabled", "migration_pending", "already_recorded" (the latest
   * entry for this check and month already stands for this result),
   * "superseded" (a later save replaced this result in the monthly log; that
   * save's own bridge writes its entry), "bridge_failed" (a failure of ours),
   * or a refusal's message; null when nothing went wrong, including a Skipped
   * check with no entry to withdraw.
   */
  evidenceSkippedReason: string | null;
}

const notWritten = (reason: string | null): MonthlyBridgeOutcome => ({
  evidenceBridged: false,
  evidenceStatus: null,
  evidenceSkippedReason: reason,
});

/** The latest result the monthly log holds for this check and month, in the order it reads them. */
async function latestStoredResult(
  tx: Sql,
  ownerUserId: string,
  review: SavedMonthlyReview,
): Promise<ReviewResult | null> {
  const [row] = await tx<{ result: string }>`
    select result from review_events
    where user_id = ${ownerUserId} and business_id = ${review.businessId}
      and period = ${review.period} and item_key = ${review.itemKey}
    order by recorded_at desc, id desc
    limit 1
  `;
  return row && isReviewResult(row.result) ? row.result : null;
}

/** The current (highest) entry of this check and month's monthly chain, read in one query. */
async function currentMonthlyEntry(
  tx: Sql,
  actorId: string,
  review: SavedMonthlyReview,
): Promise<{ run: ControlExecution; version: number } | null> {
  const runs = await listControlExecutionChain(
    tx,
    actorId,
    review.businessId,
    review.period,
    executionRunId(review.period, review.itemKey),
  );
  let current: { run: ControlExecution; version: number } | null = null;
  for (const run of runs) {
    const version = monthlyEntryVersion(run.id, review.period, review.itemKey);
    if (version !== null && (!current || version > current.version)) current = { run, version };
  }
  return current;
}

/** The day of the entry's recorded work, as the bridge wrote it. */
function recordedOn(run: ControlExecution): string | null {
  const event = run.history.find((e) => e.command.action === "record");
  return event?.command.action === "record" ? event.command.performedOn : null;
}

/**
 * Brings the control evidence log to the monthly log's latest result for
 * this check and month, dated `today`, the day the owner recorded it. The
 * review's due date only becomes an exception's follow-up due date.
 *
 * The first Done or Exception writes the first entry. A later result that
 * differs from the latest entry writes a new entry that corrects it
 * ("corrected"), and Skipped writes one that withdraws it ("withdrawn"); a
 * result the latest entry already stands for writes nothing
 * ("already_recorded"). So Done -> Exception -> Done and Done -> Skipped ->
 * Done each write three entries that end on Done.
 *
 * It decides from the latest result stored in the monthly log, under the
 * business's lock, which every monthly save and every evidence write takes
 * first: no other save changes either log between its read and its write. A
 * result that a later save already replaced writes nothing ("superseded"):
 * that save's own bridge, which runs after it is stored, writes its entry.
 *
 * A failure never undoes the monthly review itself and never throws; it is
 * returned as the reason, and anything but a 409 refusal is reported.
 */
export async function bridgeMonthlyReview(
  sql: Sql,
  actorId: string,
  review: SavedMonthlyReview,
  today: string,
): Promise<MonthlyBridgeOutcome> {
  if (!bridgeEnabled()) return notWritten("bridge_disabled");
  try {
    if (!(await controlExecutionLogReady(sql))) return notWritten("migration_pending");
    return await inTransaction(sql, async (tx) => {
      const owner = await resolveBusinessOwner(tx, actorId, review.businessId);
      if (!owner) throw new RequestError(404, "That client is not on this account");
      await lockEngagementWriteAccess(tx, owner, review.businessId, actorId);
      const latest = await latestStoredResult(tx, owner, review);
      if (latest !== review.result) return notWritten(latest ? "superseded" : null);
      const current = await currentMonthlyEntry(tx, actorId, review);
      if (current && monthlyEntryResult(current.run) === review.result) {
        return notWritten("already_recorded");
      }
      const supersedes: SupersededEntry | undefined = current
        ? { runId: current.run.id, performedOn: recordedOn(current.run) ?? today }
        : undefined;
      const command = bridgeRecordCommand({
        ...review,
        dueOn: review.dueOn ?? today,
        performedOn: today,
        baseRevision: 0,
        followUpOwner: review.ownerName,
        followUpDueOn: review.dueOn ?? today,
        supersedes,
      });
      // A Skipped check with no entry to withdraw.
      if (!command) return notWritten(null);
      await executeControlCommand(tx, actorId, review.businessId, command);
      const status: MonthlyBridgeStatus = !current
        ? "recorded"
        : review.result === "skipped"
          ? "withdrawn"
          : "corrected";
      return { evidenceBridged: true, evidenceStatus: status, evidenceSkippedReason: null };
    });
  } catch (error) {
    const status = clientErrorStatus(error);
    // A 409 is an expected refusal (a concurrent change, a full log), not a
    // failure of ours. A 400 means the bridge built a bad command.
    if (status !== 409) await reportServerError(error, "monthly-review-bridge");
    // Only a refusal's message is meant for the owner.
    const refusal = status !== null && error instanceof Error ? error.message : null;
    return notWritten(refusal?.slice(0, 200) ?? "bridge_failed");
  }
}
