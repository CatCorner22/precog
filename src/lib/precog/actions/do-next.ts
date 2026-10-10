import { recommendedStepsForRules } from "../evidence";
import type { ControlId } from "../evidence/controls";
import type { IndustryId } from "../industry";
import { CONTROL_DUTIES, rankFirstSteps, UNIVERSAL_FIX } from "../coach/first-steps";
import type { AccessReconciliation } from "../firm/reconcile";
import { buildDriftActions, type DriftAction } from "../integrations/drift-signals";
import type { IntegrationDriftSummary } from "../integrations/drift-summary";
import { concentrationMove, type ConcentrationMove } from "../report/report-summary";
import { chooseSplitSequence, type SplitAssignment } from "../sod/duty-split";
import { SEVERITY_RANK, type DetectedConflict } from "../sod/detect";
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

/** The split step when moving a duty onto anyone now on the team would not lower the open count. */
export const SPLIT_STEP_NO_RECIPIENT =
  "No one else on the team can take a duty from these pairs without holding the other side";

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

/** The team a duty split checks, so the named recipient does not already hold the other side. */
export interface DutySplitStaff {
  assignments: readonly SplitAssignment[];
  teamSize?: number;
}

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
  /** When set, the split step names the duty that lowers the open count, not only the person who holds half. */
  staff?: DutySplitStaff;
}

/**
 * The universal step, "split one duty out", named for this business. With the
 * team, the words are the move that lowers the open count once someone else
 * takes the duty (`chooseSplitSequence`). Without the team, they name the
 * person who holds half or more (`concentrationMove`). A two-move line appears
 * only when that pair closes more than the best single move. The count is a
 * count of duty pairs, not a chance of a loss.
 */
export function splitStepLabel(
  open: readonly DetectedConflict[],
  move: ConcentrationMove | null = concentrationMove(open),
  staff?: DutySplitStaff,
): string {
  if (staff) {
    const plan = chooseSplitSequence(open, staff.assignments, staff.teamSize);
    const chosen = plan?.first ?? null;
    if (plan?.pairBeatsSingle && plan.next && chosen && chosen.net > 0 && chosen.opened === 0) {
      const to = chosen.recipientName ? ` to ${chosen.recipientName}` : "";
      const nextTo = plan.next.recipientName ? ` to ${plan.next.recipientName}` : "";
      const total = chosen.net + plan.next.net;
      return `Move one duty, ${midSentence(chosen.dutyLabel)}, away from ${chosen.personName}${to}: it closes ${chosen.closed.length} of the ${open.length} open duty conflicts. Then move ${midSentence(plan.next.dutyLabel)} away from ${plan.next.personName}${nextTo}. The two moves close ${total} of the ${open.length}`;
    }
    if (chosen && chosen.net > 0 && chosen.opened === 0) {
      return `Move one duty, ${midSentence(chosen.dutyLabel)}, away from ${chosen.personName}: it closes ${chosen.closed.length} of the ${open.length} open duty conflicts`;
    }
    if (chosen && chosen.net > 0 && chosen.recipientName) {
      return `Move one duty, ${midSentence(chosen.dutyLabel)}, away from ${chosen.personName}: it closes ${chosen.closed.length} and opens ${chosen.opened} on ${chosen.recipientName}. The open count falls by ${chosen.net}.`;
    }
    if (chosen) return SPLIT_STEP_NO_RECIPIENT;
  }
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
  staff?: DutySplitStaff,
): DoNextStep[] {
  const recommended = recommendedStepsForRules(ruleIdsOf(open), industry).filter(
    (step) => !skip?.(step.control.id),
  );
  return rankFirstSteps(recommended, open).map((step) =>
    step.control.id === UNIVERSAL_FIX
      ? { ...step, control: { ...step.control, label: splitStepLabel(open, move, staff) } }
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
  staff,
}: DoNextInput): DoNextItem[] {
  const steps = rankedFirstSteps(open, industry, (id) => inPlace?.has(id) ?? false, move, staff)
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

/**
 * The open finding a step is named for on screen: of the open findings whose
 * duties the step's control watches (coach/first-steps `CONTROL_DUTIES`), the
 * one where it watches both duties, then the first in `open`'s order (most
 * severe first). A named split-duty step follows the concentration move
 * that named it, rather than an unrelated person's first finding.
 * Null when the step answers no open finding.
 */
export function stepFocus(
  step: Pick<DoNextStep, "control">,
  open: readonly DetectedConflict[],
  staff?: DutySplitStaff,
): DetectedConflict | null {
  if (
    step.control.id === UNIVERSAL_FIX &&
    step.control.label !== SPLIT_STEP_WITHOUT_NAMED_ROLE &&
    step.control.label !== SPLIT_STEP_NO_RECIPIENT
  ) {
    const chosen = staff
      ? chooseSplitSequence(open, staff.assignments, staff.teamSize)?.first
      : null;
    if (chosen && chosen.net > 0) {
      return chosen.closed.reduce((best, conflict) =>
        SEVERITY_RANK[conflict.severity] < SEVERITY_RANK[best.severity] ? conflict : best,
      );
    }
    return concentrationMove(open)?.closed[0] ?? null;
  }
  const duties = new Set(CONTROL_DUTIES[step.control.id]);
  const watched = (c: DetectedConflict) =>
    Number(duties.has(c.entitlementA)) + Number(duties.has(c.entitlementB));
  let best: DetectedConflict | null = null;
  for (const c of open) {
    if (watched(c) > (best ? watched(best) : 0)) best = c;
  }
  return best;
}

/**
 * The words the screens give a step from "Do these first", naming the person
 * and the two duties actually in conflict (`stepFocus`): Start here's item 1
 * and the duty-conflict tab's "What to do first" box both read it, so the two
 * name one first step for one person. The split step that already names its
 * person and duty keeps its words. Screens only: the printed report keeps the
 * step list's own words.
 */
export function stepLineOnScreen(
  step: DoNextStep,
  open: readonly DetectedConflict[],
  staff?: DutySplitStaff,
): string {
  const focus = stepFocus(step, open, staff);
  const namedSplit =
    step.control.id === UNIVERSAL_FIX &&
    step.control.label !== SPLIT_STEP_WITHOUT_NAMED_ROLE &&
    step.control.label !== SPLIT_STEP_NO_RECIPIENT;
  if (!focus || namedSplit) return step.control.label;
  const who = focus.personName;
  const holds = `${who} can both ${midSentence(focus.labelA)} and ${midSentence(focus.labelB)}`;
  const reconciles =
    focus.entitlementA === "bank_reconcile" || focus.entitlementB === "bank_reconcile";
  const what =
    step.control.id === UNIVERSAL_FIX
      ? "move one of the two duties to someone who holds neither"
      : step.control.id === "independent-bank-reconciliation" && reconciles
        ? `someone other than ${who} reconciles the account`
        : midSentence(step.control.label);
  return `${holds}: ${what}`;
}

/**
 * The first step on screen (`firstDoNextStep` in `stepLineOnScreen`'s words),
 * or null when no control answers the open findings.
 */
export function firstDoNextLine(input: DoNextInput): string | null {
  const step = firstDoNextStep(input);
  return step ? stepLineOnScreen(step, input.open, input.staff) : null;
}
