/**
 * A scenario's rank on the residual index and the priority list, from two
 * levels rather than from its dollar or day figures. Those figures are
 * illustrative examples, not sized to any business, so changing one never
 * moves a scenario's rank.
 *
 * Each owner answer reaches a level once: controls through the likelihood
 * model's likelihood and severity multipliers, and staffing conditions that
 * are not control answers (team size, items one person holds, segregation
 * score, tenure) through the likelihood level. Dual release reaches the levels
 * of fraud scenarios only: it guards against someone moving money, so a
 * departure ranks the same with it, although the scenario page still applies
 * it to that departure's illustrative loss and days.
 */
import { clamp } from "../number";
import type { StaffComposition } from "../types";
import { scenarioFlags } from "./scenario-kind";
import { DEFAULT_WEIGHTS, type ScoringWeights } from "./weights";

/** The label every scenario dollar and day figure carries. */
export const ILLUSTRATIVE_LABEL = "Illustrative example, not sized to your business";

type StaffFactorKey = Exclude<keyof ScoringWeights["scenarioStaff"], "timelineReliefShare">;

/**
 * The staffing conditions that scale a scenario. `controlAnswer` marks dual
 * release and bank reconciliation: the scenario page applies them to its
 * illustrative loss and days, and the levels below read them through the
 * likelihood model instead, so each answer counts once on the index.
 */
export const STAFF_CONDITIONS: readonly {
  key: StaffFactorKey;
  controlAnswer: boolean;
  applies: (staff: StaffComposition) => boolean;
}[] = [
  { key: "smallTeamFactor", controlAnswer: false, applies: (s) => s.teamSize <= 6 },
  { key: "soleHolderFactor", controlAnswer: false, applies: (s) => s.soleOwnerKnowledgeCount >= 2 },
  { key: "weakSegregationFactor", controlAnswer: false, applies: (s) => s.segregationScore < 50 },
  { key: "noDualReleaseFactor", controlAnswer: true, applies: (s) => !s.dualControlPayments },
  { key: "noBankRecFactor", controlAnswer: true, applies: (s) => !s.independentBankRec },
  { key: "lowTenureFactor", controlAnswer: false, applies: (s) => s.avgTenureYears < 3 },
];

export interface ScenarioLevels {
  /** 0–1: the scheme kind's starting likelihood × the likelihood model × staffing conditions. */
  likelihood: number;
  /** 0–1: the scheme kind's starting severity × the likelihood model's severity multiplier. */
  severity: number;
  /** The product of the staffing conditions that are not control answers. */
  staffFactor: number;
  /** 0–100, unrounded: the blend the residual index and the priority list rank on. */
  index: number;
}

/**
 * The two levels for one scenario. `multipliers` are the likelihood model's
 * output for this scenario under the owner's settings (see
 * computeLikelihoodSeverity), so a control answer enters through them alone.
 */
export function scenarioLevels(
  scenarioId: string,
  multipliers: {
    likelihoodMultiplier: number;
    grossSeverityMultiplier: number;
    dualReleaseApplied?: boolean;
  },
  staff: StaffComposition,
  weights: ScoringWeights = DEFAULT_WEIGHTS,
): ScenarioLevels {
  const { fraudRelated, cashRelated } = scenarioFlags(scenarioId);
  const w = weights.scenario;
  const startSeverity = !fraudRelated
    ? w.severityNotFraud
    : cashRelated
      ? w.severityCashFraud
      : w.severityFraud;
  const startLikelihood = fraudRelated ? w.likelihoodFraud : w.likelihoodNotFraud;
  const staffFactor = STAFF_CONDITIONS.filter((c) => !c.controlAnswer && c.applies(staff)).reduce(
    (m, c) => m * weights.scenarioStaff[c.key],
    1,
  );
  // Take dual release back out of a scenario that is not fraud, with the
  // multipliers the likelihood model applied.
  const dual = multipliers.dualReleaseApplied && !fraudRelated ? DEFAULT_WEIGHTS.likelihood : null;
  const likelihoodMultiplier =
    multipliers.likelihoodMultiplier / (dual ? dual.dualOtherLikelihood : 1);
  const severityMultiplier = multipliers.grossSeverityMultiplier / (dual ? dual.dualSeverity : 1);
  const likelihood = clamp(startLikelihood * likelihoodMultiplier * staffFactor, 0, 1);
  const severity = clamp(startSeverity * severityMultiplier, 0, 1);
  return {
    likelihood,
    severity,
    staffFactor,
    index: clamp(w.severityShare * severity + w.likelihoodShare * likelihood, 0, 1) * 100,
  };
}
