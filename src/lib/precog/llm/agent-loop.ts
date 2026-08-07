/**
 * Agentic reasoning loop: Plan → Retrieve → Analyze → Specialize → Critique → Synthesize
 */
import {
  executeTool,
  planTools,
  TOOL_CATALOG,
  type ToolContext,
} from "./tools";
import { runSpecialistAgents } from "./multi-agent";
import type {
  AgentRunResult,
  EvidenceRef,
  PioneerDecision,
  ReasoningStep,
  StructuredBrief,
  ToolResult,
} from "./types";

function usd(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function fingerprintFromTools(tools: ToolResult[]): string {
  const residual = tools.find((t) => t.tool === "get_residual_portfolio")?.data as
    | { averageResidual?: number }
    | undefined;
  const anomaly = tools.find((t) => t.tool === "score_anomalies")?.data as
    | { overallScore?: number }
    | undefined;
  const leading = tools.find((t) => t.tool === "get_leading_indicators")?.data as
    | { pressureIndex?: number }
    | undefined;
  return `avg=${residual?.averageResidual ?? "?"};anom=${anomaly?.overallScore ?? "?"};lead=${leading?.pressureIndex ?? "?"};tools=${tools.length}`;
}

function extractEvidence(tools: ToolResult[]): EvidenceRef[] {
  const evidence: EvidenceRef[] = [];
  let i = 0;

  for (const t of tools) {
    if (!t.ok || !t.data) continue;

    if (t.tool === "get_residual_portfolio") {
      const data = t.data as {
        top: {
          name: string;
          residual: number;
          band: string;
          linkedScenarioId?: string;
          linkedKnowledgeId?: string;
        }[];
      };
      for (const row of data.top.slice(0, 4)) {
        evidence.push({
          id: `ev-${++i}`,
          kind: "residual",
          label: row.name,
          metric: `${row.residual}/100 · ${row.band}`,
          link: row.linkedKnowledgeId
            ? { tab: "knowledge", id: row.linkedKnowledgeId }
            : row.linkedScenarioId
              ? { tab: "precog", id: row.linkedScenarioId }
              : { tab: "residual" },
        });
      }
    }

    if (t.tool === "get_knowledge_spofs") {
      const rows = t.data as {
        knowledgeId: string;
        name: string;
        riskScore: number;
        owners: { name: string }[];
      }[];
      for (const row of rows.slice(0, 3)) {
        evidence.push({
          id: `ev-${++i}`,
          kind: "spof",
          label: row.name,
          metric: `SPOF · ${row.riskScore} · ${row.owners[0]?.name ?? "unowned"}`,
          link: { tab: "knowledge", id: row.knowledgeId },
        });
      }
    }

    if (t.tool === "run_precog_scenario") {
      const d = t.data as {
        scenarioId: string;
        title: string;
        retained: { expected: number };
        timelineDays: { p50: number };
        dynamic: { expectedAnnualCostOfRisk: number } | null;
      };
      evidence.push({
        id: `ev-${++i}`,
        kind: "scenario",
        label: d.title,
        metric: `retained ${usd(d.retained.expected)} · p50 ${d.timelineDays.p50}d · CoR ${usd(d.dynamic?.expectedAnnualCostOfRisk ?? 0)}`,
        link: { tab: "precog", id: d.scenarioId },
      });
    }

    if (t.tool === "get_coso_assessment") {
      const d = t.data as { overall: number; status: string };
      evidence.push({
        id: `ev-${++i}`,
        kind: "coso",
        label: `COSO ${d.overall}`,
        metric: d.status,
        link: { tab: "coso" },
      });
    }

    if (t.tool === "get_sod_conflicts") {
      const rows = t.data as { name: string; residualRiskAccepted: boolean }[];
      for (const row of rows.slice(0, 2)) {
        evidence.push({
          id: `ev-${++i}`,
          kind: "sod",
          label: row.name,
          metric: row.residualRiskAccepted ? "accepted" : "open",
          link: { tab: "sod" },
        });
      }
    }

    if (t.tool === "get_insurance_cost_of_risk") {
      const d = t.data as {
        transfer: {
          premiumAnnualNet: number;
          expectedAnnualCostOfRisk: number;
          discountPctApplied: number;
        };
      };
      evidence.push({
        id: `ev-${++i}`,
        kind: "insurance",
        label: "Cost of risk",
        metric: `premium ${usd(d.transfer.premiumAnnualNet)} (−${d.transfer.discountPctApplied}%) · CoR ${usd(d.transfer.expectedAnnualCostOfRisk)}`,
        link: { tab: "precog" },
      });
    }

    if (t.tool === "simulate_variable_cascades") {
      const d = t.data as {
        topByCostOfRisk?: {
          label: string;
          deltaCor: number;
          deltaResidual: number;
        }[];
      };
      for (const row of (d.topByCostOfRisk ?? []).slice(0, 3)) {
        evidence.push({
          id: `ev-${++i}`,
          kind: "cascade",
          label: row.label,
          metric: `ΔCoR ${usd(row.deltaCor)} · Δresidual ${row.deltaResidual.toFixed(1)}`,
          link: { tab: "precog" },
        });
      }
    }

    if (t.tool === "retrieve_guidance") {
      const d = t.data as {
        hits: { id: string; title: string; score: number; domain: string }[];
      };
      for (const h of d.hits.slice(0, 3)) {
        evidence.push({
          id: `ev-${++i}`,
          kind: "rag",
          label: h.title,
          metric: `${h.domain} · score ${h.score}`,
          link: { tab: "intel" },
        });
      }
    }

    if (t.tool === "score_anomalies") {
      const d = t.data as { overallScore: number; band: string };
      evidence.push({
        id: `ev-${++i}`,
        kind: "ml",
        label: `Anomaly ${d.band}`,
        metric: `${d.overallScore}/100`,
        link: { tab: "intel" },
      });
    }

    if (t.tool === "get_leading_indicators") {
      const d = t.data as { pressureIndex: number; band: string };
      evidence.push({
        id: `ev-${++i}`,
        kind: "ml",
        label: `Leading pressure ${d.band}`,
        metric: `${d.pressureIndex}/100`,
        link: { tab: "intel" },
      });
    }


    if (t.tool === "run_advanced_reasoning") {
      const d = t.data as {
        beam: { bestSequence: string; utility: number };
        bayesian: { pFail: number; expectedAnnualLoss: number };
        evoi: { topObservation: string };
        confidence: { score: number; label: string };
      };
      evidence.push({
        id: `ev-${++i}`,
        kind: "reasoning",
        label: "Beam-optimal sequence",
        metric: d.beam.bestSequence || "status quo",
        link: { tab: "intel" },
      });
      evidence.push({
        id: `ev-${++i}`,
        kind: "reasoning",
        label: "Bayesian P(fail)",
        metric: `${(d.bayesian.pFail * 100).toFixed(1)}% · EAL ${usd(d.bayesian.expectedAnnualLoss)}`,
        link: { tab: "intel" },
      });
      evidence.push({
        id: `ev-${++i}`,
        kind: "reasoning",
        label: "Top EVOI observation",
        metric: d.evoi.topObservation,
        link: { tab: "intel" },
      });
      evidence.push({
        id: `ev-${++i}`,
        kind: "reasoning",
        label: "Reasoning confidence",
        metric: `${d.confidence.score} · ${d.confidence.label}`,
        link: { tab: "intel" },
      });
    }

    if (t.tool === "forecast_residual") {
      const d = t.data as {
        points: { residualDoNothing: number; residualWithPlan: number }[];
        planLabel: string;
      };
      const end = d.points[d.points.length - 1];
      evidence.push({
        id: `ev-${++i}`,
        kind: "forecast",
        label: "12-week residual forecast",
        metric: `neglect ${end?.residualDoNothing} vs plan ${end?.residualWithPlan} (${d.planLabel})`,
        link: { tab: "intel" },
      });
    }
  }

  return evidence;
}

function extractVariableCascades(tools: ToolResult[]): string[] {
  const cas = tools.find((t) => t.tool === "simulate_variable_cascades")?.data as
    | {
        baseline?: {
          premiumAnnualNet: number;
          retainedExpected: number;
          expectedAnnualCostOfRisk: number;
          residualAverage: number;
          likelihoodMultiplier: number;
        };
        topByCostOfRisk?: {
          label: string;
          affects: string[];
          secondOrderNotes: string[];
          deltaCor: number;
          deltaRetained: number;
          deltaPremium: number;
          deltaResidual: number;
          deltaP50: number;
          deltaLikelihood: number;
          worsens: string[];
        }[];
        dependencyMap?: { from: string; to: string; effect: string }[];
      }
    | undefined;

  if (!cas?.topByCostOfRisk?.length) {
    return ["Variables are coupled — re-run cascade simulation after profile changes."];
  }

  const lines: string[] = [];
  if (cas.baseline) {
    lines.push(
      `Baseline: likelihood ×${cas.baseline.likelihoodMultiplier.toFixed(2)}, premium ${usd(cas.baseline.premiumAnnualNet)}, retained ${usd(cas.baseline.retainedExpected)}, CoR ${usd(cas.baseline.expectedAnnualCostOfRisk)}, residual ${cas.baseline.residualAverage}.`,
    );
  }
  for (const row of cas.topByCostOfRisk.slice(0, 4)) {
    lines.push(
      `**If you ${row.label}**: CoR ${usd(row.deltaCor)}, retained ${usd(row.deltaRetained)}, premium ${usd(row.deltaPremium)}, residual ${row.deltaResidual >= 0 ? "+" : ""}${row.deltaResidual.toFixed(1)}, p50 ${row.deltaP50 >= 0 ? "+" : ""}${Math.round(row.deltaP50)}d. Also: ${row.affects.slice(0, 3).join("; ")}. ${row.secondOrderNotes[0] ?? ""}`.trim(),
    );
  }
  return lines;
}

function chickenLittleCritique(tools: ToolResult[]): string[] {
  const warnings: string[] = [];
  const residual = tools.find((t) => t.tool === "get_residual_portfolio")?.data as
    | { averageResidual?: number; criticalPath?: number }
    | undefined;
  const leading = tools.find((t) => t.tool === "get_leading_indicators")?.data as
    | { pressureIndex?: number; band?: string }
    | undefined;
  const anomaly = tools.find((t) => t.tool === "score_anomalies")?.data as
    | { band?: string; overallScore?: number }
    | undefined;
  const forecast = tools.find((t) => t.tool === "forecast_residual")?.data as
    | { p50CrossingWeek?: number | null }
    | undefined;
  const scenario = tools.find((t) => t.tool === "run_precog_scenario")?.data as
    | { retained: { expected: number }; timelineDays: { p50: number }; title: string }
    | undefined;

  if ((residual?.averageResidual ?? 0) >= 60) {
    warnings.push(`Avg residual ${residual!.averageResidual} is Act-now territory.`);
  }
  if ((residual?.criticalPath ?? 0) >= 2) {
    warnings.push(`Multiple critical-path residuals (${residual!.criticalPath}).`);
  }
  if (leading && (leading.pressureIndex ?? 0) >= 45) {
    warnings.push(
      `Leading-indicator pressure ${leading.pressureIndex}/100 (${leading.band}) — heat before the loss lands.`,
    );
  }
  if (anomaly && (anomaly.band === "stressed" || anomaly.band === "critical")) {
    warnings.push(
      `ML anomaly band ${anomaly.band} (${anomaly.overallScore}/100) vs healthy practice prior.`,
    );
  }
  if (forecast?.p50CrossingWeek != null) {
    warnings.push(
      `Forecast: residual may cross Act-now around week ${forecast.p50CrossingWeek} if neglected.`,
    );
  }
  if (scenario && scenario.retained.expected > 15000 && scenario.timelineDays.p50 < 90) {
    warnings.push(
      `"${scenario.title}" ~${scenario.timelineDays.p50}d / ${usd(scenario.retained.expected)} retained.`,
    );
  }
  if (!warnings.length) {
    warnings.push("No single red alert — still re-score after staff or insurance change.");
  }
  return warnings;
}

function localSynthesize(
  question: string,
  tools: ToolResult[],
  evidence: EvidenceRef[],
  warnings: string[],
  variableCascades: string[],
  specialistNotes: { agent: string; title: string; bullets: string[] }[],
  advancedReasoning: string[],
): StructuredBrief {
  const snap = tools.find((t) => t.tool === "get_practice_snapshot")?.data as {
    practice: string;
    staff: {
      teamSize: number;
      segregationScore: number;
      dualControlPayments: boolean;
      independentBankRec: boolean;
    };
  } | null;

  const residual = tools.find((t) => t.tool === "get_residual_portfolio")?.data as {
    averageResidual: number;
    scoringVersion: string;
    top: {
      name: string;
      residual: number;
      band: string;
      inherent: number;
      controlEffectiveness: number;
      drivers: { label: string }[];
      expectedLoss?: number;
      p50Days?: number;
    }[];
  } | null;

  const coso = tools.find((t) => t.tool === "get_coso_assessment")?.data as {
    overall: number;
    status: string;
  } | null;

  const leading = tools.find((t) => t.tool === "get_leading_indicators")?.data as {
    pressureIndex: number;
    band: string;
    topActions: string[];
  } | null;

  const anomaly = tools.find((t) => t.tool === "score_anomalies")?.data as {
    overallScore: number;
    band: string;
  } | null;

  const forecast = tools.find((t) => t.tool === "forecast_residual")?.data as {
    planLabel: string;
    points: { residualDoNothing: number; residualWithPlan: number }[];
    narrative: string[];
  } | null;

  const cas = tools.find((t) => t.tool === "simulate_variable_cascades")?.data as {
    topByCostOfRisk?: { label: string; deltaCor: number; affects: string[]; secondOrderNotes: string[] }[];
  } | null;

  const rag = tools.find((t) => t.tool === "retrieve_guidance")?.data as {
    hits: { title: string; text: string }[];
  } | null;

  const spofs = tools.find((t) => t.tool === "get_knowledge_spofs")?.data as {
    name: string;
    owners: { name: string }[];
  }[] | null;

  const top = residual?.top ?? [];
  const bestCascade = cas?.topByCostOfRisk?.[0];
  const adv = tools.find((t) => t.tool === "run_advanced_reasoning")?.data as {
    beam?: { bestSequence?: string; utility?: number };
    recommendedSequence?: string[];
    synthesis?: string[];
    evoi?: { topObservation?: string };
    confidence?: { score?: number; label?: string };
  } | null;
  const advancedLines = advancedReasoning;
  const endFc = forecast?.points[forecast.points.length - 1];

  const highestRisks = top.slice(0, 4).map((t) => {
    const drivers = t.drivers
      .slice(0, 2)
      .map((d) => d.label)
      .join("; ");
    return `**${t.name}** — residual **${t.residual}/100** (${t.band}). Drivers: ${drivers || "n/a"}.`;
  });

  const tradeoffs = [
    `Team size ${snap?.staff.teamSize ?? "?"} — full SoD unlikely; compensating controls + monitoring are the path.`,
    leading
      ? `Leading pressure **${leading.pressureIndex}/100** (${leading.band}). ${leading.topActions[0] ?? ""}`
      : "Score leading indicators for early heat.",
    anomaly
      ? `ML anomaly **${anomaly.band}** (${anomaly.overallScore}/100) vs healthy prior.`
      : "Run anomaly scorer.",
    forecast && endFc
      ? `12-week forecast: neglect residual **${endFc.residualDoNothing}** vs plan **${endFc.residualWithPlan}** (${forecast.planLabel}).`
      : "Forecast residual under plan vs neglect.",
    bestCascade
      ? `Best cascade: **${bestCascade.label}** (ΔCoR ${usd(bestCascade.deltaCor)}). ${bestCascade.secondOrderNotes[0] ?? ""}`
      : "Simulate variable cascades.",
    rag?.hits?.[0]
      ? `RAG: _${rag.hits[0].title}_ — ${rag.hits[0].text.slice(0, 140)}…`
      : "Retrieve control guidance for acceptance language.",
  ];

  const beamAction = adv?.recommendedSequence?.join(" → ") || adv?.beam?.bestSequence;
  const decisions: PioneerDecision[] = [
    {
      action: beamAction || bestCascade?.label || "Enable dual control + independent bank rec",
      rationale: beamAction
        ? `Beam search + Bayesian/counterfactual stack selected this sequence (utility ${adv?.beam?.utility?.toFixed(3) ?? "n/a"}; conf ${adv?.confidence?.score ?? "?"}).`
        : bestCascade
          ? `Cascade + ML agree this moves CoR and residual. ${bestCascade.secondOrderNotes[0] ?? ""}`
          : "Highest coupled impact on opportunity and detection.",
      evidenceIds: evidence
        .filter((e) => e.kind === "cascade" || e.kind === "ml" || e.kind === "forecast")
        .map((e) => e.id)
        .slice(0, 4),
      effort: "medium",
      horizonDays: 14,
      cascadeEffects: bestCascade?.affects?.slice(0, 5),
    },
    {
      action:
        spofs?.[0]
          ? `Cross-train backup for ${spofs[0].name}`
          : "Cross-train top knowledge SPOF",
      rationale: "Continuity SPOFs drive leading pressure and forecast drift.",
      evidenceIds: evidence.filter((e) => e.kind === "spof").map((e) => e.id).slice(0, 2),
      effort: "medium",
      horizonDays: 30,
      cascadeEffects: ["continuity residual ↓", "forecast drift slows"],
    },
    {
      action: "Log residual accept/remediate decisions with review dates",
      rationale: "COSO monitoring requires a trail; ML will keep flagging open gaps.",
      evidenceIds: evidence
        .filter((e) => e.kind === "sod" || e.kind === "rag")
        .map((e) => e.id)
        .slice(0, 2),
      effort: "low",
      horizonDays: 7,
    },
  ];

  const frontierNextMove = bestCascade
    ? `This week: **${bestCascade.label}**, then re-open Intelligence (anomaly + forecast) and confirm leading pressure and 12-week residual path drop.`
    : "This week: dual control + independent bank rec, then re-run Pioneer and Intelligence.";

  const situation = `**${snap?.practice ?? "Practice"}** — COSO **${coso?.overall ?? "?"}/100**, residual **${residual?.averageResidual ?? "?"}/100**, leading **${leading?.pressureIndex ?? "?"}/100**, anomaly **${anomaly?.overallScore ?? "?"}/100**. Dual control ${snap?.staff.dualControlPayments ? "on" : "off"}, bank rec ${snap?.staff.independentBankRec ? "on" : "off"}. Question: _${question}_`;

  const specialistMd = specialistNotes
    .map(
      (n) =>
        `### ${n.title}\n${n.bullets.map((b) => `- ${b}`).join("\n")}`,
    )
    .join("\n\n");

  const markdown = [
    "## Situation",
    situation,
    "",
    "## Highest residual risks",
    ...highestRisks.map((r, i) => `${i + 1}. ${r}`),
    "",
    "## ML signals (anomaly · leading · forecast)",
    `- Anomaly: **${anomaly?.band ?? "n/a"}** (${anomaly?.overallScore ?? "?"}/100)`,
    `- Leading pressure: **${leading?.band ?? "n/a"}** (${leading?.pressureIndex ?? "?"}/100)`,
    forecast && endFc
      ? `- Forecast week-12 residual: neglect **${endFc.residualDoNothing}** vs plan **${endFc.residualWithPlan}**`
      : "- Forecast: n/a",
    ...(forecast?.narrative ?? []).map((n) => `- ${n}`),
    "",
    "## Variable cascades (what else moves)",
    ...variableCascades.map((c) => `- ${c}`),
    "",
    "## Advanced reasoning",
    ...advancedReasoning.map((x) => `- ${x}`),
    "",
    "## Specialist board",
    specialistMd,
    "",
    "## Tradeoffs",
    ...tradeoffs.map((t) => `- ${t}`),
    "",
    "## Recommended moves",
    ...decisions.map((d, i) => {
      const c =
        d.cascadeEffects?.length ? ` *Also moves:* ${d.cascadeEffects.join("; ")}.` : "";
      return `${i + 1}. **${d.action}** (${d.effort} · ${d.horizonDays}d) — ${d.rationale}${c}`;
    }),
    "",
    "## Chicken Little warnings",
    ...warnings.map((w) => `- ${w}`),
    "",
    "## Frontier next move",
    frontierNextMove,
    "",
    "## Evidence anchors",
    ...evidence
      .slice(0, 12)
      .map((e) => `- [${e.id}] **${e.label}** — ${e.metric ?? e.kind} → ${e.link.tab}`),
  ].join("\n");

  return {
    situation,
    highestRisks,
    tradeoffs,
    decisions,
    frontierNextMove,
    chickenLittleWarnings: warnings,
    variableCascades,
    specialistNotes,
    advancedReasoning,
    markdown,
    evidence,
  };
}

export function runLocalAgentLoop(
  question: string,
  ctx: ToolContext = {},
): AgentRunResult {
  const started = Date.now();
  const steps: ReasoningStep[] = [];
  const toolCtx: ToolContext = { ...ctx, question };

  const planned = planTools(question);
  steps.push({
    phase: "plan",
    title: "Plan tool retrieval",
    detail: `${planned.length} tools (RAG + ML + cascades): ${planned.join(", ")}`,
  });

  const toolResults = planned.map((tool) =>
    executeTool(tool, tool === "retrieve_guidance" ? { query: question } : {}, toolCtx),
  );

  steps.push({
    phase: "retrieve",
    title: "Retrieve evidence, RAG, and ML scores",
    detail: toolResults.map((t) => `${t.tool}: ${t.summary}`).join(" | "),
    toolResults,
  });

  const evidence = extractEvidence(toolResults);
  const variableCascades = extractVariableCascades(toolResults);
  steps.push({
    phase: "analyze",
    title: "Analyze residual, cascades, anomaly, forecast",
    detail: `${evidence.length} anchors · ${variableCascades.length} cascade lines`,
  });

  const advTool = toolResults.find((t) => t.tool === "run_advanced_reasoning");
  const advancedReasoning =
    (advTool?.data as { synthesis?: string[] } | undefined)?.synthesis ??
    ["Advanced reasoning tool not in plan."];
  steps.push({
    phase: "reason",
    title: "Advanced reasoning (Bayesian · causal · beam · CF · EVOI)",
    detail: advancedReasoning.join(" · "),
    toolResults: advTool ? [advTool] : undefined,
  });

  const metaTool = toolResults.find((t) => t.tool === "run_meta_analysis");
  const metaData = metaTool?.data as
    | {
        evaluationReadiness?: number;
        epistemicConfidence?: number;
        summary?: { knownUnknowns?: number; unknownUnknowns?: number };
        recommendations?: string[];
      }
    | undefined;
  steps.push({
    phase: "meta",
    title: "Epistemic meta-analysis (known / unknown unknowns)",
    detail: metaData
      ? `Readiness ${metaData.evaluationReadiness} · epistemic ${metaData.epistemicConfidence} · KU ${metaData.summary?.knownUnknowns ?? "?"} · UU ${metaData.summary?.unknownUnknowns ?? "?"}`
      : "Meta-analysis tool not in plan.",
    toolResults: metaTool ? [metaTool] : undefined,
  });

  const specialistNotes = runSpecialistAgents(toolResults);
  steps.push({
    phase: "specialize",
    title: "Multi-agent specialist board",
    detail: specialistNotes.map((n) => n.agent).join(", "),
  });

  const warnings = chickenLittleCritique(toolResults);
  steps.push({
    phase: "critique",
    title: "Chicken Little critique",
    detail: warnings.join(" · "),
  });

  const brief = localSynthesize(
    question,
    toolResults,
    evidence,
    warnings,
    variableCascades,
    specialistNotes,
    advancedReasoning,
  );
  steps.push({
    phase: "synthesize",
    title: "Synthesize multi-agent brief",
    detail: `${brief.decisions.length} decisions · ${brief.specialistNotes.length} specialists`,
  });

  return {
    ok: true,
    source: "local-agent",
    question,
    steps,
    toolsUsed: planned,
    brief,
    contextFingerprint: fingerprintFromTools(toolResults),
    latencyMs: Date.now() - started,
  };
}

export function buildGrokAgentMessages(
  question: string,
  toolResults: ToolResult[],
  warnings: string[],
  evidence: EvidenceRef[],
  variableCascades: string[],
  specialistNotes: { agent: string; title: string; bullets: string[] }[],
  advancedReasoning: string[],
): { role: "system" | "user"; content: string }[] {
  const system = `You are Precog Pioneer — tool-grounded multi-agent coach for small dental practices.
ONLY use TOOL RESULTS. Never invent metrics or accuse people of fraud.

You must integrate:
1) Residual + COSO + SoD facts
2) Variable cascades (coupled insurance/control effects)
3) ML signals: anomaly score, leading indicators, residual forecast
4) RAG guidance snippets (cite chunk titles)
5) Specialist board notes (Operator, Shield, Precog, Critic)
6) Advanced reasoning (Bayesian P(fail), beam sequence, counterfactuals, EVOI)

Output markdown sections:
## Situation
## Highest residual risks
## ML signals (anomaly · leading · forecast)
## Variable cascades (what else moves)
## Advanced reasoning
## Specialist board
## Tradeoffs
## Recommended moves
## Chicken Little warnings
## Frontier next move
## Evidence anchors

Plain-spoken, active voice. Quantify from tools.`;

  const user = `QUESTION: ${question}

TOOLS:
${TOOL_CATALOG.map((t) => `- ${t.name}: ${t.description}`).join("\n")}

TOOL RESULTS JSON:
${JSON.stringify(toolResults.map((t) => ({ tool: t.tool, ok: t.ok, summary: t.summary, data: t.data })))}

CASCADES:
${variableCascades.map((c) => `- ${c}`).join("\n")}

ADVANCED REASONING:
${advancedReasoning.map((x) => `- ${x}`).join("\n")}

SPECIALISTS:
${JSON.stringify(specialistNotes)}

WARNINGS:
${warnings.map((w) => `- ${w}`).join("\n")}

EVIDENCE:
${evidence.map((e) => `- ${e.id}: ${e.label} | ${e.metric}`).join("\n")}

Write the brief.`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

export async function runGrokAgentLoop(
  question: string,
  ctx: ToolContext = {},
): Promise<AgentRunResult> {
  const started = Date.now();
  const local = runLocalAgentLoop(question, ctx);
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return { ...local, latencyMs: Date.now() - started };

  const toolResults =
    local.steps.find((s) => s.phase === "retrieve")?.toolResults ?? [];
  const messages = buildGrokAgentMessages(
    question,
    toolResults,
    local.brief.chickenLittleWarnings,
    local.brief.evidence,
    local.brief.variableCascades,
    local.brief.specialistNotes,
    local.brief.advancedReasoning ?? [],
  );

  try {
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-4.5",
        max_tokens: 2200,
        temperature: 0.3,
        messages,
      }),
    });
    if (!res.ok) return { ...local, latencyMs: Date.now() - started };
    const body = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      model?: string;
    };
    const text = body.choices?.[0]?.message?.content?.trim();
    if (!text) return { ...local, latencyMs: Date.now() - started };

    return {
      ok: true,
      source: "grok-agent",
      model: body.model ?? "grok-4.5",
      question,
      steps: [
        ...local.steps.filter((s) => s.phase !== "synthesize"),
        {
          phase: "synthesize",
          title: "Grok multi-agent synthesis",
          detail: `Model ${body.model ?? "grok-4.5"} over ${toolResults.length} tools incl. RAG/ML`,
        },
      ],
      toolsUsed: local.toolsUsed,
      brief: { ...local.brief, markdown: text },
      contextFingerprint: local.contextFingerprint,
      latencyMs: Date.now() - started,
    };
  } catch {
    return { ...local, latencyMs: Date.now() - started };
  }
}
