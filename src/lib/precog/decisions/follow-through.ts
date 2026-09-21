import type { ContinuityStep, CoverageStatus, DocumentationState } from "../continuity/coverage";
import {
  coverageReport,
  documentationState,
  DOCUMENTATION_LABEL,
  DOCUMENTATION_RANK,
  STATUS_LABEL,
  STRONG_LEVELS,
} from "../continuity/coverage";
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
import type { KnowledgeItem, Person, StaffComposition } from "../types";

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

/**
 * Whether a knowledge-linked entry commits the owner to doing something about
 * the item. Steps logged from the register carry `linkedStep`; older register
 * entries were all "remediate". A Journal entry that merely accepts, monitors or
 * insures a knowledge risk is not a step in progress.
 */
export function isContinuityStepEntry(d: Pick<DecisionEntry, "kind" | "linkedStep">): boolean {
  return d.linkedStep !== undefined || d.kind === "remediate";
}

/** Map key for "is this step on this item already in the Journal?" lookups. */
export function continuityStepKey(knowledgeId: string, step: ContinuityStep): string {
  return `${knowledgeId}\u0000${step}`;
}

/** An open Journal entry that already commits the owner to a continuity step on a register item. */
export interface ContinuityCommitment {
  decision: DecisionEntry;
  item: KnowledgeItem;
  step: ContinuityStep;
  /** The person the step set out to develop, when the decision recorded one and they are still on the active team. */
  person: Person | null;
  reviewBy: string | null;
  /** True once the review date has passed without the entry being closed. */
  overdue: boolean;
}

/**
 * Open continuity decisions for items in this template, keyed by
 * `continuityStepKey`, so advice can say "already in progress" instead of
 * recommending the same step again. Closed entries, other industries' entries
 * and deleted items are left out; the first entry logged for a step wins.
 */
export function continuityCommitments(
  decisions: readonly DecisionEntry[],
  tpl: IndustryTemplate,
  today: string,
): Map<string, ContinuityCommitment> {
  const out = new Map<string, ContinuityCommitment>();
  const sorted = [...decisions].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const decision of sorted) {
    const knowledgeId = linkedKnowledgeId(decision, tpl.id);
    if (!knowledgeId || !isDecisionOpen(decision) || !isContinuityStepEntry(decision)) continue;
    const item = tpl.knowledge.find((k) => k.id === knowledgeId);
    if (!item) continue;
    const step = linkedContinuityStep(decision);
    const key = continuityStepKey(knowledgeId, step);
    if (out.has(key)) continue;
    const reviewBy = decision.reviewBy ?? null;
    out.set(key, {
      decision,
      item,
      step,
      person: tpl.people.find((p) => p.active && p.id === decision.linkedPersonId) ?? null,
      reviewBy,
      overdue: reviewBy !== null && reviewBy < today,
    });
  }
  return out;
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

export type ContinuitySlip =
  | {
      decision: DecisionEntry;
      step: "cover" | "handoff";
      measure: "coverage";
      from: CoverageStatus;
      to: CoverageStatus;
    }
  | {
      decision: DecisionEntry;
      step: "document" | "locate";
      measure: "documentation";
      from: DocumentationState;
      to: DocumentationState;
    };

/**
 * Continuity decisions that were closed as done but whose register item has
 * since lost coverage or documentation. Decisions closed as "no longer
 * relevant", still open, legacy documentation steps, or deleted items are not
 * slips.
 */
export function continuitySlips(
  decisions: readonly DecisionEntry[],
  tpl: IndustryTemplate,
): ContinuitySlip[] {
  const current = new Map(coverageReport(tpl).items.map((i) => [i.item.id, i]));
  const slips: ContinuitySlip[] = [];
  for (const decision of decisions) {
    const knowledgeId = linkedKnowledgeId(decision, tpl.id);
    if (isDecisionOpen(decision) || !knowledgeId) continue;
    const last = decision.reviews?.[decision.reviews.length - 1];
    if (last?.outcome !== "done") continue;
    const item = current.get(knowledgeId);
    if (!item) continue;
    const step = linkedContinuityStep(decision);
    if (step === "cover" || step === "handoff") {
      const from = last.snapshot.continuity?.itemStatus;
      if (from && STATUS_RANK[item.status] < STATUS_RANK[from]) {
        slips.push({ decision, step, measure: "coverage", from, to: item.status });
      }
      continue;
    }
    const from = last.snapshot.continuity?.itemDocumentation;
    if (from && DOCUMENTATION_RANK[documentationState(item.item)] < DOCUMENTATION_RANK[from]) {
      slips.push({
        decision,
        step,
        measure: "documentation",
        from,
        to: documentationState(item.item),
      });
    }
  }
  return slips;
}

export type RegisterCloseOut =
  | {
      step: "cover";
      item: KnowledgeItem;
      status: CoverageStatus;
      /** The person the decision set out to train, if still on the active team and not yet able to run it alone. */
      trainee: Person | null;
      /** Active people who cannot yet run it alone, best cross-training candidate first. */
      candidates: Person[];
    }
  | { step: "document" | "locate"; item: KnowledgeItem };

/**
 * What the register would still have to say for closing this decision as
 * "done" to be true. Null when the register already says it, when the decision
 * is not a register step (or is a temporary handoff), or when the item is gone.
 */
export function registerCloseOut(d: DecisionEntry, tpl: IndustryTemplate): RegisterCloseOut | null {
  const knowledgeId = linkedKnowledgeId(d, tpl.id);
  if (!knowledgeId) return null;
  const coverage = coverageReport(tpl).items.find((i) => i.item.id === knowledgeId);
  if (!coverage) return null;
  const step = linkedContinuityStep(d);
  if (step === "handoff") return null;
  if (step === "cover") {
    if (coverage.status === "covered") return null;
    const strong = new Set(
      tpl.relations
        .filter((r) => r.knowledgeId === knowledgeId && STRONG_LEVELS.has(r.level))
        .map((r) => r.personId),
    );
    const ranked = coverage.suggestedBackups.map((b) => b.person);
    const others = tpl.people.filter(
      (p) => p.active && !strong.has(p.id) && !ranked.some((r) => r.id === p.id),
    );
    const candidates = [...ranked, ...others];
    const trainee = candidates.find((p) => p.id === d.linkedPersonId) ?? null;
    return { step, item: coverage.item, status: coverage.status, trainee, candidates };
  }
  const docs = documentationState(coverage.item);
  if (docs === "located" || (step === "document" && docs === "unlocated")) return null;
  return { step, item: coverage.item };
}

/** Lower-case then/now wording for a coverage or documentation slip. */
export function slipLabels(s: ContinuitySlip): { from: string; to: string } {
  if (s.measure === "coverage") {
    return {
      from: STATUS_LABEL[s.from].toLowerCase(),
      to: STATUS_LABEL[s.to].toLowerCase(),
    };
  }
  return {
    from: DOCUMENTATION_LABEL[s.from].toLowerCase(),
    to: DOCUMENTATION_LABEL[s.to].toLowerCase(),
  };
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
