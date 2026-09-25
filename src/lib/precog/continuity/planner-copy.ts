import type { ItemCoverage, CoverageStatus } from "./coverage";
import type { Criticality, KnowledgeKind, KnowledgeLevel } from "../types";

/** Wording the continuity planner and its cards share. */
export const CRITICALITY_LABEL: Record<Criticality, string> = {
  critical: "Business stops without it",
  important: "Hurts within a week",
  "nice-to-have": "Can wait",
};

export const LEVEL_SHORT: Record<KnowledgeLevel, string> = {
  expert: "Expert",
  proficient: "Can do",
  basic: "Learning",
  aware: "Aware",
};

export const NOT_ASSESSED_HINT = "Fills in once someone is marked on an item.";

/**
 * Whether anyone is marked on the item at any level. Until then every
 * candidate ties on generic reasons, so the app names nobody to train.
 */
export function isMarked(row: ItemCoverage): boolean {
  return row.primaries.length + row.learners.length + row.aware.length > 0;
}

export const NOT_ASSESSED_PLAN =
  "Nobody is marked on the register yet, so there is nobody to name. Mark who can do each item above; the plan then names who to train and who should teach.";

export const NOT_ASSESSED_ABSENCE =
  "Not assessed yet: nobody is marked on the register, so the app cannot tell what stops when someone is out. Mark who can do each item above and this fills in.";

export const KIND_LABEL: Record<KnowledgeKind, string> = {
  duty: "Duty",
  task: "Task",
  knowledge: "Know-how",
};

export const STATUS_VARIANT: Record<CoverageStatus, "danger" | "warn" | "accent" | "ok"> = {
  uncovered: "danger",
  single: "danger",
  thin: "warn",
  covered: "ok",
};

/** Check-in tab for stale items nobody on the active team holds. */
export const UNHELD_VIEW = "__unheld__";

export const inputClass = "rounded-md border border-border bg-elevated px-2 py-1.5 text-sm text-fg";
