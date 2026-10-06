import { RequestError } from "@/lib/request-errors";
import { formatDay } from "../dates";
import { RESULT_LABEL, REVIEW_ITEMS, type ReviewItemKey, type ReviewResult } from "../firm/reviews";
import type { ControlExecution, ExecutionCommand } from "./executions/model";

export interface MonthlyBridgeInput {
  businessId: string;
  period: string;
  itemKey: ReviewItemKey;
  ownerName: string;
  dueOn: string;
  result: ReviewResult;
  notes: string;
  performedOn: string;
  baseRevision: number;
  followUpOwner?: string;
  followUpDueOn?: string;
  /**
   * The latest evidence entry this check and month already holds, when this
   * result differs from it: the new entry corrects that one (see
   * `supersedingRunId`). Absent for the first entry.
   */
  supersedes?: SupersededEntry;
}

/** The evidence entry a later monthly result corrects. */
export interface SupersededEntry {
  /** Its run id: `executionRunId` or an earlier `supersedingRunId`. */
  runId: string;
  /** The day its result was recorded ("YYYY-MM-DD"). */
  performedOn: string;
}

/** The single evidence reference a bridged record carries when the monthly result has no note. */
export const NO_EVIDENCE_REFERENCE = "No evidence reference given";

/** Default on; set VITE_EVIDENCE_BRIDGE=false to disable server bridging during rollout. */
export function bridgeEnabled(): boolean {
  if (typeof process !== "undefined" && process.env.VITE_EVIDENCE_BRIDGE === "false") {
    return false;
  }
  if (typeof import.meta !== "undefined" && import.meta.env?.VITE_EVIDENCE_BRIDGE === "false") {
    return false;
  }
  return true;
}

export function executionRunId(period: string, itemKey: ReviewItemKey): string {
  return `${period}-${itemKey}`.slice(0, 80);
}

export function monthlyBridgeCommandId(period: string, itemKey: ReviewItemKey): string {
  return `monthly-bridge-${period}-${itemKey}`.slice(0, 80);
}

/*
 * One check and month can hold a chain of monthly evidence entries. The first
 * has the run id `executionRunId(period, itemKey)`; each later one corrects the
 * entry before it and has the id `${first}-v${n}`, n = 2, 3, and so on. The id
 * of an entry depends only on the id of the entry it supersedes, never on the
 * result, so a retried correction is idempotent and Done -> Exception -> Done
 * writes three entries that end on Done. The log lists a month newest first,
 * so the first entry of a chain met in that order is the current one.
 *
 * A check changed to Skipped after it has an entry withdraws that entry: the
 * next entry records an exception whose note says the check was withdrawn as
 * skipped, and whose command id starts with WITHDRAWAL_COMMAND, so
 * `monthlyEntryResult` reads it back as Skipped. Done -> Skipped -> Done
 * writes three entries that end on Done.
 */

/** The start of a bridged entry's command id; the rest is its run id. */
const RECORD_COMMAND = "monthly-bridge";
/** The start of the command id of an entry that withdraws a check changed to Skipped. */
const WITHDRAWAL_COMMAND = "monthly-withdraw";

/** What a withdrawal's note adds to "Corrects the entry of <date>: now Skipped." */
const WITHDRAWAL_NOTE =
  "This entry withdraws the check as skipped, and the log holds it as an exception until someone does the check.";

/**
 * The position of `runId` in the monthly chain of this check and month: 1 for
 * the first entry, n for `${first}-v${n}`; null for any other run (for
 * example, a check someone recorded in the Control evidence panel).
 */
export function monthlyEntryVersion(
  runId: string,
  period: string,
  itemKey: ReviewItemKey,
): number | null {
  const first = executionRunId(period, itemKey);
  if (runId === first) return 1;
  const match = /^-v([1-9][0-9]{0,5})$/.exec(runId.slice(first.length));
  if (!runId.startsWith(first) || !match) return null;
  const version = Number(match[1]);
  return version >= 2 ? version : null;
}

/**
 * The first entry's run id for any entry of a monthly chain, so a screen can
 * find "the evidence entry of this check and month" whichever entry is
 * current. Any other run id comes back unchanged.
 */
export function monthlyChainRunId(runId: string): string {
  const match = /^(.+)-v([1-9][0-9]{0,5})$/.exec(runId);
  return match && Number(match[2]) >= 2 ? match[1] : runId;
}

/**
 * The run id of the entry that corrects `supersededRunId`, the current entry
 * of this check and month's chain. Throws a 400 for a run outside the chain.
 */
export function supersedingRunId(
  period: string,
  itemKey: ReviewItemKey,
  supersededRunId: string,
): string {
  const version = monthlyEntryVersion(supersededRunId, period, itemKey);
  if (version === null)
    throw new RequestError(400, "That entry is not this check's monthly entry.");
  return `${executionRunId(period, itemKey)}-v${version + 1}`;
}

/**
 * "Corrects the entry of Apr 15, 2026: now Exception."; for Skipped, followed
 * by WITHDRAWAL_NOTE.
 */
export function correctionNote(supersededOn: string, result: ReviewResult): string {
  const note = `Corrects the entry of ${formatDay(supersededOn)}: now ${RESULT_LABEL[result]}.`;
  return result === "skipped" ? `${note} ${WITHDRAWAL_NOTE}` : note;
}

/**
 * The monthly result an entry of a check's chain stands for, read from its
 * recorded work: Done for no exception, Exception for an exception, Skipped
 * for an entry that withdrew the check; null for a run with no recorded work.
 */
export function monthlyEntryResult(run: Pick<ControlExecution, "history">): ReviewResult | null {
  const work = run.history.find((e) => e.command.action === "record")?.command;
  if (work?.action !== "record") return null;
  if (work.commandId.startsWith(`${WITHDRAWAL_COMMAND}-`)) return "skipped";
  return work.result === "exception" ? "exception" : "done";
}

/**
 * Build a control execution **record** command from a monthly review result.
 * The method is inquiry: a monthly note is the owner saying the check was
 * done. A Skipped result creates no evidence of its own (null), except to
 * withdraw the entry it supersedes: that entry is an exception, since the
 * check is no longer done for the month.
 */
export function bridgeRecordCommand(input: MonthlyBridgeInput): ExecutionCommand | null {
  if (input.result === "skipped" && !input.supersedes) return null;
  const item = REVIEW_ITEMS.find((r) => r.key === input.itemKey);
  if (!item) throw new RequestError(400, "Unknown review item");

  const scope = `${item.title}. ${item.why}`.slice(0, 1500);
  const correction = input.supersedes
    ? correctionNote(input.supersedes.performedOn, input.result)
    : null;
  const note = (
    correction
      ? `${correction}${input.notes.trim() ? ` ${input.notes.trim()}` : ""}`
      : input.notes.trim() || `Monthly review (${input.result}).`
  ).slice(0, 2000);
  const runId = input.supersedes
    ? supersedingRunId(input.period, input.itemKey, input.supersedes.runId)
    : executionRunId(input.period, input.itemKey);
  // The command id follows the run id, so a retry of the same entry is idempotent.
  const commandId =
    `${input.result === "skipped" ? WITHDRAWAL_COMMAND : RECORD_COMMAND}-${runId}`.slice(0, 80);
  // The record schema needs at least one reference. With no note, the one
  // reference says plainly that none was given, rather than reading like one.
  const refs = input.notes.trim() ? [input.notes.trim().slice(0, 400)] : [NO_EVIDENCE_REFERENCE];

  if (input.result === "exception" || input.result === "skipped") {
    const followUpOwner = (input.followUpOwner ?? input.ownerName).trim().slice(0, 120);
    const dueOn = input.followUpDueOn ?? input.dueOn;
    if (!followUpOwner || !dueOn) {
      throw new RequestError(
        400,
        "Name a follow-up owner and due date when recording an exception in the evidence log.",
      );
    }
    return {
      commandId,
      runId,
      action: "record",
      baseRevision: 0,
      controlKey: input.itemKey,
      period: input.period,
      performedOn: input.performedOn,
      performedBy: input.ownerName.trim().slice(0, 120) || "Unknown",
      method: "inquiry",
      scope,
      evidenceRefs: refs,
      result: "exception",
      note,
      followUpOwner,
      dueOn,
    };
  }

  return {
    commandId,
    runId,
    action: "record",
    baseRevision: 0,
    controlKey: input.itemKey,
    period: input.period,
    performedOn: input.performedOn,
    performedBy: input.ownerName.trim().slice(0, 120) || "Unknown",
    method: "inquiry",
    scope,
    evidenceRefs: refs,
    result: "no_exception",
    note,
  };
}
