import { isMarked, STATUS_LABEL, type CoverageStatus, type ItemCoverage } from "./coverage";
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

/**
 * The coverage badge for one register row. Until someone is marked on it at
 * any level the row is not a gap yet, so it reads "Not marked yet" in a
 * neutral badge instead of "Nobody can do this alone".
 */
export function coverageBadge(row: ItemCoverage): {
  label: string;
  variant: (typeof STATUS_VARIANT)[CoverageStatus] | "default";
} {
  return isMarked(row)
    ? { label: STATUS_LABEL[row.status], variant: STATUS_VARIANT[row.status] }
    : { label: "Not marked yet", variant: "default" };
}

/** Check-in tab for stale items nobody on the active team holds. */
export const UNHELD_VIEW = "__unheld__";
