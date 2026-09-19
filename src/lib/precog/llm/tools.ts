/**
 * Grounding tools for the Pioneer LLM — deterministic practice facts + ML/RAG.
 */
import { describeChunkBasis } from "../rag/corpus";
import { assessCoso } from "../coso";
import { getActiveTemplate } from "../active-template";
import { findKnowledgeRisks, rankDangerousScenarios, runPrecogScenario } from "../engine";
import { portfolioSummary, tornadoSensitivity } from "../scoring/residual-engine";
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
import { scoreLeadingIndicators } from "../ml/leading-indicators";
import { casesForSodRules, detectionBreakdown, observedLossRange } from "../evidence";
import { detectSodConflicts } from "../sod/detect";
import { mitigatedSodRuleIds } from "../controls/dual-release";
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
  return ctx.staff ?? getActiveTemplate().staffComposition;
}

export const TOOL_CATALOG: {
  name: ToolName;
  description: string;
  args: string;
}[] = [
  {
    name: "get_practice_snapshot",
    description: "Practice name, staff, risk variables, crime priors.",
    args: "none",
  },
  {
    name: "get_coso_assessment",
    description: "Five COSO components and priority findings.",
    args: "none",
  },
  {
    name: "get_residual_portfolio",
    description: "Ranked residual risks with drivers.",
    args: "none",
  },
  {
    name: "get_knowledge_spofs",
    description: "Critical knowledge single points of failure.",
    args: "none",
  },
  { name: "get_knowledge_graph", description: "Person↔knowledge continuity edges.", args: "none" },
  {
    name: "run_precog_scenario",
    description: "A scenario's assumed timeline, assumed retained loss, and cost-of-risk figure.",
    args: "{ scenarioId? }",
  },
  {
    name: "compare_scenario_futures",
    description: "Do-nothing vs mitigations.",
    args: "{ scenarioId? }",
  },
  {
    name: "get_tornado_levers",
    description: "Highest residual leverage control changes.",
    args: "none",
  },
  {
    name: "get_insurance_cost_of_risk",
    description: "Premium, discounts, retained, CoR.",
    args: "{ scenarioId? }",
  },
  { name: "get_sod_conflicts", description: "SoD gaps and compensating controls.", args: "none" },
  {
    name: "simulate_variable_cascades",
    description: "Cross-variable ripple effects.",
    args: "{ leverId?, scenarioId? }",
  },
  {
    name: "retrieve_guidance",
    description: "TF-IDF RAG over COSO/SoD/Lean/fraud corpus.",
    args: "{ query? }",
  },
  {
    name: "get_case_evidence",
    description:
      "Prosecuted cases from the evidence library that match this business's open duty conflicts: title, sector, loss, duration, how it was found, what would have caught it, and the government source URL.",
    args: "none",
  },
  {
    name: "get_leading_indicators",
    description: "Conditions this app watches (watch / breach), with the reason for each.",
    args: "none",
  },
  {
    name: "run_advanced_reasoning",
    description:
      "Lever ordering from this app's own model: which control or insurance lever first, and what to verify next. Weights, not measurements.",
    args: "none",
  },
  {
    name: "run_meta_analysis",
    description:
      "What this app measures directly, what it knows it cannot see, and what lies outside its model.",
    args: "none",
  },
];

export function executeTool(
  tool: ToolName,
  args: Record<string, unknown> = {},
  ctx: ToolContext = {},
): ToolResult {
  const tpl = getActiveTemplate();
  const { people, knowledge, relations, scenarios, controls, crimeFraudStats } = tpl;
  const staff = staffOf(ctx);
  const practiceName = ctx.practiceName ?? tpl.businessName;
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
            publishedFraudStats: {
              medianLossSmallOrgUsd: crimeFraudStats.medianLossSmallOrgUsd,
              medianDetectionMonths: crimeFraudStats.medianDetectionMonths,
              medianLossAllUsd: crimeFraudStats.medianLossAllUsd,
              statsSource: crimeFraudStats.source,
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
        const risks = findKnowledgeRisks().filter((r) => r.soleOwner || r.ownerCount === 0);
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
        const scenarioId = (args.scenarioId as string) || ranked[0]?.scenario.id || scenarios[0].id;
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
        const scenarioId = (args.scenarioId as string) || ranked[0]?.scenario.id || scenarios[0].id;
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
        const scenarioId = (args.scenarioId as string) || ranked[0]?.scenario.id || scenarios[0].id;
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
        const scenarioId = (args.scenarioId as string) || ranked[0]?.scenario.id || scenarios[0].id;
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
          summary: hits.length ? `RAG: ${hits.map((h) => h.chunk.id).join(", ")}` : "RAG: no hits",
          data: {
            query,
            hits: hits.map((h) => ({
              id: h.chunk.id,
              title: h.chunk.title,
              domain: h.chunk.domain,
              score: Math.round(h.score * 1000) / 1000,
              text: h.chunk.text,
              basis: describeChunkBasis(h.chunk),
            })),
          },
          links: [{ tab: "intel", label: "Intelligence" }],
        };
      }

      case "get_case_evidence": {
        const profile = profileOf(ctx);
        const sod = detectSodConflicts(profile.staff, {
          dualReleaseMitigatedRuleIds: mitigatedSodRuleIds(profile.dualRelease),
        });
        const openRuleIds = [
          ...new Set(
            sod.conflicts
              .filter((c) => !c.residualRiskAccepted && !c.dualReleaseMitigated)
              .map((c) => c.ruleId),
          ),
        ];
        const cases = casesForSodRules(openRuleIds);
        const range = observedLossRange(cases);
        const found = detectionBreakdown(cases);
        // The case list is ordered by relevance to the open rules, so the
        // largest loss is found separately rather than read off the top.
        const largest = cases.reduce<(typeof cases)[number] | null>(
          (best, c) => (best === null || c.lossUsd > best.lossUsd ? c : best),
          null,
        );
        return {
          tool,
          ok: true,
          summary: cases.length
            ? `${cases.length} prosecuted case(s) match the open duty conflicts; median stated loss ${range ? usd(range.median) : "n/a"}`
            : "No prosecuted case in the library matches the open duty conflicts",
          // Every field here is a fact stated in the cited source, or the
          // library's own tagging of which control would have caught it.
          // Nothing is a rate or a forecast.
          data: {
            matchingCases: cases.length,
            openRuleIds,
            lossRange: range,
            largest: largest
              ? { title: largest.title, lossUsd: largest.lossUsd, lossIsFloor: largest.lossIsFloor }
              : null,
            detection: { known: found.known, unknown: found.unknown, byRoute: found.byRoute },
            cases: cases.slice(0, 8).map((c) => ({
              id: c.id,
              title: c.title,
              sector: c.sector,
              lossUsd: c.lossUsd,
              lossIsFloor: c.lossIsFloor,
              durationMonths: c.durationMonths ?? null,
              detection: c.detection,
              controlGap: c.controlGap,
              wouldHaveCaughtIt: c.wouldHaveCaughtIt.map((w) => w.asApplied),
              source: { publisher: c.source.publisher, url: c.source.url },
            })),
          },
          links: [{ tab: "start", label: "Start here" }],
        };
      }

      case "get_leading_indicators": {
        const report = scoreLeadingIndicators(staff, riskVars);
        const breached = report.indicators.filter((i) => i.status === "breach").length;
        const watch = report.indicators.filter((i) => i.status === "watch").length;
        return {
          tool,
          ok: true,
          summary: `Leading indicators: ${breached} breached, ${watch} at watch, of ${report.indicators.length}`,
          // The composite index and its band are this app's weighting and are
          // deliberately not passed on; the conditions and their reasons are.
          data: {
            breached,
            watch,
            indicators: report.indicators.map((i) => ({
              id: i.id,
              label: i.label,
              status: i.status,
              why: i.why,
            })),
            topActions: report.topActions,
            basis: "Thresholds set in this app; not benchmarks.",
          },
          links: [{ tab: "intel", label: "Leading indicators" }],
        };
      }

      case "run_advanced_reasoning": {
        const report = runAdvancedReasoning(staff, riskVars);
        return {
          tool,
          ok: true,
          summary: `Lever ordering: ${report.recommendedSequence.join(" → ") || "status quo"} · verify next: ${report.evoi.topObservation}`,
          // Ordering and reasons only. The probabilities, intervals, expected
          // losses, utilities, and confidence score behind the ordering are
          // this app's weights and are not passed on as if measured.
          data: {
            recommendedSequence: report.recommendedSequence,
            bestSingleLever: report.counterfactual.bestIntervention,
            verifyNext: report.evoi.items.map((i) => ({
              observation: i.observation,
              effort: i.effort,
              rationale: i.rationale,
            })),
            synthesis: report.synthesis,
            basis: "This app's own weights, not measurements of this business.",
          },
          links: [{ tab: "intel", label: "Lever ordering" }],
        };
      }

      case "run_meta_analysis": {
        const report = runMetaAnalysis(profileOf(ctx));
        return {
          tool,
          ok: true,
          summary: `What this app can see: ${report.summary.knownKnowns} measured, ${report.summary.knownUnknowns} known gaps, ${report.summary.unknownUnknowns} outside the model`,
          data: {
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
    "get_leading_indicators",
    "get_case_evidence",
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
  if (/leading|early|signal|indicator/.test(q)) {
    tools.add("get_leading_indicators");
  }
  if (/coso|guidance|what does|policy|best practice|rag/.test(q)) {
    tools.add("retrieve_guidance");
  }
  if (
    /unknown|epistemic|meta|blind.?spot|rumsfeld|confidence|readiness|gap|what don.t we know/.test(
      q,
    )
  ) {
    tools.add("run_meta_analysis");
  }

  return Array.from(tools);
}
