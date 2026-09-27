import type { IndustryTemplate } from "../templates";
import type { MapValidationIssue } from "../process-graph";
import type { ProcessNode } from "../types";
import { suggestControlForProcess, suggestOwnerForProcess } from "./quick-fix";

/**
 * The one mapping from a validation issue to the change its Fix button
 * makes. The Fix button, its health preview and "Fix all quick wins" all
 * read it, so what the preview shows is what the button applies.
 */
export interface QuickFix {
  patch: Partial<ProcessNode>;
  /** One line for the toast, e.g. "Ana Ruiz assigned to Payroll". */
  message: string;
}

/** Whether a validation issue has a one-click fix. */
export function isQuickFixable(issue: Pick<MapValidationIssue, "id" | "processId">): boolean {
  return Boolean(issue.processId && quickFixKind(issue.id));
}

/**
 * The fix for one issue on `process`, or null when there is nothing to
 * suggest. `processes` is the whole map, for picking an owner who is not
 * already overloaded.
 */
export function planQuickFix(
  issueId: string,
  process: ProcessNode,
  processes: ProcessNode[],
  tpl: IndustryTemplate,
): QuickFix | null {
  switch (quickFixKind(issueId)) {
    case "repair-links": {
      const processIds = new Set(processes.map((p) => p.id));
      const personIds = new Set(tpl.people.map((p) => p.id));
      return {
        patch: {
          dependencies: process.dependencies.filter((d) => processIds.has(d)),
          ownerPersonIds: (process.ownerPersonIds ?? []).filter((o) => personIds.has(o)),
        },
        message: `Removed broken references on ${process.name}`,
      };
    }
    case "add-owner": {
      const owner = suggestOwnerForProcess(tpl, process, processes, tpl.people);
      if (!owner) return null;
      return {
        patch: { ownerPersonIds: [...(process.ownerPersonIds ?? []), owner.id] },
        message: `${owner.name} assigned to ${process.name}`,
      };
    }
    case "add-control": {
      const control = suggestControlForProcess(process, tpl.controls);
      if (!control) return null;
      return {
        patch: { controlIds: [...process.controlIds, control.id] },
        message: `Mapped "${control.name}" to ${process.name}`,
      };
    }
    default:
      return null;
  }
}

/** The map with one fix applied, or null when the issue has none. */
export function applyQuickFix(
  issue: Pick<MapValidationIssue, "id" | "processId">,
  processes: ProcessNode[],
  tpl: IndustryTemplate,
): { next: ProcessNode[]; message: string } | null {
  const process = processes.find((p) => p.id === issue.processId);
  const fix = process && planQuickFix(issue.id, process, processes, tpl);
  if (!fix) return null;
  return {
    next: processes.map((p) => (p.id === process.id ? { ...p, ...fix.patch } : p)),
    message: fix.message,
  };
}

/**
 * Every quick fix applied in turn, each reading the map the previous one
 * left, as one new map (one undo step). `applied` counts the fixes that
 * changed something.
 */
export function applyQuickFixes(
  issues: readonly Pick<MapValidationIssue, "id" | "processId">[],
  processes: ProcessNode[],
  tpl: IndustryTemplate,
): { next: ProcessNode[]; applied: number } {
  let next = processes;
  let applied = 0;
  for (const issue of issues.filter(isQuickFixable)) {
    const result = applyQuickFix(issue, next, tpl);
    if (!result || sameProcesses(result.next, next)) continue;
    next = result.next;
    applied += 1;
  }
  return { next, applied };
}

type QuickFixKind = "repair-links" | "add-owner" | "add-control";

/**
 * Validation ids (process-validation.ts) carry the issue kind as a prefix.
 * The specific prefixes are tested before the general one: `owner-ref-` (an
 * owner not on the team) is repaired, while `owner-` (no owner) and
 * `owner-left-` (every owner has left) get a suggested owner.
 */
function quickFixKind(issueId: string): QuickFixKind | null {
  if (issueId.startsWith("owner-ref-") || issueId.startsWith("dep-")) return "repair-links";
  if (issueId.startsWith("owner-")) return "add-owner";
  if (issueId.startsWith("fraud-nocontrol-")) return "add-control";
  return null;
}

function sameProcesses(a: ProcessNode[], b: ProcessNode[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
