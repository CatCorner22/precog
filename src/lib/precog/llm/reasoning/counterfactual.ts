/**
 * One lever at a time: the business as it is against the same business with a
 * single lever switched on, on the two figures the product shows (the residual
 * index and the top scenario's annual cost of risk).
 */
import type { StaffComposition } from "../../types";
import type { RiskVariableState } from "../../scoring/dynamic-variables";
import { simulateCascadeLever, type CascadeLeverId } from "../../scoring/variable-cascade";
import type { IndustryTemplate } from "../../templates";
import { portfolioSummary, type ResidualScope } from "../../scoring/residual-engine";
import { DEFAULT_WEIGHTS } from "../../scoring/weights";
import { runPrecogScenario } from "../../engine";

interface CounterfactualResult {
  /** Improving levers first, by residual drop and then cost-of-risk drop. */
  counterfactuals: {
    leverId: CascadeLeverId;
    label: string;
    delta: { residual: number; annualCor: number };
    wouldImprove: boolean;
    narrative: string;
  }[];
  /** The lever that lowers the residual index most, or NO_IMPROVEMENT. */
  bestIntervention: string;
}

/** The starting point every lever is compared against. */
export interface ReasoningBaseline {
  residual: number;
  /** The scenario whose cost of risk is compared; the most dangerous one as the business stands. */
  topScenarioId: string | null;
}

const NO_IMPROVEMENT = "None of these levers improves on the current setup";

/** A residual drop smaller than this (in index points) does not count as an improvement. */
const RESIDUAL_STEP = 1;
/** A cost-of-risk drop smaller than this (in dollars a year) does not count as an improvement. */
const COR_STEP = 50;

const DEFAULT_LEVERS: CascadeLeverId[] = [
  "enable_dual_control",
  "enable_independent_bank_rec",
  "enable_cameras",
  "add_cameras_discount_stack",
  "raise_deductible_10k",
  "lower_deductible_1k",
];

export function runCounterfactuals(
  tpl: IndustryTemplate,
  staff: StaffComposition,
  vars: RiskVariableState,
  baseline: ReasoningBaseline,
  leverIds: CascadeLeverId[] = DEFAULT_LEVERS,
  scope: ResidualScope = {},
): CounterfactualResult {
  const factualCor = annualCostOfRisk(tpl, baseline.topScenarioId, staff, vars);

  const counterfactuals = leverIds.map((leverId) => {
    const sim = simulateCascadeLever(tpl, leverId, vars, staff, undefined, {
      confirmedScenarioIds: scope.confirmedScenarioIds,
    });
    const delta = {
      residual:
        portfolioSummary(tpl, sim.staffAfter, DEFAULT_WEIGHTS, {
          confirmedScenarioIds: scope.confirmedScenarioIds,
          riskVariables: sim.variablesAfter,
        }).averageResidual - baseline.residual,
      annualCor:
        annualCostOfRisk(tpl, baseline.topScenarioId, sim.staffAfter, sim.variablesAfter) -
        factualCor,
    };
    const residualDrop = Math.round(-delta.residual);
    const lowersResidual = residualDrop >= RESIDUAL_STEP;
    const lowersCor = delta.annualCor <= -COR_STEP;
    const effects = [
      lowersResidual ? `lowers the residual index by about ${residualDrop} points` : "",
      lowersCor ? "lowers the cost-of-risk figure" : "",
    ].filter(Boolean);
    return {
      leverId,
      label: sim.lever.label,
      delta,
      wouldImprove: effects.length > 0,
      narrative: effects.length
        ? `Switching on "${sim.lever.label}" ${effects.join(" and ")}.`
        : `"${sim.lever.label}" does not clearly improve on the current setup.`,
    };
  });

  counterfactuals.sort(
    (a, b) =>
      Number(b.wouldImprove) - Number(a.wouldImprove) ||
      a.delta.residual - b.delta.residual ||
      a.delta.annualCor - b.delta.annualCor,
  );

  const best = counterfactuals.find((c) => c.wouldImprove);
  return { counterfactuals, bestIntervention: best?.label ?? NO_IMPROVEMENT };
}

/** The annual cost of risk of one scenario for a given team and settings; 0 when none is in scope. */
function annualCostOfRisk(
  tpl: IndustryTemplate,
  scenarioId: string | null,
  staff: StaffComposition,
  vars: RiskVariableState,
): number {
  if (!scenarioId) return 0;
  const result = runPrecogScenario(tpl, scenarioId, { staff, riskVariables: vars });
  return result?.dynamic?.expectedAnnualCostOfRisk ?? 0;
}
