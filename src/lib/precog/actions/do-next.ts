import { recommendedStepsForRules } from "../evidence";
import type { ControlId } from "../evidence/controls";
import type { IndustryId } from "../industry";
import { rankFirstSteps, UNIVERSAL_FIX } from "../coach/first-steps";
import type { AccessReconciliation } from "../firm/reconcile";
import { buildDriftActions, type DriftAction } from "../integrations/drift-signals";
import type { IntegrationDriftSummary } from "../integrations/drift-summary";
import { concentrationMove, type ConcentrationMove } from "../report/report-summary";
import type { DetectedConflict } from "../sod/detect";
import { ruleIdsOf } from "../sod/open-findings";
import { midSentence } from "../text";

/** The most ranked controls one list shows. */
export const DO_NEXT_STEPS_MAX = 6;

/** The most "books vs your duty assignments" items one list shows. */
export const DO_NEXT_DRIFT_MAX = 3;

/**
 * The split-one-duty-out step (evidence/controls), worded for a business
 * where no one person holds half the open conflicts. It names no duty: the
 * bank reconciliation may already sit with someone else, for example an
 * outside bookkeeper.
 */
export const SPLIT_STEP_WITHOUT_NAMED_ROLE =
  "Move one duty of a conflicting pair to someone who holds neither duty";

/** A control that answers open duty conflicts, with its rank inputs. */
export type DoNextStep = ReturnType<
  typeof rankFirstSteps<ReturnType<typeof recommendedStepsForRules>[number]>
>[number];

/**
 * One entry on the "Do these first" list: a control ranked against the open
 * duty conflicts, or a place where the books or an access export disagree
 * with the duty assignments.
 */
export type DoNextItem =
  | { kind: "step"; id: string; step: DoNextStep }
  | { kind: "drift"; id: string; action: DriftAction };

export interface DoNextInput {
  /** The open duty-conflict findings, as the report counts them (sod/open-findings). */
  open: readonly DetectedConflict[];
  /** The line of business, which words a step for a business with no owner. */
  industry: IndustryId;
  integrationDriftSummary: IntegrationDriftSummary | null | undefined;
  accessReconciliation: AccessReconciliation | null | undefined;
  /** Controls the owner said at setup already run here. */
  inPlace?: ReadonlySet<ControlId>;
  /** `concentrationMove(open)`, when the caller has already worked it out. */
  move?: ConcentrationMove | null;
}

/**
 * The universal step, "split one duty out", named for this business: the
 * person who holds half or more of the open conflicts, the one duty whose
 * move closes the most of them, and how many it closes of the open count
 * (report/report-summary `concentrationMove`, the move the report's summary
 * counts). With no such person it says which duty to move in general terms.
 * `move` is that move when the caller has already worked it out.
 */
export function splitStepLabel(
  open: readonly DetectedConflict[],
  move: ConcentrationMove | null = concentrationMove(open),
): string {
  if (!move) return SPLIT_STEP_WITHOUT_NAMED_ROLE;
  return `Move one duty, ${midSentence(move.dutyLabel)}, away from ${move.personName}: it closes ${move.closes} of the ${open.length} open duty conflicts`;
}

/**
 * The ranked controls for the open findings, built once for every list that
 * shows them (Start here's "Do these first", the printed report's steps and
 * the action plan): the catalog's steps for the findings' rules, less the
 * controls `skip` says already run, ranked by rankFirstSteps. The universal
 * step carries `splitStepLabel` in place of its catalog label ("the
 * concentrated role"), so every list words it the same. It is named after
 * ranking, so the order (whose last tie-break is the label) is the catalog's.
 * A caller that has already worked out `concentrationMove(open)` passes it as
 * `move`; otherwise it is worked out here when the universal step is listed.
 */
export function rankedFirstSteps(
  open: readonly DetectedConflict[],
  industry: IndustryId,
  skip?: (id: ControlId) => boolean,
  move?: ConcentrationMove | null,
): DoNextStep[] {
  const recommended = recommendedStepsForRules(ruleIdsOf(open), industry).filter(
    (step) => !skip?.(step.control.id),
  );
  return rankFirstSteps(recommended, open).map((step) =>
    step.control.id === UNIVERSAL_FIX
      ? { ...step, control: { ...step.control, label: splitStepLabel(open, move) } }
      : step,
  );
}

/**
 * The one "Do these first" list (decision 12 B): the controls ranked by
 * rankFirstSteps, then the drift items from buildDriftActions. The drift items
 * always come last, so a disagreement in the books never pushes a control
 * that answers an open conflict off the list. Pure: no React, no storage.
 */
export function doNextList({
  open,
  industry,
  integrationDriftSummary,
  accessReconciliation,
  inPlace,
  move,
}: DoNextInput): DoNextItem[] {
  const steps = rankedFirstSteps(open, industry, (id) => inPlace?.has(id) ?? false, move)
    .slice(0, DO_NEXT_STEPS_MAX)
    .map((step): DoNextItem => ({ kind: "step", id: step.control.id, step }));
  const drift = buildDriftActions({ summary: integrationDriftSummary, accessReconciliation })
    .slice(0, DO_NEXT_DRIFT_MAX)
    .map((action): DoNextItem => ({ kind: "drift", id: action.id, action }));
  return [...steps, ...drift];
}

/** The ranked controls on a list, in order. */
export function doNextSteps(items: readonly DoNextItem[]): DoNextStep[] {
  return items.flatMap((item) => (item.kind === "step" ? [item.step] : []));
}

/** The drift items on a list, in order. */
export function doNextDrift(items: readonly DoNextItem[]): DriftAction[] {
  return items.flatMap((item) => (item.kind === "drift" ? [item.action] : []));
}

/**
 * The step "Do these first" lists first (Start here's item 1), or null when
 * no control answers the open findings. The duty-conflict tab's "What to do
 * first" box leads with it, so the two screens name one first step.
 */
export function firstDoNextStep(input: DoNextInput): DoNextStep | null {
  return doNextSteps(doNextList(input))[0] ?? null;
}
