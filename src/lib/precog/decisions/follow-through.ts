import type { CoverageStatus } from "../continuity/coverage";
import { coverageReport } from "../continuity/coverage";
import type { DualReleasePolicy } from "../controls/dual-release";
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

/** The register item a decision tracks, if it was logged from the continuity planner. */
export function linkedKnowledgeId(
  d: Pick<DecisionEntry, "linkedTab" | "linkedId">,
): string | undefined {
  return d.linkedTab === "knowledge" && d.linkedId ? d.linkedId : undefined;
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
    ...(item ? { itemStatus: item.status } : {}),
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
    const knowledgeId = linkedKnowledgeId(decision);
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
