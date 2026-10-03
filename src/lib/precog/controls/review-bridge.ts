import { RequestError } from "@/lib/request-errors";
import { REVIEW_ITEMS, type ReviewItemKey, type ReviewResult } from "../firm/reviews";
import type { ExecutionCommand } from "./executions/model";

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

/**
 * Build a control execution **record** command from a monthly review result.
 * Returns null for a skipped result, which creates no evidence. The method is
 * inquiry: a monthly note is the owner saying the check was done.
 */
export function bridgeRecordCommand(input: MonthlyBridgeInput): ExecutionCommand | null {
  if (input.result === "skipped") return null;
  const item = REVIEW_ITEMS.find((r) => r.key === input.itemKey);
  if (!item) throw new RequestError(400, "Unknown review item");

  const scope = `${item.title}. ${item.why}`.slice(0, 1500);
  const note = (input.notes.trim() || `Monthly review (${input.result}).`).slice(0, 2000);
  // The record schema needs at least one reference. With no note, the one
  // reference says plainly that none was given, rather than reading like one.
  const refs = input.notes.trim() ? [input.notes.trim().slice(0, 400)] : [NO_EVIDENCE_REFERENCE];

  if (input.result === "exception") {
    const followUpOwner = (input.followUpOwner ?? input.ownerName).trim().slice(0, 120);
    const dueOn = input.followUpDueOn ?? input.dueOn;
    if (!followUpOwner || !dueOn) {
      throw new RequestError(
        400,
        "Name a follow-up owner and due date when recording an exception in the evidence log.",
      );
    }
    return {
      commandId: monthlyBridgeCommandId(input.period, input.itemKey),
      runId: executionRunId(input.period, input.itemKey),
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
    commandId: monthlyBridgeCommandId(input.period, input.itemKey),
    runId: executionRunId(input.period, input.itemKey),
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
