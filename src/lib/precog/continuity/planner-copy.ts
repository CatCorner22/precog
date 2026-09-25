import type { ItemCoverage } from "./coverage";
import type { Criticality, KnowledgeLevel } from "../types";

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
