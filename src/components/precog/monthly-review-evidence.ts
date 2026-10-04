import type { ControlExecution, ExecutionStatus } from "@/lib/precog/controls/executions/model";
import { executionRunId } from "@/lib/precog/controls/review-bridge";
import type { ReviewItemKey } from "@/lib/precog/firm/reviews";

/** The evidence log's state, in the short words the monthly review prints beside a result. */
export const EVIDENCE_STATUS_LABEL: Record<ExecutionStatus, string> = {
  awaiting_review: "Awaiting review",
  needs_correction: "Needs correction",
  awaiting_retest: "Awaiting retest",
  reviewed: "Reviewed",
};

/** Each evidence-log run of a month by its id, for `evidenceLogLine`. */
export function evidenceStatuses(
  entries: readonly Pick<ControlExecution, "id" | "status">[],
): Map<string, ExecutionStatus> {
  return new Map(entries.map((e) => [e.id, e.status]));
}

/**
 * "Evidence log: {status}" for the run the monthly result of this check and
 * month went into, or null when the log holds no such run (or was not read).
 */
export function evidenceLogLine(
  statuses: ReadonlyMap<string, ExecutionStatus> | null,
  period: string,
  itemKey: ReviewItemKey,
): string | null {
  const status = statuses?.get(executionRunId(period, itemKey));
  return status ? `Evidence log: ${EVIDENCE_STATUS_LABEL[status]}` : null;
}
