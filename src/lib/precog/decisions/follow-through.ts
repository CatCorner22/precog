import type { ContinuityStep, CoverageStatus, DocumentationState } from "../continuity/coverage";
import { coverageReport, documentationState } from "../continuity/coverage";
import type { DualReleasePolicy } from "../controls/dual-release";
import type { IndustryId } from "../industry";
import type {
  ContinuitySnapshot,
  DecisionEntry,
  DecisionReview,
  DecisionSnapshot,
} from "../practice-profile";
import { portfolioSummary } from "../scoring/residual-engine";
import { SCORING_VERSION } from "../scoring/weights";
import { detectSodConflicts, sodDetectionOptions } from "../sod/detect";
import type { IndustryTemplate } from "../templates/types";
import type { StaffComposition } from "../types";

export function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateAfter(date: Date, days: number): string {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return localDateKey(next);
}

/**
 * Whether a linked decision belongs to the template currently loaded. Industry
 * templates reuse item ids (k1, k2, …), so a decision logged under one industry
 * must not track an unrelated item after the user switches to another. Entries
 * logged before the industry was recorded are assumed to match.
 */
export function linkedToIndustry(
  d: Pick<DecisionEntry, "linkedIndustry">,
  industry: IndustryId,
): boolean {
  return !d.linkedIndustry || d.linkedIndustry === industry;
}

/** The register item a decision tracks, if it was logged from the continuity planner for this industry. */
export function linkedKnowledgeId(
  d: Pick<DecisionEntry, "linkedTab" | "linkedId" | "linkedIndustry">,
  industry: IndustryId,
): string | undefined {
  return d.linkedTab === "knowledge" && d.linkedId && linkedToIndustry(d, industry)
    ? d.linkedId
    : undefined;
}

/** The continuity step a knowledge-linked decision tracks; entries logged before steps existed were all coverage moves. */
export function linkedContinuityStep(d: Pick<DecisionEntry, "linkedStep">): ContinuityStep {
  return d.linkedStep ?? "cover";
}

/** Map key for "is this step on this item already in the Journal?" lookups. */
export function continuityStepKey(knowledgeId: string, step: ContinuityStep): string {
  return `${knowledgeId}\u0000${step}`;
}

export function captureContinuitySnapshot(
  tpl: IndustryTemplate,
  knowledgeId: string,
): ContinuitySnapshot {
  const report = coverageReport(tpl);
  const item = report.items.find((i) => i.item.id === knowledgeId);
  return {
    coverageIndex: report.coverageIndex,
    singlePoints: report.singlePoints.length,
    ...(item ? { itemStatus: item.status, itemDocumentation: documentationState(item.item) } : {}),
  };
}

export function captureDecisionSnapshot(
  tpl: IndustryTemplate,
  staff: StaffComposition,
  dualRelease: DualReleasePolicy,
  subject?: string,
  now: Date = new Date(),
  knowledgeId?: string,
): DecisionSnapshot {
  const portfolio = portfolioSummary(tpl, staff);
  const sod = detectSodConflicts(tpl, staff, sodDetectionOptions(tpl, dualRelease));
  const subjectScore =
    subject === undefined
      ? undefined
      : portfolio.all.find((score) => score.name === subject)?.residual;
  return {
    at: now.toISOString(),
    scoringVersion: SCORING_VERSION,
    averageResidual: portfolio.averageResidual,
    ...(subjectScore === undefined ? {} : { subjectResidual: subjectScore }),
    sodOpenConflicts: sod.summary.openWithoutAcceptance,
    segregationHealth: sod.summary.segregationHealth,
    ...(knowledgeId ? { continuity: captureContinuitySnapshot(tpl, knowledgeId) } : {}),
  };
}

export function isDecisionOpen(d: DecisionEntry): boolean {
  return d.status !== "closed";
}

const STATUS_RANK: Record<CoverageStatus, number> = {
  uncovered: 0,
  single: 1,
  thin: 2,
  covered: 3,
};

export interface CoverageSlip {
  decision: DecisionEntry;
  /** Coverage of the linked item when the decision was last closed as done. */
  from: CoverageStatus;
  /** Coverage of the same item on today's register. */
  to: CoverageStatus;
}

/**
 * Continuity decisions that were closed as done but whose register item has
 * since lost coverage (a backup left, was marked inactive, or was unassigned).
 * Decisions closed as "no longer relevant", still open, or whose item has been
 * deleted are not slips.
 */
export function coverageSlips(
  decisions: readonly DecisionEntry[],
  tpl: IndustryTemplate,
): CoverageSlip[] {
  const candidates: { decision: DecisionEntry; knowledgeId: string; from: CoverageStatus }[] = [];
  for (const decision of decisions) {
    const knowledgeId = linkedKnowledgeId(decision, tpl.id);
    if (isDecisionOpen(decision) || !knowledgeId) continue;
    const last = decision.reviews?.[decision.reviews.length - 1];
    const from = last?.outcome === "done" ? last.snapshot.continuity?.itemStatus : undefined;
    if (from) candidates.push({ decision, knowledgeId, from });
  }
  if (candidates.length === 0) return [];
  const statusNow = new Map(coverageReport(tpl).items.map((i) => [i.item.id, i.status]));
  const slips: CoverageSlip[] = [];
  for (const { decision, knowledgeId, from } of candidates) {
    const to = statusNow.get(knowledgeId);
    if (to !== undefined && STATUS_RANK[to] < STATUS_RANK[from]) slips.push({ decision, from, to });
  }
  return slips;
}

export function decisionsDue(
  decisions: readonly DecisionEntry[],
  now: Date,
  withinDays = 7,
): { overdue: DecisionEntry[]; dueSoon: DecisionEntry[] } {
  const today = localDateKey(now);
  const soonThrough = dateAfter(now, withinDays);
  const overdue: DecisionEntry[] = [];
  const dueSoon: DecisionEntry[] = [];
  for (const decision of decisions) {
    if (!isDecisionOpen(decision) || !decision.reviewBy) continue;
    if (decision.reviewBy < today) overdue.push(decision);
    else if (decision.reviewBy <= soonThrough) dueSoon.push(decision);
  }
  return { overdue, dueSoon };
}

export function applyDecisionReview(
  d: DecisionEntry,
  review: DecisionReview,
  extendDays = 90,
): DecisionEntry {
  const reviews = [...(d.reviews ?? []), review];
  if (review.outcome === "still_open") {
    return {
      ...d,
      reviews,
      reviewBy: dateAfter(new Date(review.at), extendDays),
      status: "open",
    };
  }
  return { ...d, reviews, status: "closed" };
}

export function decisionDelta(
  d: DecisionEntry,
  now: DecisionSnapshot,
): {
  subject?: number;
  average: number;
  sodOpen: number;
  segregation: number;
  comparable: boolean;
  continuity?: {
    coverageIndex: number;
    singlePoints: number;
    itemThen?: CoverageStatus;
    itemNow?: CoverageStatus;
    docsThen?: DocumentationState;
    docsNow?: DocumentationState;
  };
} | null {
  if (!d.snapshot) return null;
  const then = d.snapshot.continuity;
  const cont = now.continuity;
  return {
    ...(then && cont
      ? {
          continuity: {
            coverageIndex: cont.coverageIndex - then.coverageIndex,
            singlePoints: cont.singlePoints - then.singlePoints,
            ...(then.itemStatus ? { itemThen: then.itemStatus } : {}),
            ...(cont.itemStatus ? { itemNow: cont.itemStatus } : {}),
            ...(then.itemDocumentation ? { docsThen: then.itemDocumentation } : {}),
            ...(cont.itemDocumentation ? { docsNow: cont.itemDocumentation } : {}),
          },
        }
      : {}),
    ...(d.snapshot.subjectResidual === undefined || now.subjectResidual === undefined
      ? {}
      : { subject: now.subjectResidual - d.snapshot.subjectResidual }),
    average: now.averageResidual - d.snapshot.averageResidual,
    sodOpen: now.sodOpenConflicts - d.snapshot.sodOpenConflicts,
    segregation: now.segregationHealth - d.snapshot.segregationHealth,
    comparable: d.snapshot.scoringVersion === now.scoringVersion,
  };
}
