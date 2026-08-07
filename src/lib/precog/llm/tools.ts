/**
 * Grounding tools for the Pioneer LLM.
 * Every answer must pull from these — not freestyle hallucinations.
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
import {
  compareScenarioFutures,
} from "../scoring/scenario-compare";
import {
  DEFAULT_RISK_VARIABLES,
  evaluateDynamicRisk,
  scenarioFlags,
  type RiskVariableState,
} from "../scoring/dynamic-variables";
import type { StaffComposition } from "../types";
import type { ToolName, ToolResult } from "./types";

export interface ToolContext {
  riskVariables?: RiskVariableState;
  staff?: StaffComposition;
  practiceName?: string;
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
  {
    name: "get_practice_snapshot",
    description: "Practice name, staff composition, crime priors.",
    args: "none",
  },
  {
    name: "get_coso_assessment",
    description: "Five COSO component scores, weak principles, priority findings.",
    args: "none",
  },
  {
    name: "get_residual_portfolio",
    description: "Ranked residual risks with inherent/effectiveness/drivers/action bands.",
    args: "none",
  },
  {
    name: "get_knowledge_spofs",
    description: "Critical knowledge single points of failure with owners.",
    args: "none",
  },
  {
    name: "get_knowledge_graph",
    description: "Person↔knowledge continuity graph edges for relationship map.",
    args: "none",
  },
  {
    name: "run_precog_scenario",
    description: "Run one Precog scenario with timeline CI, gross/retained loss, insurance CoR.",
    args: "{ scenarioId?: string }",
  },
  {
    name: "compare_scenario_futures",
    description: "Do-nothing vs mitigations side-by-side for a scenario.",
    args: "{ scenarioId?: string }",
  },
  {
    name: "get_tornado_levers",
    description: "Highest-leverage control changes on average residual.",
    args: "none",
  },
  {
    name: "get_insurance_cost_of_risk",
    description: "Premium, discounts, retained vs transferred under current variables.",
    args: "{ scenarioId?: string }",
  },
  {
    name: "get_sod_conflicts",
    description: "Segregation of duties gaps and compensating controls.",
    args: "none",
  },
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
            crimePrior: {
              annualExposureClass: crimeFraudStats.industryEmbezzlementRate,
              medianDetectionDays: crimeFraudStats.medianDetectionDays,
              midLossRef: crimeFraudStats.typicalLossMid,
              source: crimeFraudStats.source,
            },
          },
          links: [{ tab: "command", label: "Command" }],
        };

      case "get_coso_assessment": {
        const coso = assessCoso();
        return {
          tool,
          ok: true,
          summary: `COSO overall ${coso.overall}/100 (${coso.overallStatus}); ${coso.priorityFindings.length} priority findings`,
          data: {
            overall: coso.overall,
            status: coso.overallStatus,
            components: coso.components.map((c) => ({
              id: c.id,
              name: c.name,
              score: c.score,
              status: c.status,
              weakPrinciples: c.principles
                .filter((p) => p.status === "weak" || p.status === "critical")
                .map((p) => `P${p.number} ${p.name}`),
            })),
            priorityFindings: coso.priorityFindings.slice(0, 6),
          },
          links: [{ tab: "coso", label: "COSO heat map" }],
        };
      }

      case "get_residual_portfolio": {
        const p = portfolioSummary(staff);
        return {
          tool,
          ok: true,
          summary: `Avg residual ${p.averageResidual}; ${p.criticalPath} critical path; top: ${p.top[0]?.name ?? "—"}`,
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
          links: [
            { tab: "residual", label: "Residual radar" },
            ...(p.top[0]?.linkedScenarioId
              ? [
                  {
                    tab: "precog",
                    id: p.top[0].linkedScenarioId,
                    label: "Top linked scenario",
                  },
                ]
              : []),
          ],
        };
      }

      case "get_knowledge_spofs": {
        const risks = findKnowledgeRisks().filter(
          (r) => r.soleOwner || r.ownerCount === 0,
        );
        return {
          tool,
          ok: true,
          summary: `${risks.length} SPOF/unowned critical knowledge item(s)`,
          data: risks.map((r) => ({
            knowledgeId: r.knowledgeId,
            name: r.name,
            soleOwner: r.soleOwner,
            ownerCount: r.ownerCount,
            owners: r.owners.map((o) => ({ id: o.id, name: o.name, role: o.role })),
            riskScore: r.riskScore,
          })),
          links: risks.slice(0, 3).map((r) => ({
            tab: "knowledge",
            id: r.knowledgeId,
            label: r.name,
          })),
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
              role: person?.role,
              knowledgeId: r.knowledgeId,
              knowledgeName: k?.name,
              criticality: k?.criticality,
              level: r.level,
            };
          });
        const risks = findKnowledgeRisks();
        return {
          tool,
          ok: true,
          summary: `${edges.length} strong person→knowledge edges; ${people.length} people; ${knowledge.length} knowledge nodes`,
          data: {
            people: people.map((p) => ({
              id: p.id,
              name: p.name,
              role: p.role,
              tenureYears: p.tenureYears,
            })),
            knowledge: knowledge.map((k) => {
              const risk = risks.find((r) => r.knowledgeId === k.id);
              return {
                id: k.id,
                name: k.name,
                criticality: k.criticality,
                category: k.category,
                ownerCount: risk?.ownerCount ?? 0,
                soleOwner: risk?.soleOwner ?? false,
                riskScore: risk?.riskScore ?? 0,
              };
            }),
            edges,
          },
          links: [{ tab: "knowledge", label: "Knowledge map" }],
        };
      }

      case "run_precog_scenario": {
        const ranked = rankDangerousScenarios({
          staff,
          riskVariables: riskVars,
        });
        const scenarioId =
          (args.scenarioId as string) || ranked[0]?.scenario.id || scenarios[0].id;
        const result = runPrecogScenario(scenarioId, {
          staff,
          riskVariables: riskVars,
        });
        const scenario = scenarios.find((s) => s.id === scenarioId);
        if (!result || !scenario) {
          return {
            tool,
            args,
            ok: false,
            summary: "Scenario not found",
            data: null,
          };
        }
        return {
          tool,
          args: { scenarioId },
          ok: true,
          summary: `${scenario.title}: retained ${usd(result.retainedImpact.expected)}, p50 ${result.timelineDays.p50}d, CoR ${usd(result.dynamic?.expectedAnnualCostOfRisk ?? 0)}`,
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
            mitigations: result.mitigations.map((m) => ({
              id: m.id,
              label: m.label,
              riskReduction: m.riskReduction,
              costAnnual: m.costAnnual,
            })),
          },
          links: [{ tab: "precog", id: scenarioId, label: scenario.title }],
        };
      }

      case "compare_scenario_futures": {
        const ranked = rankDangerousScenarios({ staff, riskVariables: riskVars });
        const scenarioId =
          (args.scenarioId as string) || ranked[0]?.scenario.id || scenarios[0].id;
        const report = compareScenarioFutures(
          scenarioId,
          staff,
          [],
          riskVars,
        );
        return {
          tool,
          args: { scenarioId },
          ok: true,
          summary: `Compared ${report.columns.length} futures; best retained: ${report.columns.find((c) => c.id === report.winnerByRetained)?.label ?? "—"}`,
          data: {
            scenarioId,
            winnerByRetained: report.winnerByRetained,
            winnerByAnnualCor: report.winnerByAnnualCor,
            columns: report.columns.map((c) => ({
              id: c.id,
              label: c.label,
              p50: c.result.timelineDays.p50,
              gross: c.result.financialImpact.expected,
              retained: c.result.retainedImpact?.expected,
              annualCor: c.result.dynamic?.expectedAnnualCostOfRisk,
              premium: c.result.dynamic?.premiumAnnualNet,
            })),
          },
          links: [{ tab: "precog", id: scenarioId, label: "Scenario compare" }],
        };
      }

      case "get_tornado_levers": {
        const t = tornadoSensitivity(staff);
        return {
          tool,
          ok: true,
          summary: `Base avg residual ${t.baseAverage}; top lever: ${t.levers[0]?.label ?? "—"} (−${Math.round(t.levers[0]?.delta ?? 0)})`,
          data: {
            baseAverage: t.baseAverage,
            levers: t.levers,
          },
          links: [{ tab: "residual", label: "Tornado" }],
        };
      }

      case "get_insurance_cost_of_risk": {
        const ranked = rankDangerousScenarios({ staff, riskVariables: riskVars });
        const scenarioId =
          (args.scenarioId as string) || ranked[0]?.scenario.id || scenarios[0].id;
        const scenario = scenarios.find((s) => s.id === scenarioId)!;
        const flags = scenarioFlags(scenarioId);
        const dyn = evaluateDynamicRisk(riskVars, scenario.baseFinancialImpact, flags);
        return {
          tool,
          args: { scenarioId },
          ok: true,
          summary: `Net premium ${usd(dyn.transfer.premiumAnnualNet)} (−${dyn.transfer.discountPctApplied}%); retained EL ${usd(dyn.transfer.retainedExpected)}; CoR ${usd(dyn.transfer.expectedAnnualCostOfRisk)}`,
          data: {
            scenarioId,
            variables: {
              basePremiumAnnual: riskVars.basePremiumAnnual,
              deductible: riskVars.deductible,
              policyLimit: riskVars.policyLimit,
              hasSecurityCameras: riskVars.hasSecurityCameras,
              hasDualControl: riskVars.hasDualControl,
              hasIndependentBankRec: riskVars.hasIndependentBankRec,
            },
            likelihoodSeverity: dyn.likelihoodSeverity,
            transfer: dyn.transfer,
          },
          links: [{ tab: "precog", id: scenarioId, label: "Dynamic variables" }],
        };
      }

      case "get_sod_conflicts": {
        const gaps = controls.filter((c) => !c.segregated);
        return {
          tool,
          ok: true,
          summary: `${gaps.length} SoD gap(s); ${gaps.filter((g) => !g.residualRiskAccepted).length} without residual acceptance`,
          data: gaps.map((g) => ({
            id: g.id,
            name: g.name,
            duties: g.duties,
            compensatingControls: g.compensatingControls,
            residualRiskAccepted: g.residualRiskAccepted,
          })),
          links: [{ tab: "sod", label: "SoD panel" }],
        };
      }

      default:
        return {
          tool,
          ok: false,
          summary: "Unknown tool",
          data: null,
        };
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

/** Plan which tools to run from the owner question (keyword + always-on core). */
export function planTools(question: string): ToolName[] {
  const q = question.toLowerCase();
  const tools = new Set<ToolName>([
    "get_practice_snapshot",
    "get_residual_portfolio",
    "get_knowledge_spofs",
  ]);

  if (/coso|control environment|monitoring|principle/.test(q)) {
    tools.add("get_coso_assessment");
  }
  if (/sod|segregat|duty|duties|write-?off|vendor|payment/.test(q)) {
    tools.add("get_sod_conflicts");
  }
  if (/knowledge|spof|leave|quit|cross-?train|tribal|continuity|who knows/.test(q)) {
    tools.add("get_knowledge_graph");
    tools.add("get_knowledge_spofs");
  }
  if (/scenario|precog|timeline|impact|loss|embezzl|fraud|cash/.test(q)) {
    tools.add("run_precog_scenario");
    tools.add("compare_scenario_futures");
  }
  if (/insurance|premium|deductible|camera|discount|policy|cost of risk/.test(q)) {
    tools.add("get_insurance_cost_of_risk");
  }
  if (/lever|tornado|priority|what first|this week|roi|where start/.test(q)) {
    tools.add("get_tornado_levers");
  }
  if (/accept|residual|tradeoff|trade-off/.test(q)) {
    tools.add("get_sod_conflicts");
    tools.add("get_tornado_levers");
  }

  tools.add("get_coso_assessment");
  tools.add("get_tornado_levers");

  return Array.from(tools);
}
