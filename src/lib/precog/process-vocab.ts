import type { ProcessBlock } from "./builder/process-blocks";
import type { LeanWasteKind, ProcessIdea, ProcessRisk, ProcessRiskKind } from "./types";

/**
 * The words the app shows for a process's risks, ideas and waste, one label
 * per stored value. Each list is read from its label record, so a new value
 * cannot be added to the type without a label, and every list stays complete.
 */
export const RISK_KIND_LABEL: Record<ProcessRiskKind, string> = {
  fraud: "Fraud",
  control: "Control gap",
  continuity: "Continuity",
  compliance: "Compliance",
  quality: "Quality",
  revenue: "Revenue",
  safety: "Safety",
};
export const RISK_KINDS = keysOf(RISK_KIND_LABEL);

export const IDEA_CATEGORY_LABEL: Record<ProcessIdea["category"], string> = {
  control: "Control",
  lean: "Lean",
  tech: "Technology",
  training: "Training",
  policy: "Policy",
};
export const IDEA_CATEGORIES = keysOf(IDEA_CATEGORY_LABEL);

/** Effort and impact share one low / medium / high scale. */
export const LEVEL_LABEL: Record<ProcessIdea["effort"], string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};
export const LEVELS = keysOf(LEVEL_LABEL);

export const IDEA_STATUS_LABEL: Record<ProcessIdea["status"], string> = {
  backlog: "Backlog",
  exploring: "Exploring",
  planned: "Planned",
  done: "Done",
};
export const IDEA_STATUSES = keysOf(IDEA_STATUS_LABEL);

export const WASTE_KIND_LABEL: Record<LeanWasteKind, string> = {
  muda_waiting: "Waiting",
  muda_rework: "Rework",
  muda_motion: "Motion",
  muda_overprocessing: "Over-processing",
  mura: "Unevenness (mura)",
  muri: "Overburden (muri)",
};
export const WASTE_KINDS = keysOf(WASTE_KIND_LABEL);

export const BLOCK_CATEGORY_LABEL: Record<ProcessBlock["category"], string> = {
  cash: "Cash",
  vendor: "Vendors",
  payroll: "Payroll",
  revenue: "Revenue",
  ops: "Operations",
  compliance: "Compliance",
};

/** Severity and likelihood run from 1 to 5. */
export const RISK_SCALE_STEPS = [1, 2, 3, 4, 5] as const;

/** "Revenue · severity 3 of 5 · likelihood 4 of 5": a risk's kind and scores in words. */
export function riskSummary(risk: Pick<ProcessRisk, "kind" | "severity" | "likelihood">): string {
  return `${RISK_KIND_LABEL[risk.kind]} · severity ${risk.severity} of 5 · likelihood ${risk.likelihood} of 5`;
}

/** "Technology · low effort · high impact": an idea's category and sizing in words. */
export function ideaSummary(idea: Pick<ProcessIdea, "category" | "effort" | "impact">): string {
  return `${IDEA_CATEGORY_LABEL[idea.category]} · ${LEVEL_LABEL[idea.effort].toLowerCase()} effort · ${LEVEL_LABEL[idea.impact].toLowerCase()} impact`;
}

function keysOf<K extends string>(record: Record<K, string>): readonly K[] {
  return Object.keys(record) as K[];
}
