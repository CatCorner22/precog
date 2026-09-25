/**
 * Grounding tools for the Pioneer LLM — deterministic practice facts + ML/RAG.
 */
import { describeChunkBasis } from "../rag/corpus";
import { mapAssessed } from "../builder/map-state";
import { industryMeta } from "../industry";
import { assessCoso } from "../coso";
import { resolveTemplate } from "../active-template";
import { rankDangerousScenarios } from "../engine";
import { STRONG_LEVELS } from "../continuity/coverage";
import { portfolioSummary } from "../scoring/residual-engine";
import { DEFAULT_WEIGHTS } from "../scoring/weights";
import {
  confirmedScenarioIds,
  isOwnBusiness,
  scenariosInScope,
  starterScenarioNote,
} from "../scoring/scope";
import { DEFAULT_RISK_VARIABLES, type RiskVariableState } from "../scoring/dynamic-variables";
import { retrieveKnowledge } from "../rag/retrieve";
import { scoreLeadingIndicators } from "../ml/leading-indicators";
import { casesForSodRules, detectionBreakdown, observedLossRange } from "../evidence";
import { detectSodConflicts, sodDetectionOptions } from "../sod/detect";
import { runAdvancedReasoning } from "./reasoning/engine";
import { runMetaAnalysis } from "./meta-analysis";
import { defaultProfile, type PracticeProfile } from "../practice-profile";
import type { StaffComposition } from "../types";
import { CADENCE_LABEL, processRecordReport } from "../process-record";
import type { ToolName, ToolResult } from "./types";
import { knowledgeSpofs, plannedAbsences, registerCheckins } from "./continuity-tools";
import {
  compareScenarioFuturesTool,
  insuranceCostOfRisk,
  runPrecogScenarioTool,
  tornadoLevers,
  variableCascades,
} from "./scenario-tools";
import { formatUsd as usd } from "@/lib/utils";

export interface ToolContext {
  /** The business being advised. Every tool is a pure function of this. */
  profile?: PracticeProfile;
  question?: string;
  /** Owner's local calendar day (YYYY-MM-DD), already validated at the request boundary. */
  today?: string;
}

function profileOf(ctx: ToolContext): PracticeProfile {
  return ctx.profile ?? defaultProfile();
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
    description:
      "Duties and know-how only one person can run alone, plus documentation gaps, with the suggested trainee and next step from the owner's continuity register, whether each entry was confirmed in the last 90 days, and whether the owner has already logged that step in the Journal (with its review date) so it is followed up rather than recommended again.",
    args: "none",
  },
  {
    name: "get_register_checkins",
    description:
      "Who the owner should sit down with to re-confirm the continuity register: per active person, the entries not confirmed in 90 days that the register says they can do, and how many of those nobody else can run alone; plus stale entries nobody active holds.",
    args: "none",
  },
  {
    name: "get_planned_absences",
    description:
      "Absences from the owner's register that have started or start within 30 days — planned leave and unplanned ones recorded on the day (sick, emergency; `unplanned: true`, speak of these as unexpected cover, never as leave): who is away and when, days of lead time, which duties stop while they (and anyone whose absence overlaps) are out, the stand-in for each, who is left, and whether a hand-off is already logged in the Journal. Also absences that just ended and await a debrief: who covered which duty for how many days, and whether the register can now promote them. Also `leavers`: people who have given notice (last working day, days left, or already past it and still counted as cover), with the hand-over each must complete before they go — every register entry only they can run alone, the successor to train, what is not written down, processes needing a new owner, and which steps are already in the Journal.",
    args: "none",
  },
  { name: "get_knowledge_graph", description: "Person↔knowledge continuity edges.", args: "none" },
  {
    name: "get_process_records",
    description:
      "The process map's continuity record: for each process, how often it runs, which systems it runs in, its owners, and whether a written procedure exists and where it lives. Lists the processes a stand-in could not run from paper, most urgent first (nothing written before written-but-unlocated, then the ones that stop soonest by cadence, then unowned). Use when the owner asks what is written down, what stops if someone is out, or which SOPs to write first.",
    args: "none",
  },
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
  const profile = profileOf(ctx);
  const tpl = resolveTemplate(profile);
  const { people, knowledge, relations, crimeFraudStats } = tpl;
  const staff: StaffComposition = profile.staff;
  const practiceName = profile.practiceName || tpl.businessName;
  const riskVars: RiskVariableState = profile.riskVariables ?? DEFAULT_RISK_VARIABLES;
  // Starter scenarios count, and run, only once the owner confirms them.
  const confirmed = confirmedScenarioIds(profile.decisions, profile.industry);
  const scope = { confirmedScenarioIds: confirmed };
  const ownBusiness = isOwnBusiness(tpl);
  /** The scenario a tool runs: the one asked for if it is in scope, else the most dangerous in scope. */
  const scenarioInScope = (asked: unknown): string | null => {
    const inScope = scenariosInScope(tpl, confirmed);
    if (typeof asked === "string" && inScope.some((s) => s.id === asked)) return asked;
    const ranked = rankDangerousScenarios(tpl, {
      staff,
      riskVariables: riskVars,
      confirmedScenarioIds: confirmed,
    });
    return ranked[0]?.scenario.id ?? inScope[0]?.id ?? null;
  };
  /** Returned instead of a scenario result while no scenario is in scope. */
  const noScenario = (): ToolResult => ({
    tool,
    ok: false,
    summary:
      starterScenarioNote(tpl, confirmed) ??
      "No scenario is in scope for this business, so no scenario figure applies.",
    data: null,
  });

  const scenarioInput = {
    tool,
    args,
    tpl,
    staff,
    riskVars,
    scope,
    ownBusiness,
    scenarioInScope,
    noScenario,
  };

  try {
    switch (tool) {
      case "get_practice_snapshot":
        return {
          tool,
          ok: true,
          summary: `${practiceName}: team ${staff.teamSize}, segregation ${staff.segregationScore}/100`,
          data: {
            practice: practiceName,
            industry: tpl.id,
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
        const coso = assessCoso(tpl, staff, {
          riskVariables: riskVars,
          confirmedScenarioIds: confirmed,
          dualRelease: profile.dualRelease,
        });
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
        const p = portfolioSummary(tpl, staff, DEFAULT_WEIGHTS, scope);
        const leftOut = [
          p.knowledgeAssessed ? "" : "register items (not assessed yet)",
          p.starterScenariosLeftOut.length
            ? `${p.starterScenariosLeftOut.length} unconfirmed starter scenario(s)`
            : "",
          p.starterControlsLeftOut.length
            ? `${p.starterControlsLeftOut.length} unconfirmed starter control(s)`
            : "",
        ].filter(Boolean);
        return {
          tool,
          ok: true,
          summary: `Avg residual ${p.averageResidual}; top ${p.top[0]?.name ?? "—"}${
            leftOut.length ? `; left out: ${leftOut.join(", ")}` : ""
          }`,
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

      case "get_knowledge_spofs":
        return knowledgeSpofs({
          tool,
          profile,
          tpl,
          today: ctx.today ?? new Date().toISOString().slice(0, 10),
        });

      case "get_planned_absences":
        return plannedAbsences({
          tool,
          profile,
          tpl,
          today: ctx.today ?? new Date().toISOString().slice(0, 10),
        });

      case "get_register_checkins":
        return registerCheckins({
          tool,
          profile,
          tpl,
          today: ctx.today ?? new Date().toISOString().slice(0, 10),
        });

      case "get_knowledge_graph": {
        const edges = relations
          .filter((r) => STRONG_LEVELS.has(r.level))
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

      case "get_process_records": {
        const personName = (id: string) => people.find((p) => p.id === id)?.name ?? id;
        if (!mapAssessed(profile)) {
          return {
            tool,
            ok: true,
            summary:
              tpl.processes.length === 0
                ? "The process map is not assessed: it is empty, so the owner has not yet listed the processes the business runs. Do not quote map figures; advise the owner to add their processes on How work flows."
                : `The process map is not assessed: it holds ${tpl.processes.length} starter processes from the ${industryMeta(tpl.id).label.toLowerCase()} example with no owner assigned. Do not quote map figures; advise the owner to assign an owner to each process on How work flows, or to build their own map.`,
            data: {
              assessed: false,
              processes: tpl.processes.map((p) => ({
                processId: p.id,
                name: p.name,
                cadence: p.cadence ?? null,
                systems: p.systems ?? [],
                owners: (p.ownerPersonIds ?? []).map(personName),
              })),
            },
            links: [{ tab: "map", label: "How work flows" }],
          };
        }
        const report = processRecordReport(tpl.processes);
        return {
          tool,
          ok: true,
          summary: `${report.total} process(es); ${report.documentedIndex}% have a written, findable procedure; ${report.counts.none} with nothing written down, ${report.counts.unlocated} written but unlocated, ${report.cadenceUnknown} with no cadence recorded`,
          data: {
            documentedIndex: report.documentedIndex,
            counts: report.counts,
            cadenceUnknown: report.cadenceUnknown,
            gaps: report.gaps.map((g) => ({
              processId: g.process.id,
              name: g.process.name,
              state: g.state,
              cadence: g.process.cadence ? CADENCE_LABEL[g.process.cadence] : null,
              stopsWithinDays: g.stopsWithinDays,
              systems: g.process.systems ?? [],
              owners: (g.process.ownerPersonIds ?? []).map(personName),
              unowned: g.unowned,
              nextStep: g.nextStep,
            })),
            processes: tpl.processes.map((p) => ({
              processId: p.id,
              name: p.name,
              cadence: p.cadence ?? null,
              systems: p.systems ?? [],
              owners: (p.ownerPersonIds ?? []).map(personName),
              documented: p.documented ?? null,
              procedureLocation: p.procedureLocation ?? null,
            })),
          },
          links: [{ tab: "map", label: "How work flows" }],
        };
      }

      case "run_precog_scenario":
        return runPrecogScenarioTool(scenarioInput);

      case "compare_scenario_futures":
        return compareScenarioFuturesTool(scenarioInput);

      case "get_tornado_levers":
        return tornadoLevers(scenarioInput);

      case "get_insurance_cost_of_risk":
        return insuranceCostOfRisk(scenarioInput);

      case "get_sod_conflicts": {
        // The team's own duty conflicts, by person, scored the way Who
        // controls what scores them; owner-held pairs are listed apart.
        const report = detectSodConflicts(
          tpl,
          staff,
          sodDetectionOptions(tpl, profile.dualRelease),
        );
        const open = report.conflicts.filter((c) => !c.ownerHeld);
        return {
          tool,
          ok: true,
          summary: `${report.summary.critical} critical, ${report.summary.high} high open duty conflict(s) across ${new Set(open.map((c) => c.personId)).size} people; ${report.summary.ownerHeld} held by the owner; segregation health ${report.summary.segregationHealth}/100`,
          data: open.map((c) => ({
            id: c.id,
            name: `${c.personName} (${c.role}): ${c.title}`,
            person: c.personName,
            role: c.role,
            severity: c.severity,
            duties: [c.labelA, c.labelB],
            score: c.score,
            controlsInPlace: c.controlsInPlace,
            residualRiskAccepted: c.residualRiskAccepted,
            dualReleaseMitigated: c.dualReleaseMitigated,
          })),
          links: [{ tab: "sod", label: "Who controls what" }],
        };
      }

      case "simulate_variable_cascades":
        return variableCascades(scenarioInput);

      case "retrieve_guidance": {
        const query =
          (args.query as string) ||
          ctx.question ||
          `${tpl.businessName} residual risk segregation of duties bank reconciliation COSO monitoring`;
        const hits = retrieveKnowledge(query, { topK: 4, industry: tpl.id });
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
        const sod = detectSodConflicts(
          tpl,
          profile.staff,
          sodDetectionOptions(tpl, profile.dualRelease),
        );
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
        const report = scoreLeadingIndicators(tpl, staff, riskVars);
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
        const report = runAdvancedReasoning(tpl, staff, riskVars);
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
        const report = runMetaAnalysis(profile);
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
    "get_register_checkins",
    "get_planned_absences",
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
  if (/knowledge|spof|leave|quit|cross-?train|continuity|document|written|procedure/.test(q)) {
    tools.add("get_knowledge_graph");
  }
  if (
    /process|procedure|sop|document|written|write.?down|cadence|how often|system|software|stand-?in|cover|out sick|vacation|map|workflow/.test(
      q,
    )
  ) {
    tools.add("get_process_records");
  }
  if (/scenario|timeline|impact|loss|embezzl|fraud|cash|compare/.test(q)) {
    tools.add("compare_scenario_futures");
  }
  return Array.from(tools);
}
