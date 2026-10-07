import { isMarked, STATUS_LABEL, type CoverageStatus, type ItemCoverage } from "./coverage";
import { joinWithAnd } from "../text";
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

export const NOT_ASSESSED_HINT = "Fills in once you mark someone on an item.";

export const NOT_ASSESSED_PLAN =
  "The register does not mark anyone yet, so there is nobody to name. Mark who can do each item above; the plan then names the trainee and the trainer.";

export const NOT_ASSESSED_ABSENCE =
  "Not assessed yet: the register does not mark anyone, so Precog cannot tell what stops when someone is out. Mark who can do each item above and this fills in.";

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

/**
 * The "Leaving the team" card's line when nobody on the team has a last day
 * recorded. `leftNames` are the people who left whose access checklist is
 * open on the same card (`leaverAccessNames`); the line does not say "nobody"
 * over them, and names nobody whose checklist is not on screen.
 */
export function noNoticeText(leftNames: readonly string[]): string {
  const advice =
    "When someone gives notice, record the date here rather than removing them. The printed report and Pioneer count down to it and chase the hand-off.";
  if (leftNames.length === 0) return `Nobody has given notice. ${advice}`;
  return `Nobody still on the team has given notice. ${joinWithAnd(leftNames)} left; check their access above. ${advice}`;
}
