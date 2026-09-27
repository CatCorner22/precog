/**
 * The coach's tools: deterministic facts about one business, plus retrieval
 * and the app's own models. Each tool is a pure function of the profile.
 * TOOLS is the one registry: its keys are the tool names, and the catalog the
 * model reads is derived from it.
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
import { DEFAULT_RISK_VARIABLES } from "../scoring/dynamic-variables";
import { retrieveKnowledge } from "../rag/retrieve";
import { scoreLeadingIndicators } from "../ml/leading-indicators";
import { casesForSodRules, citingCaseStats } from "../evidence";
import { detectSodConflicts, sodDetectionOptions } from "../sod/detect";
import { runAdvancedReasoning } from "./reasoning/engine";
import { runMetaAnalysis } from "./meta-analysis";
import { defaultProfile, type PracticeProfile } from "../practice-profile";
import { CADENCE_LABEL, processRecordReport } from "../process-record";
import type { ToolName, ToolOutput, ToolResult } from "./types";
import {
  knowledgeSpofs,
  plannedAbsences,
  registerCheckins,
  type ContinuityToolInput,
} from "./continuity-tools";
import {
  compareScenarioFuturesTool,
  insuranceCostOfRisk,
  runPrecogScenarioTool,
  tornadoLevers,
  variableCascades,
  type ScenarioToolInput,
} from "./scenario-tools";
import { formatUsd } from "@/lib/utils";
import { localDateKey } from "../dates";
import { DEFAULT_FRAUD_STATS } from "../templates/shared-controls";

export interface ToolContext {
  /** The business being advised. Every tool is a pure function of this. */
  profile?: PracticeProfile;
  /** The owner's question; retrieve_guidance searches the corpus with it. */
  question?: string;
  /** Owner's local calendar day (YYYY-MM-DD), already validated at the request boundary. */
  today?: string;
}

/** Runs one tool. A tool that throws reports a fixed sentence; the error is logged. */
export function executeTool(tool: ToolName, ctx: ToolContext = {}): ToolResult {
  return runTool(tool, toolInputs(ctx));
}

/** Runs several tools over one set of inputs: the template, ranking and duty conflicts are worked out once. */
export function executeTools(tools: readonly ToolName[], ctx: ToolContext = {}): ToolResult[] {
  const inputs = toolInputs(ctx);
  return tools.map((tool) => runTool(tool, inputs));
}

/**
 * The tools a question needs. Most run for every question; the knowledge
 * graph, the process records and the scenario comparison only when the
 * question is about them.
 */
export function planTools(question: string): ToolName[] {
  const q = question.toLowerCase();
  const tools = new Set<ToolName>(ALWAYS_PLANNED);
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

/** The inputs every tool reads, built once per request; the costly ones on first use. */
interface ToolInputs extends ScenarioToolInput, ContinuityToolInput {
  question?: string;
  sodReport(): ReturnType<typeof detectSodConflicts>;
}

interface ToolSpec {
  description: string;
  run(inputs: ToolInputs): ToolOutput;
}

const TOOLS = {
  get_practice_snapshot: {
    description: "Business name, staff, risk variables, published fraud figures.",
    run: practiceSnapshot,
  },
  get_coso_assessment: {
    description: "Five COSO components and priority findings.",
    run: cosoAssessment,
  },
  get_residual_portfolio: {
    description: "Ranked residual risks with drivers.",
    run: residualPortfolio,
  },
  get_knowledge_spofs: {
    description:
      "Duties and know-how only one person can run alone, plus documentation gaps, with the suggested trainee and next step from the owner's continuity register, whether each entry was confirmed in the last 90 days, and whether the owner has already logged that step in the Journal (with its review date) so it is followed up rather than recommended again.",
    run: knowledgeSpofs,
  },
  get_register_checkins: {
    description:
      "Who the owner should sit down with to re-confirm the continuity register: per active person, the entries not confirmed in 90 days that the register says they can do, and how many of those nobody else can run alone; plus stale entries nobody active holds.",
    run: registerCheckins,
  },
  get_planned_absences: {
    description:
      "Absences from the owner's register that have started or start within 30 days — planned leave and unplanned ones recorded on the day (sick, emergency; `unplanned: true`, speak of these as unexpected cover, never as leave): who is away and when, days of lead time, which duties stop while they (and anyone whose absence overlaps) are out, the stand-in for each, who is left, and whether a hand-off is already logged in the Journal. Also absences that just ended and await a debrief: who covered which duty for how many days, and whether the register can now promote them. Also `leavers`: people who have given notice (last working day, days left, or already past it and still counted as cover), with the hand-over each must complete before they go — every register entry only they can run alone, the successor to train, what is not written down, processes needing a new owner, and which steps are already in the Journal.",
    run: plannedAbsences,
  },
  get_knowledge_graph: {
    description: "Who can do which duty, for every strong person-to-duty link.",
    run: knowledgeGraph,
  },
  get_process_records: {
    description:
      "The process map's continuity record: for each process, how often it runs, which systems it runs in, its owners, and whether a written procedure exists and where it lives. Lists the processes a stand-in could not run from paper, most urgent first (nothing written before written-but-unlocated, then the ones that stop soonest by cadence, then unowned). Use when the owner asks what is written down, what stops if someone is out, or which SOPs to write first.",
    run: processRecords,
  },
  run_precog_scenario: {
    description: "A scenario's assumed timeline, assumed retained loss, and cost-of-risk figure.",
    run: runPrecogScenarioTool,
  },
  compare_scenario_futures: {
    description: "The most dangerous scenario with no change against each mitigation.",
    run: compareScenarioFuturesTool,
  },
  get_tornado_levers: {
    description: "The control changes that move the residual index most.",
    run: tornadoLevers,
  },
  get_insurance_cost_of_risk: {
    description: "Premium, discounts, retained loss, and annual cost of risk.",
    run: insuranceCostOfRisk,
  },
  get_sod_conflicts: {
    description: "The team's open duty conflicts by person, and the controls already in place.",
    run: sodConflicts,
  },
  simulate_variable_cascades: {
    description: "How each lever ripples through the other risk variables.",
    run: variableCascades,
  },
  retrieve_guidance: {
    description:
      "Guidance passages on COSO, duty separation, Lean and fraud that match the question.",
    run: retrieveGuidance,
  },
  get_case_evidence: {
    description:
      "Prosecuted cases from the evidence library that match this business's open duty conflicts: title, sector, loss, duration, how it was found, what would have caught it, and the government source URL.",
    run: caseEvidence,
  },
  get_leading_indicators: {
    description: "Conditions this app watches (watch / breach), with the reason for each.",
    run: leadingIndicators,
  },
  run_advanced_reasoning: {
    description:
      "Lever ordering from this app's own model: which control or insurance lever first, and what to verify next. Weights, not measurements.",
    run: advancedReasoning,
  },
  run_meta_analysis: {
    description:
      "What this app measures directly, what it knows it cannot see, and what lies outside its model.",
    run: metaAnalysis,
  },
} satisfies Record<ToolName, ToolSpec>;

/** Every tool, as the model's prompt lists them. */
export const TOOL_CATALOG: { name: ToolName; description: string }[] = (
  Object.keys(TOOLS) as ToolName[]
).map((name) => ({ name, description: TOOLS[name].description }));

/** Tools every question plans; the duty conflicts are among them, since any brief may need them. */
const ALWAYS_PLANNED: ToolName[] = [
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
  "get_sod_conflicts",
  "run_advanced_reasoning",
  "run_meta_analysis",
  "get_coso_assessment",
  "get_tornado_levers",
  "run_precog_scenario",
];

/** What a failed tool reports to the trace and the model. */
const TOOL_FAILED = "This tool could not run for this business.";

function runTool(tool: ToolName, inputs: ToolInputs): ToolResult {
  try {
    return { tool, ...TOOLS[tool].run(inputs) };
  } catch (error) {
    // Logged in full here; the trace and the model get a fixed sentence,
    // never the internal error text.
    console.error(`[pioneer] tool ${tool} failed`, error);
    return { tool, ok: false, summary: TOOL_FAILED, data: null };
  }
}

function toolInputs(ctx: ToolContext): ToolInputs {
  const profile = ctx.profile ?? defaultProfile();
  const tpl = resolveTemplate(profile);
  const staff = profile.staff;
  const riskVars = profile.riskVariables ?? DEFAULT_RISK_VARIABLES;
  // Starter scenarios count, and run, only once the owner confirms them.
  const confirmed = confirmedScenarioIds(profile.decisions, profile.industry);
  return {
    profile,
    question: ctx.question,
    today: ctx.today ?? localDateKey(new Date()),
    tpl,
    staff,
    riskVars,
    scope: { confirmedScenarioIds: confirmed, riskVariables: riskVars },
    ownBusiness: isOwnBusiness(tpl),
    // The scenario the scenario tools run: the most dangerous one in scope.
    topScenarioId: once(() => {
      const ranked = rankDangerousScenarios(tpl, {
        staff,
        riskVariables: riskVars,
        confirmedScenarioIds: confirmed,
      });
      return ranked[0]?.scenario.id ?? scenariosInScope(tpl, confirmed)[0]?.id ?? null;
    }),
    noScenarioNote: () =>
      starterScenarioNote(tpl, confirmed) ??
      "No scenario is in scope for this business, so no scenario figure applies.",
    sodReport: once(() =>
      detectSodConflicts(tpl, staff, sodDetectionOptions(tpl, profile.dualRelease)),
    ),
  };
}

function once<T>(compute: () => T): () => T {
  let done = false;
  let value: T;
  return () => {
    if (!done) {
      value = compute();
      done = true;
    }
    return value;
  };
}

function practiceSnapshot({ profile, tpl, staff, riskVars }: ToolInputs): ToolOutput {
  const practiceName = profile.practiceName || tpl.businessName;
  const stats = DEFAULT_FRAUD_STATS;
  return {
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
        medianLossSmallOrgUsd: stats.medianLossSmallOrgUsd,
        medianDetectionMonths: stats.medianDetectionMonths,
        medianLossAllUsd: stats.medianLossAllUsd,
        statsSource: stats.source,
      },
    },
  };
}

function cosoAssessment({ profile, tpl, staff, riskVars, scope }: ToolInputs): ToolOutput {
  const coso = assessCoso(tpl, staff, {
    riskVariables: riskVars,
    confirmedScenarioIds: scope.confirmedScenarioIds,
    dualRelease: profile.dualRelease,
  });
  return {
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
  };
}

function residualPortfolio({ tpl, staff, scope }: ToolInputs): ToolOutput {
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
        assumedLoss: t.expectedLoss,
        assumedDaysUntilFound: t.p50Days,
      })),
      basis:
        "assumedLoss and assumedDaysUntilFound are scenario assumptions scaled by this business's settings; not measurements or expected values.",
    },
  };
}

function knowledgeGraph({ tpl }: ToolInputs): ToolOutput {
  const edges = tpl.relations
    .filter((r) => STRONG_LEVELS.has(r.level))
    .map((r) => ({
      personId: r.personId,
      personName: tpl.people.find((p) => p.id === r.personId)?.name,
      knowledgeId: r.knowledgeId,
      knowledgeName: tpl.knowledge.find((x) => x.id === r.knowledgeId)?.name,
      level: r.level,
    }));
  return {
    ok: true,
    summary: `${edges.length} strong edges`,
    data: { edges, peopleCount: tpl.people.length, knowledgeCount: tpl.knowledge.length },
  };
}

function processRecords({ profile, tpl }: ToolInputs): ToolOutput {
  const personName = (id: string) => tpl.people.find((p) => p.id === id)?.name ?? id;
  if (!mapAssessed(profile)) {
    return {
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
    };
  }
  const report = processRecordReport(tpl.processes);
  return {
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
        cadenceAssumed: g.cadenceAssumed,
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
  };
}

/** The team's own duty conflicts, by person, scored the way Who controls what scores them; owner-held pairs are counted apart. */
function sodConflicts({ sodReport }: ToolInputs): ToolOutput {
  const report = sodReport();
  const open = report.conflicts.filter((c) => !c.ownerHeld);
  return {
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
  };
}

function retrieveGuidance({ tpl, question }: ToolInputs): ToolOutput {
  const query =
    question ||
    `${tpl.businessName} residual risk segregation of duties bank reconciliation COSO monitoring`;
  const hits = retrieveKnowledge(query, { topK: 4, industry: tpl.id });
  return {
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
  };
}

function caseEvidence({ sodReport }: ToolInputs): ToolOutput {
  const openRuleIds = [
    ...new Set(
      sodReport()
        .conflicts.filter((c) => !c.residualRiskAccepted && !c.dualReleaseMitigated)
        .map((c) => c.ruleId),
    ),
  ];
  // The count and the median describe only the cases whose own record shows
  // one of these duty pairs, as Start here and the printed report do; cases
  // that merely share a scheme are listed, not counted.
  const citing = citingCaseStats(openRuleIds);
  const cases = casesForSodRules(openRuleIds);
  const citingIds = new Set(citing.cases.map((c) => c.id));
  // The case list is ordered by relevance to the open rules, so the largest
  // loss is found separately rather than read off the top.
  const largest = citing.cases.reduce<(typeof cases)[number] | null>(
    (best, c) => (best === null || c.lossUsd > best.lossUsd ? c : best),
    null,
  );
  return {
    ok: true,
    summary: citing.count
      ? `${citing.count} prosecuted case(s) show the open duty conflicts; median stated loss ${citing.loss ? formatUsd(citing.loss.median) : "n/a"}`
      : cases.length
        ? `No prosecuted case in the library shows these exact duty conflicts; ${cases.length} related case(s) share the same schemes`
        : "No prosecuted case in the library matches the open duty conflicts",
    // Every field here is a fact stated in the cited source, or the library's
    // own tagging of which control would have caught it. Nothing is a rate or
    // a forecast.
    data: {
      matchingCases: citing.count,
      relatedCases: cases.length - citing.count,
      openRuleIds,
      lossRange: citing.loss,
      largest: largest
        ? { title: largest.title, lossUsd: largest.lossUsd, lossIsFloor: largest.lossIsFloor }
        : null,
      detection: {
        known: citing.detection.known,
        unknown: citing.detection.unknown,
        byRoute: citing.detection.byRoute,
      },
      cases: cases.slice(0, 8).map((c) => ({
        id: c.id,
        title: c.title,
        showsTheseDutyConflicts: citingIds.has(c.id),
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
  };
}

function leadingIndicators({ tpl, staff, riskVars }: ToolInputs): ToolOutput {
  const report = scoreLeadingIndicators(tpl, staff, riskVars);
  const breached = report.indicators.filter((i) => i.status === "breach").length;
  const watch = report.indicators.filter((i) => i.status === "watch").length;
  return {
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
  };
}

function advancedReasoning({ tpl, staff, riskVars }: ToolInputs): ToolOutput {
  const report = runAdvancedReasoning(tpl, staff, riskVars);
  return {
    ok: true,
    summary: `Lever ordering: ${report.recommendedSequence.join(" → ") || "status quo"} · verify next: ${report.evoi.topObservation}`,
    // Ordering and reasons only; the weights behind the ordering are not
    // passed on as if measured.
    data: {
      recommendedSequence: report.recommendedSequence,
      bestSingleLever: report.counterfactual.bestIntervention,
      verifyNext: report.evoi.items,
      synthesis: report.synthesis,
      basis: "This app's own weights, not measurements of this business.",
    },
  };
}

function metaAnalysis({ profile }: ToolInputs): ToolOutput {
  const report = runMetaAnalysis(profile);
  const top = (classification: string) =>
    report.items
      .filter((i) => i.classification === classification)
      .slice(0, 5)
      .map((i) => ({ id: i.id, title: i.title, severity: i.severity }));
  return {
    ok: true,
    summary: `What this app can see: ${report.summary.knownKnowns} measured, ${report.summary.knownUnknowns} known gaps, ${report.summary.unknownUnknowns} outside the model`,
    data: {
      summary: report.summary,
      narrative: report.narrative,
      recommendations: report.recommendations,
      topUnknownUnknowns: top("unknown_unknown"),
      topKnownUnknowns: top("known_unknown"),
    },
  };
}
