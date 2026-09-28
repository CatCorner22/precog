import type { IndustryTemplate } from "../templates";
import type { KnowledgeItem, Person } from "../types";
import {
  coverageReport,
  CRITICALITY_WEIGHT,
  STATUS_URGENCY,
  type CoverageStatus,
} from "./coverage";
import type { ContinuityStep } from "../decisions/follow-through";
import { firstName } from "../text";

/**
 * How far an item's know-how is written down: nothing, a procedure that exists
 * but nobody has said where it is, or a procedure a stand-in can actually find.
 */
export type DocumentationState = "none" | "unlocated" | "located";

export interface DocumentationGap {
  item: KnowledgeItem;
  state: Exclude<DocumentationState, "located">;
  step: Extract<ContinuityStep, "document" | "locate">;
  coverage: CoverageStatus;
  /** Who should write it: the person who can do it alone, else whoever has the basics. */
  author: Person | null;
  action: string;
  priority: number;
}

export interface DocumentationReport {
  /** Items with something missing, most urgent first. */
  gaps: DocumentationGap[];
  counts: Record<DocumentationState, number>;
  /** 0–100 share of criticality weight that is written and findable. */
  documentedIndex: number;
}

export const DOCUMENTATION_LABEL: Record<DocumentationState, string> = {
  none: "Nothing written down",
  unlocated: "Written, location not recorded",
  located: "Written and findable",
};

/** How far each state has got, from nothing written (0) to written and findable (2). */
export const DOCUMENTATION_RANK: Record<DocumentationState, number> = {
  none: 0,
  unlocated: 1,
  located: 2,
};

/**
 * Documentation debt — where the business's know-how lives only in someone's
 * head, or is written down somewhere nobody has recorded. Critical items come
 * first; within a criticality, unwritten items that stop in one absence come
 * before written-but-unlocated ones on well-covered items. A documented
 * procedure is what turns a thin backup into a usable one.
 */
export function documentationDebt(tpl: IndustryTemplate): DocumentationReport {
  const report = coverageReport(tpl);
  const counts: Record<DocumentationState, number> = { none: 0, unlocated: 0, located: 0 };
  let total = 0;
  let located = 0;
  const gaps: DocumentationGap[] = [];
  for (const i of report.items) {
    const state = documentationState(i.item);
    counts[state] += 1;
    const weight = CRITICALITY_WEIGHT[i.item.criticality];
    total += weight;
    if (state === "located") {
      located += weight;
      continue;
    }
    const author = i.primaries[0] ?? i.learners[0] ?? null;
    const urgency = DOCUMENTATION_RANK.located - DOCUMENTATION_RANK[state];
    const priority = weight * (STATUS_URGENCY[i.status] + 1) * urgency;
    let action: string;
    if (state === "none") {
      if (!author) {
        action = `Nobody can run "${i.item.name}" and nobody has written it down — find the last person who did it, or an outside provider, and get the steps on paper.`;
      } else if (i.status === "single" || i.status === "uncovered") {
        action = `Have ${author.name} write down "${i.item.name}" — it lives only in ${firstName(author.name)}'s head today.`;
      } else {
        action = `Have ${author.name} write down "${i.item.name}" so the stand-in follows the same steps.`;
      }
    } else {
      action = `Record where the written procedure for "${i.item.name}" lives (drive path, binder, link) so a stand-in can find it without ${author ? author.name : "asking around"}.`;
    }
    gaps.push({
      item: i.item,
      state,
      step: state === "none" ? "document" : "locate",
      coverage: i.status,
      author,
      action,
      priority,
    });
  }
  gaps.sort(
    (a, b) =>
      CRITICALITY_WEIGHT[b.item.criticality] - CRITICALITY_WEIGHT[a.item.criticality] ||
      b.priority - a.priority ||
      a.item.name.localeCompare(b.item.name),
  );
  return {
    gaps,
    counts,
    documentedIndex: total === 0 ? 100 : Math.round((located / total) * 100),
  };
}

/**
 * A procedure written on the Procedures tab is written and findable; so is a
 * procedure kept elsewhere whose location is recorded.
 */
export function documentationState(item: KnowledgeItem): DocumentationState {
  if (item.linkedProcedures?.length) return "located";
  if (!item.documented) return "none";
  return item.procedureLocation?.trim() ? "located" : "unlocated";
}

/**
 * Where a stand-in finds the steps, for text read by the assistant: the
 * procedure on the Procedures tab, else the recorded location, else null.
 */
export function procedureWhere(item: KnowledgeItem): string | null {
  const inApp = item.linkedProcedures?.[0];
  if (inApp) return `Procedures tab: "${inApp.title}"`;
  return item.documented ? item.procedureLocation?.trim() || null : null;
}

/** Something is written down for this item, in the app or elsewhere. */
export function isWritten(item: KnowledgeItem): boolean {
  return documentationState(item) !== "none";
}

/**
 * Where a stand-in finds the written procedure for an entry — the one thing
 * worth telling them on the morning someone calls in sick.
 */
export function procedurePointer(item: KnowledgeItem): string {
  const inApp = item.linkedProcedures?.[0];
  if (inApp) return `steps in Procedures: "${inApp.title}"`;
  if (!item.documented) return "nothing written down";
  const where = item.procedureLocation?.trim();
  return where ? `procedure at ${where}` : "written down, location not recorded";
}
