/**
 * Scenario, insurance, tornado, and cascade tools for the advisor.
 */
import { runPrecogScenario } from "../engine";
import { tornadoSensitivity, type ResidualScope } from "../scoring/residual-engine";
import { compareScenarioFutures } from "../scoring/scenario-compare";
import {
  effectiveRiskVariables,
  evaluateDynamicRisk,
  insuranceFigureNote,
  scenarioFlags,
  type RiskVariableState,
} from "../scoring/dynamic-variables";
import { simulateAllCascades } from "../scoring/variable-cascade";
import type { IndustryTemplate } from "../templates/types";
import type { StaffComposition } from "../types";
import type { ToolOutput } from "./types";
import { formatUsd } from "@/lib/utils";

export interface ScenarioToolInput {
  tpl: IndustryTemplate;
  staff: StaffComposition;
  riskVars: RiskVariableState;
  scope: ResidualScope;
  ownBusiness: boolean;
  /** The most dangerous scenario in scope, or null while none is. */
  topScenarioId: () => string | null;
  /** Why no scenario figure applies, when none is in scope. */
  noScenarioNote: () => string;
}

export function runPrecogScenarioTool({
  tpl,
  staff,
  riskVars,
  topScenarioId,
  noScenarioNote,
}: ScenarioToolInput): ToolOutput {
  const { scenarios } = tpl;
  const scenarioId = topScenarioId();
  if (!scenarioId) return noScenario(noScenarioNote());
  const result = runPrecogScenario(tpl, scenarioId, { staff, riskVariables: riskVars });
  const scenario = scenarios.find((s) => s.id === scenarioId);
  if (!result || !scenario) {
    return { ok: false, summary: "Scenario not found", data: null };
  }
  return {
    ok: true,
    summary: `${scenario.title}: retained ${formatUsd(result.retainedImpact.expected)}, CoR ${formatUsd(result.dynamic?.expectedAnnualCostOfRisk ?? 0)}`,
    data: {
      scenarioId,
      title: scenario.title,
      timelineDays: result.timelineDays,
      gross: result.financialImpact,
      retained: result.retainedImpact,
      dynamic: result.dynamic
        ? {
            likelihoodMultiplier: result.dynamic.likelihoodMultiplier,
            grossSeverityMultiplier: result.dynamic.grossSeverityMultiplier,
            detectionLagMultiplier: result.dynamic.detectionLagMultiplier,
            premiumAnnualNet: result.dynamic.premiumAnnualNet,
            discountPctApplied: result.dynamic.discountPctApplied,
            expectedAnnualCostOfRisk: result.dynamic.expectedAnnualCostOfRisk,
            transferredExpected: result.dynamic.transferredExpected,
          }
        : null,
      cascade: result.cascade,
    },
  };
}

export function compareScenarioFuturesTool({
  tpl,
  staff,
  riskVars,
  topScenarioId,
  noScenarioNote,
}: ScenarioToolInput): ToolOutput {
  const scenarioId = topScenarioId();
  if (!scenarioId) return noScenario(noScenarioNote());
  const report = compareScenarioFutures(tpl, scenarioId, staff, [], riskVars);
  return {
    ok: true,
    summary: `Compared ${report.columns.length} futures`,
    data: {
      scenarioId,
      winnerByRetained: report.winnerByRetained,
      winnerByAnnualCor: report.winnerByAnnualCor,
      columns: report.columns.map((c) => ({
        id: c.id,
        label: c.label,
        retained: c.result.retainedImpact?.expected,
        annualCor: c.result.dynamic?.expectedAnnualCostOfRisk,
      })),
    },
  };
}

export function tornadoLevers({ tpl, staff, scope }: ScenarioToolInput): ToolOutput {
  const t = tornadoSensitivity(tpl, staff, scope);
  return {
    ok: true,
    summary: `Top lever: ${t.levers[0]?.label ?? "—"}`,
    data: { baseAverage: t.baseAverage, levers: t.levers },
  };
}

export function insuranceCostOfRisk({
  tpl,
  riskVars,
  ownBusiness,
  topScenarioId,
  noScenarioNote,
}: ScenarioToolInput): ToolOutput {
  const { scenarios } = tpl;
  const scenarioId = topScenarioId();
  if (!scenarioId) return noScenario(noScenarioNote());
  const scenario = scenarios.find((s) => s.id === scenarioId)!;
  // An own business with the app's default policy figures is priced
  // with no crime policy, and the summary says which basis applies.
  const dyn = evaluateDynamicRisk(
    effectiveRiskVariables(riskVars, ownBusiness, scenarioId),
    scenario.baseFinancialImpact,
    scenarioFlags(scenarioId),
  );
  const policyNote = insuranceFigureNote(riskVars, ownBusiness, scenarioId);
  return {
    ok: true,
    summary: `CoR ${formatUsd(dyn.transfer.expectedAnnualCostOfRisk)}; premium ${formatUsd(dyn.transfer.premiumAnnualNet)}${policyNote ? ` (${policyNote})` : ""}`,
    data: {
      scenarioId,
      variables: riskVars,
      likelihoodSeverity: dyn.likelihoodSeverity,
      transfer: dyn.transfer,
    },
  };
}

export function variableCascades({
  tpl,
  staff,
  riskVars,
  topScenarioId,
  noScenarioNote,
}: ScenarioToolInput): ToolOutput {
  const scenarioId = topScenarioId();
  if (!scenarioId) return noScenario(noScenarioNote());
  const all = simulateAllCascades(tpl, riskVars, staff, scenarioId);
  const topCor = all.rankedByCor.slice(0, 5).map((s) => ({
    leverId: s.lever.id,
    label: s.lever.label,
    affects: s.lever.affects,
    verdict: s.overallVerdict,
    secondOrderNotes: s.secondOrderNotes,
    deltaCor: s.after.expectedAnnualCostOfRisk - s.before.expectedAnnualCostOfRisk,
    deltaRetained: s.after.retainedExpected - s.before.retainedExpected,
    deltaPremium: s.after.premiumAnnualNet - s.before.premiumAnnualNet,
    deltaResidual: s.after.residualAverage - s.before.residualAverage,
    deltaP50: s.after.timelineP50 - s.before.timelineP50,
    deltaLikelihood: s.after.likelihoodMultiplier - s.before.likelihoodMultiplier,
    improves: s.deltas.filter((d) => d.direction === "improves").map((d) => d.label),
    worsens: s.deltas.filter((d) => d.direction === "worsens").map((d) => d.label),
  }));
  return {
    ok: true,
    summary: `Best CoR lever: ${topCor[0]?.label ?? "—"}`,
    data: {
      mode: "portfolio",
      scenarioId,
      baseline: all.baseline,
      dependencyMap: all.dependencyMap,
      topByCostOfRisk: topCor,
    },
  };
}

/** Returned instead of a scenario result while no scenario is in scope. */
function noScenario(note: string): ToolOutput {
  return { ok: false, summary: note, data: null };
}
