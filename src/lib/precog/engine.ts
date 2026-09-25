import * as core from "./scenario-core";
import type { IndustryTemplate } from "./templates";
import { isOwnBusiness, scenariosInScope } from "./scoring/scope";
import {
  DEFAULT_RISK_VARIABLES,
  applyInsuranceTransfer,
  effectiveRiskVariables,
  insuranceFigureNote,
  readInsurance,
  withInsuranceScenario,
} from "./scoring/dynamic-variables";
import { modelInsuranceScenario } from "./insurance/model";

export * from "./scenario-core";

/** Keep operating assumptions separate from conditional insurance financing. */
export function runPrecogScenario(
  template: IndustryTemplate,
  scenarioId: string,
  options?: Parameters<typeof core.runPrecogScenario>[2],
) {
  const own = isOwnBusiness(template);
  const variables = effectiveRiskVariables(
    withInsuranceScenario(options?.riskVariables ?? { ...DEFAULT_RISK_VARIABLES }, scenarioId),
    own,
  );
  const result = core.runPrecogScenario(template, scenarioId, { ...options, riskVariables: variables });
  if (!result) return null;
  const transfer = applyInsuranceTransfer(
    result.financialImpact.expected,
    result.financialImpact.low,
    result.financialImpact.high,
    variables,
    result.dynamic?.likelihoodMultiplier ?? 1,
  );
  const insurance = modelInsuranceScenario(readInsurance(variables), scenarioId, result.financialImpact.expected);
  return {
    ...result,
    insurance,
    retainedImpact: {
      expected: transfer.retainedExpected,
      low: transfer.retainedLow,
      high: transfer.retainedHigh,
    },
    dynamic: result.dynamic ? {
      ...result.dynamic,
      grossExpected: result.financialImpact.expected,
      retainedExpected: transfer.retainedExpected,
      transferredExpected: transfer.transferredExpected,
      premiumAnnualNet: transfer.premiumAnnualNet,
      discountPctApplied: transfer.discountPctApplied,
      expectedAnnualCostOfRisk: transfer.expectedAnnualCostOfRisk,
      eventPlusPremiumExpected: transfer.eventPlusPremiumExpected,
      discountLines: transfer.discounts,
      notes: transfer.notes,
    } : undefined,
    crimeModifiers: [
      ...result.crimeModifiers.filter((line) => !line.startsWith("Insurance")),
      insuranceFigureNote(variables, own) ?? "Conditional insurance illustration.",
    ],
    residualIfNothing: "Insurance can finance part of an eligible loss; it does not repair the underlying operational or control gap.",
    assumptions: [...result.assumptions, ...transfer.notes],
  };
}

/** Operational priority uses gross exposure, not an assumed insurance payout. */
export function rankDangerousScenarios(
  template: IndustryTemplate,
  options?: Parameters<typeof core.rankDangerousScenarios>[1],
) {
  return scenariosInScope(template, options?.confirmedScenarioIds)
    .map((scenario) => {
      const result = runPrecogScenario(template, scenario.id, options)!;
      const gross = result.financialImpact.expected;
      const score = gross / Math.max(14, result.timelineDays.p50) *
        ((options?.staff ?? template.staffComposition).segregationScore < 50 ? 1.3 : 1);
      return { scenario, score, result };
    })
    .sort((a, b) => b.score - a.score);
}
