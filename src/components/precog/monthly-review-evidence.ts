import type { ControlExecution, ExecutionStatus } from "@/lib/precog/controls/executions/model";
import { executionRunId, monthlyChainRunId } from "@/lib/precog/controls/review-bridge";
import type { ReviewItemKey } from "@/lib/precog/firm/reviews";

/** The evidence log's state, in the short words the monthly review prints beside a result. */
export const EVIDENCE_STATUS_LABEL: Record<ExecutionStatus, string> = {
  awaiting_review: "Awaiting review",
  needs_correction: "Needs correction",
  awaiting_retest: "Awaiting retest",
  reviewed: "Reviewed",
};

/**
 * The most pages the monthly review reads from one month's evidence log: the
 * log holds at most 5,000 checks for a business and answers 20 a page
 * (`controls/executions/store.ts`), so this never stops short of a real
 * log's end; it only bounds a log position that never runs out.
 */
export const EVIDENCE_PAGE_LIMIT = 250;

/** Each evidence-log run of a month by its id, for `evidenceLogLine`. */
export function evidenceStatuses(
  entries: readonly Pick<ControlExecution, "id" | "status">[],
): Map<string, ExecutionStatus> {
  return new Map(entries.map((e) => [e.id, e.status]));
}

/** One page of a month's evidence log, as `getControlExecutionLog` answers it. */
export interface EvidencePage {
  entries: readonly Pick<ControlExecution, "id" | "status">[];
  nextCursor: string | null;
}

/**
 * The state of each monthly run (`runIds`) the month's evidence log holds.
 * The log answers newest first, 20 a page, so a monthly run recorded early
 * in a busy month sits past page one: this follows the log position until
 * every run is found or the log ends. A later result that corrects a run
 * writes a new entry in its chain (`supersedingRunId`); newest first, the
 * first entry met of a chain is the current one, and its state is kept
 * under the first run's id. Null when `cancelled()` turns true between
 * pages (the screen moved on), so nothing stale is shown.
 */
export async function readMonthlyEvidence(
  readPage: (cursor: string | null) => Promise<EvidencePage>,
  runIds: readonly string[],
  cancelled: () => boolean = () => false,
): Promise<Map<string, ExecutionStatus> | null> {
  const wanted = new Set(runIds);
  const found = new Map<string, ExecutionStatus>();
  let cursor: string | null = null;
  for (let page = 0; page < EVIDENCE_PAGE_LIMIT; page++) {
    const { entries, nextCursor }: EvidencePage = await readPage(cursor);
    if (cancelled()) return null;
    for (const entry of entries) {
      const run = monthlyChainRunId(entry.id);
      if (wanted.has(run) && !found.has(run)) found.set(run, entry.status);
    }
    if (found.size === wanted.size || !nextCursor) break;
    cursor = nextCursor;
  }
  return found;
}

/** The evidence-log run ids of a month's checks, in the order given. */
export function monthlyRunIds(period: string, itemKeys: readonly ReviewItemKey[]): string[] {
  return itemKeys.map((key) => executionRunId(period, key));
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

/** The "Who did this check" choice that asks for a name not on the team. */
export const SOMEONE_ELSE = "__someone_else__";

/** One check's "Who did this check": a team member's name, or SOMEONE_ELSE with `other` typed. */
export interface WhoPick {
  choice: string;
  other: string;
}
