/**
 * Twin-world counterfactuals: factual world vs intervention world.
 * Measures PEHE-style difference on residual, CoR, Bayesian EAL.
 */
import type { StaffComposition } from "../../types";
import type { RiskVariableState } from "../../scoring/dynamic-variables";
import {
  simulateCascadeLever,
  type CascadeLeverId,
} from "../../scoring/variable-cascade";
import {
  initBayesianState,
  updateBayesianWithLever,
  type BayesianState,
} from "./bayesian";
import { crimeFraudStats } from "../../demo-data";
import { portfolioSummary } from "../../scoring/residual-engine";
import { scoreLeadingIndicators } from "../../ml/leading-indicators";
import { runPrecogScenario } from "../../engine";
import { rankDangerousScenarios } from "../../engine";

export interface TwinWorld {
  label: string;
  residual: number;
  annualCor: number;
  retained: number;
  likelihood: number;
  bayesEal: number;
  bayesPFail: number;
  bayesPFailCi: { low: number; high: number };
}

export interface CounterfactualResult {
  factual: TwinWorld;
  counterfactuals: {
    leverId: CascadeLeverId;
    label: string;
    world: TwinWorld;
    delta: {
      residual: number;
      annualCor: number;
      retained: number;
      bayesEal: number;
      bayesPFail: number;
    };
    wouldImprove: boolean;
    narrative: string;
  }[];
  bestIntervention: string;
  method: string;
}

function worldFrom(
  label: string,
  staff: StaffComposition,
  vars: RiskVariableState,
  bayes: BayesianState,
): TwinWorld {
  const portfolio = portfolioSummary(staff);
  const ranked = rankDangerousScenarios({ staff, riskVariables: vars });
  const top = ranked[0];
  const result = top
    ? runPrecogScenario(top.scenario.id, { staff, riskVariables: vars })
    : null;
  return {
    label,
    residual: portfolio.averageResidual,
    annualCor: result?.dynamic?.expectedAnnualCostOfRisk ?? bayes.expectedAnnualLoss,
    retained: result?.retainedImpact.expected ?? 0,
    likelihood: result?.dynamic?.likelihoodMultiplier ?? 1,
    bayesEal: bayes.expectedAnnualLoss,
    bayesPFail: bayes.failureProbability.mean,
    bayesPFailCi: bayes.failureProbability.ci95,
  };
}

export function runCounterfactuals(
  staff: StaffComposition,
  vars: RiskVariableState,
  leverIds: CascadeLeverId[] = [
    "enable_dual_control",
    "enable_independent_bank_rec",
    "enable_cameras",
    "add_cameras_discount_stack",
    "raise_deductible_10k",
    "lower_deductible_1k",
  ],
): CounterfactualResult {
  const leading = scoreLeadingIndicators(staff, vars);
  const ranked = rankDangerousScenarios({ staff, riskVariables: vars });
  const topResult = ranked[0]
    ? runPrecogScenario(ranked[0].scenario.id, { staff, riskVariables: vars })
    : null;

  const baseBayes = initBayesianState({
    industryBaseRate: crimeFraudStats.industryEmbezzlementRate,
    retainedExpected: topResult?.retainedImpact.expected ?? 25000,
    residualAverage: portfolioSummary(staff).averageResidual,
    leadingPressure: leading.pressureIndex,
    dualControl: staff.dualControlPayments,
    independentBankRec: staff.independentBankRec,
  });

  const factual = worldFrom("Factual (as-is)", staff, vars, baseBayes);

  const counterfactuals = leverIds.map((leverId) => {
    const sim = simulateCascadeLever(leverId, vars, staff);
    const likelihoodDrop = Math.max(
      0,
      factual.likelihood - sim.after.likelihoodMultiplier,
    );
    const severityDrop = Math.max(
      0,
      1 -
        sim.after.retainedExpected /
          Math.max(1, sim.before.retainedExpected),
    );
    const bayes = updateBayesianWithLever(baseBayes, {
      likelihoodDrop,
      severityDrop: Math.min(0.5, severityDrop),
      label: sim.lever.label,
    });
    const world = worldFrom(sim.lever.label, sim.staffAfter, sim.variablesAfter, bayes);
    const delta = {
      residual: world.residual - factual.residual,
      annualCor: world.annualCor - factual.annualCor,
      retained: world.retained - factual.retained,
      bayesEal: world.bayesEal - factual.bayesEal,
      bayesPFail: world.bayesPFail - factual.bayesPFail,
    };
    const wouldImprove =
      delta.residual < -0.5 || delta.annualCor < -50 || delta.bayesEal < -50;
    const narrative = wouldImprove
      ? `In the twin world with "${sim.lever.label}", residual ${delta.residual.toFixed(1)}, CoR ${Math.round(delta.annualCor)}, Bayesian EAL ${Math.round(delta.bayesEal)}, P(fail) ${(delta.bayesPFail * 100).toFixed(1)} pts.`
      : `Twin world "${sim.lever.label}" does not clearly dominate factual (residual Δ ${delta.residual.toFixed(1)}, CoR Δ ${Math.round(delta.annualCor)}).`;

    return {
      leverId,
      label: sim.lever.label,
      world,
      delta,
      wouldImprove,
      narrative,
    };
  });

  counterfactuals.sort(
    (a, b) => a.delta.bayesEal + a.delta.annualCor * 0.5 - (b.delta.bayesEal + b.delta.annualCor * 0.5),
  );

  return {
    factual,
    counterfactuals,
    bestIntervention: counterfactuals[0]?.label ?? "none",
    method: "twin-world counterfactuals + Bayesian EAL (educational)",
  };
}
