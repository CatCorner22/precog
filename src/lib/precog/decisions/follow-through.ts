import type { DualReleasePolicy } from "../controls/dual-release";
import type { DecisionEntry, DecisionReview, DecisionSnapshot } from "../practice-profile";
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

export function captureDecisionSnapshot(
  tpl: IndustryTemplate,
  staff: StaffComposition,
  dualRelease: DualReleasePolicy,
  subject?: string,
  now: Date = new Date(),
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
  };
}

export function isDecisionOpen(d: DecisionEntry): boolean {
  return d.status !== "closed";
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
} | null {
  if (!d.snapshot) return null;
  return {
    ...(d.snapshot.subjectResidual === undefined || now.subjectResidual === undefined
      ? {}
      : { subject: now.subjectResidual - d.snapshot.subjectResidual }),
    average: now.averageResidual - d.snapshot.averageResidual,
    sodOpen: now.sodOpenConflicts - d.snapshot.sodOpenConflicts,
    segregation: now.segregationHealth - d.snapshot.segregationHealth,
    comparable: d.snapshot.scoringVersion === now.scoringVersion,
  };
}
