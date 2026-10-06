import type { Sql } from "@/lib/db";
import { controlExecutionLogReady } from "@/lib/migration-status.server";
import { reportServerError } from "@/lib/observability/report.server";
import { clientErrorStatus } from "@/lib/request-errors";
import { DIFFERENT_CONTENT, type ControlExecution } from "./executions/model";
import { executeControlCommand, listControlExecutions } from "./executions/store";
import {
  bridgeEnabled,
  bridgeRecordCommand,
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
 *   differs from it (its note reads "Corrects the entry of <date>: now <result>.").
 */
export type MonthlyBridgeStatus = "recorded" | "corrected";

export interface MonthlyBridgeOutcome {
  /** True when this call wrote an entry (evidenceStatus says which kind). */
  evidenceBridged: boolean;
  /** "recorded" or "corrected" when an entry was written; null otherwise. */
  evidenceStatus: MonthlyBridgeStatus | null;
  /**
   * "bridge_disabled", "migration_pending", "already_recorded" (the latest
   * entry for this check and month already has this result), "bridge_failed"
   * (a failure of ours), or a refusal's message; null when nothing went wrong.
   */
  evidenceSkippedReason: string | null;
}

/** The log holds at most 5,000 checks a business and answers 20 a page. */
const MONTH_PAGE_LIMIT = 250;
/** Attempts when a concurrent save wrote the same next entry with another result. */
const ATTEMPTS = 3;

const notWritten = (reason: string | null): MonthlyBridgeOutcome => ({
  evidenceBridged: false,
  evidenceStatus: null,
  evidenceSkippedReason: reason,
});

/** The current (highest) entry of this check and month's monthly chain, if any. */
async function currentMonthlyEntry(
  sql: Sql,
  actorId: string,
  review: SavedMonthlyReview,
): Promise<{ run: ControlExecution; version: number } | null> {
  let current: { run: ControlExecution; version: number } | null = null;
  let cursor: string | null = null;
  for (let page = 0; page < MONTH_PAGE_LIMIT; page++) {
    const { entries, nextCursor } = await listControlExecutions(
      sql,
      actorId,
      review.businessId,
      review.period,
      cursor,
    );
    for (const run of entries) {
      const version = monthlyEntryVersion(run.id, review.period, review.itemKey);
      if (version !== null && (!current || version > current.version)) current = { run, version };
    }
    if (!nextCursor) break;
    cursor = nextCursor;
  }
  return current;
}

/** The result and day of the entry's recorded work, as the bridge wrote it. */
function recordedWork(run: ControlExecution) {
  const event = run.history.find((e) => e.command.action === "record");
  return event?.command.action === "record" ? event.command : null;
}

/**
 * Records a Done or Exception result in the control evidence log, dated
 * `today`, the day the owner recorded it. The review's due date only becomes
 * the exception's follow-up due date.
 *
 * The first result for a check and month writes the first entry. A later
 * result that differs from the latest entry writes a new entry that corrects
 * it ("corrected"); one that matches it writes nothing ("already_recorded").
 * So Done -> Exception -> Done writes three entries and the log ends on Done.
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
  if (review.result === "skipped") return notWritten(null);
  if (!bridgeEnabled()) return notWritten("bridge_disabled");
  const wanted = review.result === "exception" ? "exception" : "no_exception";
  try {
    if (!(await controlExecutionLogReady(sql))) return notWritten("migration_pending");
    for (let attempt = 1; ; attempt++) {
      const current = await currentMonthlyEntry(sql, actorId, review);
      const work = current ? recordedWork(current.run) : null;
      if (current && work?.result === wanted) return notWritten("already_recorded");
      const supersedes: SupersededEntry | undefined = current
        ? { runId: current.run.id, performedOn: work?.performedOn ?? today }
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
      if (!command) return notWritten(null);
      try {
        await executeControlCommand(sql, actorId, review.businessId, command);
      } catch (error) {
        // Another save wrote this same next entry with another result between
        // the read and the write: read the chain again and correct that entry.
        const refusal = error instanceof Error ? error.message : null;
        if (refusal === DIFFERENT_CONTENT && attempt < ATTEMPTS) continue;
        throw error;
      }
      return {
        evidenceBridged: true,
        evidenceStatus: current ? "corrected" : "recorded",
        evidenceSkippedReason: null,
      };
    }
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
