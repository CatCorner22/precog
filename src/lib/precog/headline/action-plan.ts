import { DO_NEXT_STEPS_MAX, rankedFirstSteps } from "../actions/do-next";
import { CONTROL_DUTIES, UNIVERSAL_FIX } from "../coach/first-steps";
import type { ControlDefinition, ControlId } from "../evidence";
import { industryHasOwner } from "../industry";
import { setupInPlaceControls } from "../onboarding/setup-answers";
import type { PracticeProfile } from "../practice-profile";
import { concentrationMove } from "../report/report-summary";
import type { DetectedConflict } from "../sod/detect";
import { openFindings } from "../sod/open-findings";
import { inOverseerWords } from "../sod/recommendations";
import { firstName, midSentence } from "../text";

/** Where a step on the plan comes from. */
export type ActionStepSource = "concentration" | "first-step" | "weekly";

/** How urgent a step is: the worst open conflict it answers. */
export type ActionStepTier = "critical" | "high" | "other";

/** One step on the ranked "Do this first" plan. */
export interface ActionStep {
  /** Who the step is about: the person whose duty moves, else the business's independent reader. */
  who: string;
  /** The step, in one line an owner can act on. */
  what: string;
  /** About how long the step takes to put in place, in minutes. */
  minutes: number;
  /** How many of the open duty conflicts (the one open count) the step answers. */
  closes: number;
  source: ActionStepSource;
  tier: ActionStepTier;
  /** The duty pairs (`pair:<rule id>`) and controls (`control:<id>`) the step stands for; no two steps share one. */
  keys: string[];
}

/** The parts of a weekly action the plan reads (weekly-actions/build). */
export interface PlanWeeklyAction {
  id: string;
  title: string;
  effort: "low" | "medium" | "high";
  /**
   * The duty pair the action splits. A split names everyone who holds the
   * pair; a hand-off also names the person (`personId`) and answers only
   * their finding on it.
   */
  ruleId?: string;
  personId?: string;
}

interface ActionPlanOptions {
  /** Rules dual release covers only above a threshold (sod/open-findings `partialDualReleaseCoverage`). */
  partial: ReadonlyMap<string, number>;
  /** The week's actions (weekly-actions/build `buildWeeklyActions`), already ranked. */
  weekly?: readonly PlanWeeklyAction[];
}

/** Minutes a duty move takes: telling two people and changing one permission. */
const MOVE_MINUTES = 60;

const SETUP_MINUTES: Record<ControlDefinition["setup"], number> = {
  minutes: 15,
  "an hour": 60,
  "a day": 480,
};

const EFFORT_MINUTES: Record<PlanWeeklyAction["effort"], number> = {
  low: 15,
  medium: 60,
  high: 240,
};

const DUAL_RELEASE: ControlId = "dual-release-above-threshold";

/** Weekly actions that put a catalog control in place, so the plan lists the control once. */
const WEEKLY_CONTROLS: Record<string, readonly ControlId[]> = {
  "bank-rec": ["owner-opens-bank-statement", "independent-bank-reconciliation"],
  "tornado-bank": ["owner-opens-bank-statement", "independent-bank-reconciliation"],
  "dual-control": ["dual-release-above-threshold"],
  "tornado-dual": ["dual-release-above-threshold"],
  "tornado-seg": [UNIVERSAL_FIX],
};

/**
 * Camera and premium-credit stacks lower an insurance quote, not the chance
 * one person acts alone, so they never sit on the plan.
 */
const EXCLUDED = /camera|premium.credit/i;

const TIER_RANK: Record<ActionStepTier, number> = { critical: 0, high: 1, other: 2 };
const SOURCE_RANK: Record<ActionStepSource, number> = {
  concentration: 0,
  "first-step": 1,
  weekly: 2,
};

/**
 * The one ranked "Do this first" plan, computed once for Start here, the
 * report and the coach. Steps come from the concentration move (one person
 * holding most of the open conflicts), the ranked controls that answer the
 * open conflicts (coach/first-steps, the list the sod/recommendations box
 * leads with), and the week's actions. Steps that answer a critical conflict
 * come before high ones, and those before the rest; within a tier the
 * concentration move leads, then the controls in rank order, then the week's
 * actions in theirs. A step that repeats a duty pair or a control already on
 * the plan is dropped.
 */
export function rankedActionPlan(
  profile: Pick<PracticeProfile, "industry" | "setupAnswers" | "dualRelease">,
  report: { conflicts: readonly DetectedConflict[] },
  options: ActionPlanOptions,
): ActionStep[] {
  const open = openFindings(report.conflicts, options.partial);
  const reader = inOverseerWords("Owner", industryHasOwner(profile.industry));
  const answered = (controls: readonly ControlId[]) => {
    const duties = new Set(controls.flatMap((id) => CONTROL_DUTIES[id] ?? []));
    return open.filter((c) => duties.has(c.entitlementA) || duties.has(c.entitlementB));
  };
  const candidates: ActionStep[] = [];

  const move = concentrationMove(open);
  if (move) {
    const first = firstName(move.personName);
    candidates.push({
      who: move.personName,
      what: `Move ${midSentence(move.dutyLabel)} from ${first} to someone who holds none of ${first}'s other duties`,
      minutes: MOVE_MINUTES,
      closes: move.closes,
      source: "concentration",
      tier: tierOf(move.closed),
      keys: [`control:${UNIVERSAL_FIX}`, ...move.ruleIds.map((id) => `pair:${id}`)],
    });
  }

  // A control the owner said at setup already runs, or dual release while it
  // is on, is not a step to take.
  const inPlace = setupInPlaceControls(profile.setupAnswers);
  const running = (id: ControlId) =>
    inPlace.has(id) || (id === DUAL_RELEASE && profile.dualRelease.enabled);
  const steps = rankedFirstSteps(open, profile.industry, running).slice(0, DO_NEXT_STEPS_MAX);
  for (const step of steps) {
    const hits = answered([step.control.id]);
    if (hits.length === 0) continue;
    candidates.push({
      who: reader,
      what: step.control.label,
      minutes: SETUP_MINUTES[step.control.setup],
      closes: hits.length,
      source: "first-step",
      tier: tierOf(hits),
      keys: [`control:${step.control.id}`],
    });
  }

  for (const action of options.weekly ?? []) {
    // A split ("sod-<rule>") or a hand-off on a hot process carries its pair,
    // so it shares the pair's key with the concentration move and ranks by the
    // pair's severity.
    const ruleId = action.ruleId ?? (action.id.startsWith("sod-") ? action.id.slice(4) : null);
    const controls = (WEEKLY_CONTROLS[action.id] ?? []).filter((id) => !running(id));
    if (WEEKLY_CONTROLS[action.id] && controls.length === 0) continue;
    const hits = ruleId
      ? open.filter(
          (c) => c.ruleId === ruleId && (!action.personId || c.personId === action.personId),
        )
      : answered(controls);
    // A pair with no open conflict left (dual release covers it at every amount) needs no split.
    if (ruleId && hits.length === 0) continue;
    candidates.push({
      // A hand-off is about the person whose duty moves, as the concentration move is.
      who: action.personId ? hits[0].personName : reader,
      what: action.title,
      minutes: EFFORT_MINUTES[action.effort],
      closes: hits.length,
      source: "weekly",
      tier: tierOf(hits),
      keys: ruleId
        ? [`pair:${ruleId}`]
        : controls.length
          ? controls.map((id) => `control:${id}`)
          : [`weekly:${action.id}`],
    });
  }

  const ranked = candidates
    .map((step, order) => ({ step, order }))
    .filter(({ step }) => !EXCLUDED.test(step.what) && !step.keys.some((k) => EXCLUDED.test(k)))
    .sort(
      (a, b) =>
        TIER_RANK[a.step.tier] - TIER_RANK[b.step.tier] ||
        SOURCE_RANK[a.step.source] - SOURCE_RANK[b.step.source] ||
        a.order - b.order,
    );
  const claimed = new Set<string>();
  const plan: ActionStep[] = [];
  for (const { step } of ranked) {
    if (step.keys.some((k) => claimed.has(k))) continue;
    for (const k of step.keys) claimed.add(k);
    plan.push(step);
  }
  return plan;
}

/** The worst open conflict among those a step answers. */
function tierOf(hits: readonly Pick<DetectedConflict, "severity">[]): ActionStepTier {
  if (hits.some((c) => c.severity === "critical")) return "critical";
  if (hits.some((c) => c.severity === "high")) return "high";
  return "other";
}
