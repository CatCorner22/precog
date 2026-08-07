/**
 * Grounding tools for the Pioneer LLM — deterministic practice facts + ML/RAG.
 */
import { assessCoso } from "../coso";
import {
  PRACTICE_NAME,
  controls,
  crimeFraudStats,
  knowledge,
  people,
  relations,
  scenarios,
  staffComposition as demoStaff,
} from "../demo-data";
import {
  findKnowledgeRisks,
  rankDangerousScenarios,
  runPrecogScenario,
} from "../engine";
import {
  portfolioSummary,
  tornadoSensitivity,
} from "../scoring/residual-engine";
import { compareScenarioFutures } from "../scoring/scenario-compare";
import {
  DEFAULT_RISK_VARIABLES,
  evaluateDynamicRisk,
  scenarioFlags,
  type RiskVariableState,
} from "../scoring/dynamic-variables";
import {
  simulateAllCascades,
  simulateCascadeLever,
  type CascadeLeverId,
} from "../scoring/variable-cascade";
import { retrieveKnowledge } from "../rag/retrieve";
import { scoreAnomalies } from "../ml/anomaly";
import { scoreLeadingIndicators } from "../ml/leading-indicators";
import { forecastResidualTrajectory } from "../ml/forecast";
import { runAdvancedReasoning } from "./reasoning/engine";
import { runMetaAnalysis } from "./meta-analysis";
import { defaultProfile, type PracticeProfile } from "../practice-profile";
import type { StaffComposition } from "../types";
import type { ToolName, ToolResult } from "./types";

export interface ToolContext {
  riskVariables?: RiskVariableState;
  staff?: StaffComposition;
  practiceName?: string;
  question?: string;
  profile?: PracticeProfile;
}

function profileOf(ctx: ToolContext): PracticeProfile {
  if (ctx.profile) return ctx.profile;
  const base = defaultProfile();
  return {
    ...base,
    practiceName: ctx.practiceName ?? base.practiceName,
    staff: ctx.staff ?? base.staff,
    riskVariables: ctx.riskVariables ?? base.riskVariables,
  };
}

function usd(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function staffOf(ctx: ToolContext): StaffComposition {
  return ctx.staff ?? demoStaff;
}

export const TOOL_CATALOG: {
  name: ToolName;
  description: string;
  args: string;
}[] = [
  { name: "get_practice_snapshot", description: "Practice name, staff, risk variables, crime priors.", args: "none" },
  { name: "get_coso_assessment", description: "Five COSO components and priority findings.", args: "none" },
  { name: "get_residual_portfolio", description: "Ranked residual risks with drivers.", args: "none" },
  { name: "get_knowledge_spofs", description: "Critical knowledge single points of failure.", args: "none" },
  { name: "get_knowledge_graph", description: "Person↔knowledge continuity edges.", args: "none" },
  { name: "run_precog_scenario", description: "Scenario timeline CI, retained loss, CoR.", args: "{ scenarioId? }" },
  { name: "compare_scenario_futures", description: "Do-nothing vs mitigations.", args: "{ scenarioId? }" },
  { name: "get_tornado_levers", description: "Highest residual leverage control changes.", args: "none" },
  { name: "get_insurance_cost_of_risk", description: "Premium, discounts, retained, CoR.", args: "{ scenarioId? }" },
  { name: "get_sod_conflicts", description: "SoD gaps and compensating controls.", args: "none" },
  { name: "simulate_variable_cascades", description: "Cross-variable ripple effects.", args: "{ leverId?, scenarioId? }" },
  { name: "retrieve_guidance", description: "TF-IDF RAG over COSO/SoD/Lean/fraud corpus.", args: "{ query? }" },
  { name: "score_anomalies", description: "Multivariate anomaly score vs healthy practice prior.", args: "none" },
  { name: "get_leading_indicators", description: "Leading-indicator pressure composite.", args: "none" },
  { name: "forecast_residual", description: "12-week residual trajectory neglect vs plan.", args: "{ horizonWeeks? }" },
  { name: "run_advanced_reasoning", description: "Bayesian + causal multi-hop + beam search + counterfactuals + EVOI.", args: "none" },
  { name: "run_meta_analysis", description: "Epistemic meta-analysis: evaluation readiness, known/unknown unknowns, real-time capability.", args: "none" },
];

export function executeTool(
  tool: ToolName,
  args: Record<string, unknown> = {},
  ctx: ToolContext = {},
): ToolResult {
  const staff = staffOf(ctx);
  const practiceName = ctx.practiceName ?? PRACTICE_NAME;
  const riskVars = ctx.riskVariables ?? DEFAULT_RISK_VARIABLES;

  try {
    switch (tool) {
      case "get_practice_snapshot":
        return {
          tool,
          ok: true,
          summary: `${practiceName}: team ${staff.teamSize}, segregation ${staff.segregationScore}/100`,
          data: {
            practice: practiceName,
            staff,
            riskVariables: {
              basePremiumAnnual: riskVars.basePremiumAnnual,
              deductible: riskVars.deductible,
              policyLimit: riskVars.policyLimit,
              hasDualControl: riskVars.hasDualControl,
              hasIndependentBankRec: riskVars.hasIndependentBankRec,
              hasSecurityCameras: riskVars.hasSecurityCameras,
              claimsLoadFactor: riskVars.claimsLoadFactor,
              dailyCashExposure: riskVars.dailyCashExposure,
            },
            crimePrior: {
              annualExposureClass: crimeFraudStats.industryEmbezzlementRate,
              medianDetectionDays: crimeFraudStats.medianDetectionDays,
              midLossRef: crimeFraudStats.typicalLossMid,
            },
          },
          links: [{ tab: "command", label: "Command" }],
        };

      case "get_coso_assessment": {
        const coso = assessCoso();
        return {
          tool,
          ok: true,
          summary: `COSO ${coso.overall}/100 (${coso.overallStatus})`,
          data: {
            overall: coso.overall,
            status: coso.overallStatus,
            components: coso.components.map((c) => ({
              id: c.id,
              name: c.name,
              score: c.score,
              status: c.status,
            })),
            priorityFindings: coso.priorityFindings.slice(0, 6),
          },
          links: [{ tab: "coso", label: "COSO" }],
        };
      }

      case "get_residual_portfolio": {
        const p = portfolioSummary(staff);
        return {
          tool,
          ok: true,
          summary: `Avg residual ${p.averageResidual}; top ${p.top[0]?.name ?? "—"}`,
          data: {
            scoringVersion: p.scoringVersion,
            averageResidual: p.averageResidual,
            criticalPath: p.criticalPath,
            actNow: p.actNow,
            top: p.top.slice(0, 8).map((t) => ({
              id: t.id,
              name: t.name,
              category: t.category,
              residual: t.residual,
              band: t.bandLabel,
              inherent: t.inherent,
              controlEffectiveness: t.controlEffectiveness,
              drivers: t.drivers.slice(0, 4),
              linkedScenarioId: t.linkedScenarioId,
              linkedKnowledgeId: t.linkedKnowledgeId,
              expectedLoss: t.expectedLoss,
              p50Days: t.p50Days,
            })),
          },
          links: [{ tab: "residual", label: "Residual" }],
        };
      }

      case "get_knowledge_spofs": {
        const risks = findKnowledgeRisks().filter(
          (r) => r.soleOwner || r.ownerCount === 0,
        );
        return {
          tool,
          ok: true,
          summary: `${risks.length} SPOF/unowned item(s)`,
          data: risks.map((r) => ({
            knowledgeId: r.knowledgeId,
            name: r.name,
            soleOwner: r.soleOwner,
            ownerCount: r.ownerCount,
            owners: r.owners.map((o) => ({ id: o.id, name: o.name, role: o.role })),
            riskScore: r.riskScore,
          })),
          links: [{ tab: "knowledge", label: "Knowledge map" }],
        };
      }

      case "get_knowledge_graph": {
        const STRONG = new Set(["expert", "proficient"]);
        const edges = relations
          .filter((r) => STRONG.has(r.level))
          .map((r) => {
            const person = people.find((p) => p.id === r.personId);
            const k = knowledge.find((x) => x.id === r.knowledgeId);
            return {
              personId: r.personId,
              personName: person?.name,
              knowledgeId: r.knowledgeId,
              knowledgeName: k?.name,
              level: r.level,
            };
          });
        return {
          tool,
          ok: true,
          summary: `${edges.length} strong edges`,
          data: { edges, peopleCount: people.length, knowledgeCount: knowledge.length },
          links: [{ tab: "knowledge", label: "Knowledge map" }],
        };
      }

      case "run_precog_scenario": {
        const ranked = rankDangerousScenarios({ staff, riskVariables: riskVars });
        const scenarioId =
          (args.scenarioId as string) || ranked[0]?.scenario.id || scenarios[0].id;
        const result = runPrecogScenario(scenarioId, { staff, riskVariables: riskVars });
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

      case "compare_scenario_futures": {
        const ranked = rankDangerousScenarios({ staff, riskVariables: riskVars });
        const scenarioId =
          (args.scenarioId as string) || ranked[0]?.scenario.id || scenarios[0].id;
        const report = compareScenarioFutures(scenarioId, staff, [], riskVars);
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

      case "get_tornado_levers": {
        const t = tornadoSensitivity(staff);
        return {
          tool,
          ok: true,
          summary: `Top lever: ${t.levers[0]?.label ?? "—"}`,
          data: { baseAverage: t.baseAverage, levers: t.levers },
          links: [{ tab: "residual", label: "Tornado" }],
        };
      }

      case "get_insurance_cost_of_risk": {
        const ranked = rankDangerousScenarios({ staff, riskVariables: riskVars });
        const scenarioId =
          (args.scenarioId as string) || ranked[0]?.scenario.id || scenarios[0].id;
        const scenario = scenarios.find((s) => s.id === scenarioId)!;
        const dyn = evaluateDynamicRisk(
          riskVars,
          scenario.baseFinancialImpact,
          scenarioFlags(scenarioId),
        );
        return {
          tool,
          args: { scenarioId },
          ok: true,
          summary: `CoR ${usd(dyn.transfer.expectedAnnualCostOfRisk)}; premium ${usd(dyn.transfer.premiumAnnualNet)}`,
          data: {
            scenarioId,
            variables: riskVars,
            likelihoodSeverity: dyn.likelihoodSeverity,
            transfer: dyn.transfer,
          },
          links: [{ tab: "precog", label: "Insurance" }],
        };
      }

      case "get_sod_conflicts": {
        const gaps = controls.filter((c) => !c.segregated);
        return {
          tool,
          ok: true,
          summary: `${gaps.length} SoD gap(s)`,
          data: gaps.map((g) => ({
            id: g.id,
            name: g.name,
            duties: g.duties,
            compensatingControls: g.compensatingControls,
            residualRiskAccepted: g.residualRiskAccepted,
          })),
          links: [{ tab: "sod", label: "SoD" }],
        };
      }

      case "simulate_variable_cascades": {
        const ranked = rankDangerousScenarios({ staff, riskVariables: riskVars });
        const scenarioId =
          (args.scenarioId as string) || ranked[0]?.scenario.id || scenarios[0].id;
        const leverId = args.leverId as CascadeLeverId | undefined;
        if (leverId) {
          const one = simulateCascadeLever(leverId, riskVars, staff, scenarioId);
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
        const all = simulateAllCascades(riskVars, staff, scenarioId);
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

      case "retrieve_guidance": {
        const query =
          (args.query as string) ||
          ctx.question ||
          "dental practice residual risk segregation of duties bank reconciliation COSO monitoring";
        const hits = retrieveKnowledge(query, { topK: 4 });
        return {
          tool,
          args: { query },
          ok: true,
          summary: hits.length
            ? `RAG: ${hits.map((h) => h.chunk.id).join(", ")}`
            : "RAG: no hits",
          data: {
            query,
            hits: hits.map((h) => ({
              id: h.chunk.id,
              title: h.chunk.title,
              domain: h.chunk.domain,
              score: Math.round(h.score * 1000) / 1000,
              text: h.chunk.text,
              source: h.chunk.source,
            })),
          },
          links: [{ tab: "intel", label: "Intelligence" }],
        };
      }

      case "score_anomalies": {
        const report = scoreAnomalies(staff, riskVars);
        return {
          tool,
          ok: true,
          summary: `Anomaly ${report.band} (${report.overallScore}/100)`,
          data: report,
          links: [{ tab: "intel", label: "ML anomalies" }],
        };
      }

      case "get_leading_indicators": {
        const report = scoreLeadingIndicators(staff, riskVars);
        return {
          tool,
          ok: true,
          summary: `Leading pressure ${report.pressureIndex}/100 (${report.band})`,
          data: report,
          links: [{ tab: "intel", label: "Leading indicators" }],
        };
      }

      case "forecast_residual": {
        const horizonWeeks = Number(args.horizonWeeks) || 12;
        const forecast = forecastResidualTrajectory(staff, riskVars, {
          horizonWeeks,
        });
        return {
          tool,
          args: { horizonWeeks },
          ok: true,
          summary: `Forecast: week ${horizonWeeks} residual neglect ${forecast.points.at(-1)?.residualDoNothing} vs plan ${forecast.points.at(-1)?.residualWithPlan}`,
          data: forecast,
          links: [{ tab: "intel", label: "Forecast" }],
        };
      }


      case "run_advanced_reasoning": {
        const report = runAdvancedReasoning(staff, riskVars);
        return {
          tool,
          ok: true,
          summary: `Advanced reasoning: beam "${report.beam.bestSequence || "status quo"}" · P(fail) ${(report.bayesian.pFail * 100).toFixed(1)}% · conf ${report.confidence.score}`,
          data: report,
          links: [{ tab: "intel", label: "Advanced reasoning" }],
        };
      }

      case "run_meta_analysis": {
        const report = runMetaAnalysis(profileOf(ctx));
        return {
          tool,
          ok: true,
          summary: `Meta readiness ${report.evaluationReadiness} · epistemic ${report.epistemicConfidence} · KU ${report.summary.knownUnknowns} · UU ${report.summary.unknownUnknowns}`,
          data: {
            evaluationReadiness: report.evaluationReadiness,
            epistemicConfidence: report.epistemicConfidence,
            realtimeScore: report.realtimeScore,
            summary: report.summary,
            narrative: report.narrative,
            recommendations: report.recommendations,
            topUnknownUnknowns: report.items
              .filter((i) => i.classification === "unknown_unknown")
              .slice(0, 5)
              .map((i) => ({ id: i.id, title: i.title, severity: i.severity })),
            topKnownUnknowns: report.items
              .filter((i) => i.classification === "known_unknown")
              .slice(0, 5)
              .map((i) => ({ id: i.id, title: i.title, severity: i.severity })),
            coverage: report.coverage,
          },
          links: [{ tab: "intel", label: "Meta-analysis" }],
        };
      }

      default:
        return { tool, ok: false, summary: "Unknown tool", data: null };
    }
  } catch (e) {
    return {
      tool,
      args,
      ok: false,
      summary: e instanceof Error ? e.message : "Tool failed",
      data: null,
    };
  }
}

export function planTools(question: string): ToolName[] {
  const q = question.toLowerCase();
  const tools = new Set<ToolName>([
    "get_practice_snapshot",
    "get_residual_portfolio",
    "get_knowledge_spofs",
    "get_insurance_cost_of_risk",
    "simulate_variable_cascades",
    "retrieve_guidance",
    "score_anomalies",
    "get_leading_indicators",
    "forecast_residual",
    "run_advanced_reasoning",
    "run_meta_analysis",
    "get_coso_assessment",
    "get_tornado_levers",
    "run_precog_scenario",
  ]);

  if (/sod|segregat|duty|write-?off|vendor|payment/.test(q)) {
    tools.add("get_sod_conflicts");
  }
  if (/knowledge|spof|leave|quit|cross-?train|continuity/.test(q)) {
    tools.add("get_knowledge_graph");
  }
  if (/scenario|timeline|impact|loss|embezzl|fraud|cash|compare/.test(q)) {
    tools.add("compare_scenario_futures");
  }
  if (/forecast|trajectory|next month|12 week|drift|trend/.test(q)) {
    tools.add("forecast_residual");
  }
  if (/anomal|outlier|unusual|ml|machine/.test(q)) {
    tools.add("score_anomalies");
  }
  if (/leading|early|signal|indicator/.test(q)) {
    tools.add("get_leading_indicators");
  }
  if (/coso|guidance|what does|policy|best practice|rag/.test(q)) {
    tools.add("retrieve_guidance");
  }
  if (/unknown|epistemic|meta|blind.?spot|rumsfeld|confidence|readiness|gap|what don.t we know/.test(q)) {
    tools.add("run_meta_analysis");
  }

  return Array.from(tools);
}
