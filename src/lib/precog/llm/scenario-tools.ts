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
import {
  simulateAllCascades,
  simulateCascadeLever,
  type CascadeLeverId,
} from "../scoring/variable-cascade";
import type { IndustryTemplate } from "../templates/types";
import type { StaffComposition } from "../types";
import type { ToolName, ToolResult } from "./types";
import { formatUsd as usd } from "@/lib/utils";

export interface ScenarioToolInput {
  tool: ToolName;
  args: Record<string, unknown>;
  tpl: IndustryTemplate;
  staff: StaffComposition;
  riskVars: RiskVariableState;
  scope: ResidualScope;
  ownBusiness: boolean;
  scenarioInScope: (asked: unknown) => string | null;
  noScenario: () => ToolResult;
}

export function runPrecogScenarioTool({
  tool,
  args,
  tpl,
  staff,
  riskVars,
  scenarioInScope,
  noScenario,
}: ScenarioToolInput): ToolResult {
  const { scenarios } = tpl;
  const scenarioId = scenarioInScope(args.scenarioId);
  if (!scenarioId) return noScenario();
  const result = runPrecogScenario(tpl, scenarioId, { staff, riskVariables: riskVars });
  const scenario = scenarios.find((s) => s.id === scenarioId);
  if (!result || !scenario) {
    return { tool, args, ok: false, summary: "Scenario not found", data: null };
  }
  return {
    tool,
    args: { scenarioId },
    ok: true,
    summary: `${scenario.title}: retained ${usd(result.retainedImpact.expected)}, CoR ${usd(result.dynamic?.expectedAnnualCostOfRisk ?? 0)}`,
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
    links: [{ tab: "precog", id: scenarioId, label: scenario.title }],
  };
}

export function compareScenarioFuturesTool({
  tool,
  args,
  tpl,
  staff,
  riskVars,
  scenarioInScope,
  noScenario,
}: ScenarioToolInput): ToolResult {
  const scenarioId = scenarioInScope(args.scenarioId);
  if (!scenarioId) return noScenario();
  const report = compareScenarioFutures(tpl, scenarioId, staff, [], riskVars);
  return {
    tool,
    args: { scenarioId },
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
    links: [{ tab: "precog", id: scenarioId, label: "Compare" }],
  };
}

export function tornadoLevers({ tool, tpl, staff, scope }: ScenarioToolInput): ToolResult {
  const t = tornadoSensitivity(tpl, staff, scope);
  return {
    tool,
    ok: true,
    summary: `Top lever: ${t.levers[0]?.label ?? "—"}`,
    data: { baseAverage: t.baseAverage, levers: t.levers },
    links: [{ tab: "residual", label: "Tornado" }],
  };
}

export function insuranceCostOfRisk({
  tool,
  args,
  tpl,
  riskVars,
  ownBusiness,
  scenarioInScope,
  noScenario,
}: ScenarioToolInput): ToolResult {
  const { scenarios } = tpl;
  const scenarioId = scenarioInScope(args.scenarioId);
  if (!scenarioId) return noScenario();
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
    tool,
    args: { scenarioId },
    ok: true,
    summary: `CoR ${usd(dyn.transfer.expectedAnnualCostOfRisk)}; premium ${usd(dyn.transfer.premiumAnnualNet)}${policyNote ? ` (${policyNote})` : ""}`,
    data: {
      scenarioId,
      variables: riskVars,
      likelihoodSeverity: dyn.likelihoodSeverity,
      transfer: dyn.transfer,
    },
    links: [{ tab: "precog", label: "Insurance" }],
  };
}

export function variableCascades({
  tool,
  args,
  tpl,
  staff,
  riskVars,
  scenarioInScope,
  noScenario,
}: ScenarioToolInput): ToolResult {
  const scenarioId = scenarioInScope(args.scenarioId);
  if (!scenarioId) return noScenario();
  const leverId = args.leverId as CascadeLeverId | undefined;
  if (leverId) {
    const one = simulateCascadeLever(tpl, leverId, riskVars, staff, scenarioId);
    return {
      tool,
      args: { leverId, scenarioId },
      ok: true,
      summary: one.overallVerdict,
      data: {
        mode: "single",
        scenarioId,
        simulation: {
          lever: one.lever,
          verdict: one.overallVerdict,
          secondOrderNotes: one.secondOrderNotes,
          deltas: one.deltas,
          before: one.before,
          after: one.after,
        },
      },
      links: [{ tab: "precog", label: "Cascades" }],
    };
  }
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
    tool,
    args: { scenarioId },
    ok: true,
    summary: `Best CoR lever: ${topCor[0]?.label ?? "—"}`,
    data: {
      mode: "portfolio",
      scenarioId,
      baseline: all.baseline,
      dependencyMap: all.dependencyMap,
      topByCostOfRisk: topCor,
    },
    links: [{ tab: "precog", label: "Cascades" }],
  };
}
