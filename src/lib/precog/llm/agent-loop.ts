/**
 * Agentic reasoning loop for Precog Pioneer.
 * Plan → Retrieve (tools) → Analyze → Critique → Synthesize
 * Dynamic variables and cross-effects are first-class.
 */
import {
  executeTool,
  planTools,
  TOOL_CATALOG,
  type ToolContext,
} from "./tools";
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
  const residual = tools.find((t) => t.tool === "get_residual_portfolio");
  const coso = tools.find((t) => t.tool === "get_coso_assessment");
  const ins = tools.find((t) => t.tool === "get_insurance_cost_of_risk");
  const cas = tools.find((t) => t.tool === "simulate_variable_cascades");
  const rData = residual?.data as
    | { averageResidual?: number; top?: { residual?: number }[] }
    | null;
  const cData = coso?.data as { overall?: number } | null;
  const iData = ins?.data as { transfer?: { expectedAnnualCostOfRisk?: number } } | null;
  const casData = cas?.data as { topByCostOfRisk?: { label?: string }[] } | null;
  return `avg=${rData?.averageResidual ?? "?"};top=${rData?.top?.[0]?.residual ?? "?"};coso=${cData?.overall ?? "?"};cor=${iData?.transfer?.expectedAnnualCostOfRisk ?? "?"};cascade=${casData?.topByCostOfRisk?.[0]?.label?.slice(0, 24) ?? "?"};tools=${tools.length}`;
}

function extractEvidence(tools: ToolResult[]): EvidenceRef[] {
  const evidence: EvidenceRef[] = [];
  let i = 0;

  for (const t of tools) {
    if (!t.ok || !t.data) continue;

    if (t.tool === "get_residual_portfolio") {
      const data = t.data as {
        top: {
          id: string;
          name: string;
          residual: number;
          band: string;
          linkedScenarioId?: string;
          linkedKnowledgeId?: string;
        }[];
      };
      for (const row of data.top.slice(0, 5)) {
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
      for (const row of rows.slice(0, 4)) {
        evidence.push({
          id: `ev-${++i}`,
          kind: "spof",
          label: row.name,
          metric: `SPOF · risk ${row.riskScore} · ${row.owners[0]?.name ?? "unowned"}`,
          link: { tab: "knowledge", id: row.knowledgeId },
        });
      }
    }

    if (t.tool === "run_precog_scenario") {
      const d = t.data as {
        scenarioId: string;
        title: string;
        retained: { expected: number };
        timelineDays: { p50: number; p95Low: number; p95High: number };
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
      const d = t.data as {
        overall: number;
        status: string;
        components: { name: string; score: number; status: string }[];
      };
      const worst = [...d.components].sort((a, b) => a.score - b.score)[0];
      evidence.push({
        id: `ev-${++i}`,
        kind: "coso",
        label: `COSO overall ${d.overall}`,
        metric: worst ? `Weakest: ${worst.name} ${worst.score}` : d.status,
        link: { tab: "coso" },
      });
    }

    if (t.tool === "get_sod_conflicts") {
      const rows = t.data as {
        id: string;
        name: string;
        residualRiskAccepted: boolean;
      }[];
      for (const row of rows.slice(0, 3)) {
        evidence.push({
          id: `ev-${++i}`,
          kind: "sod",
          label: row.name,
          metric: row.residualRiskAccepted ? "residual accepted" : "open gap",
          link: { tab: "sod" },
        });
      }
    }

    if (t.tool === "get_insurance_cost_of_risk") {
      const d = t.data as {
        transfer: {
          premiumAnnualNet: number;
          retainedExpected: number;
          expectedAnnualCostOfRisk: number;
          discountPctApplied: number;
        };
      };
      evidence.push({
        id: `ev-${++i}`,
        kind: "insurance",
        label: "Insurance cost of risk",
        metric: `premium ${usd(d.transfer.premiumAnnualNet)} (−${d.transfer.discountPctApplied}%) · CoR ${usd(d.transfer.expectedAnnualCostOfRisk)}`,
        link: { tab: "precog" },
      });
    }

    if (t.tool === "get_tornado_levers") {
      const d = t.data as { levers: { id: string; label: string; delta: number }[] };
      if (d.levers[0]) {
        evidence.push({
          id: `ev-${++i}`,
          kind: "lever",
          label: d.levers[0].label,
          metric: `−${Math.round(d.levers[0].delta)} avg residual pts`,
          link: { tab: "residual" },
        });
      }
    }

    if (t.tool === "simulate_variable_cascades") {
      const d = t.data as {
        topByCostOfRisk?: {
          label: string;
          deltaCor: number;
          deltaRetained: number;
          deltaPremium: number;
          deltaResidual: number;
          improves: string[];
          worsens: string[];
        }[];
        simulation?: { lever: { label: string }; verdict: string };
      };
      if (d.topByCostOfRisk) {
        for (const row of d.topByCostOfRisk.slice(0, 4)) {
          evidence.push({
            id: `ev-${++i}`,
            kind: "cascade",
            label: row.label,
            metric: `ΔCoR ${usd(row.deltaCor)} · Δretained ${usd(row.deltaRetained)} · Δpremium ${usd(row.deltaPremium)} · Δresidual ${row.deltaResidual.toFixed(1)}`,
            link: { tab: "precog" },
          });
        }
      } else if (d.simulation) {
        evidence.push({
          id: `ev-${++i}`,
          kind: "cascade",
          label: d.simulation.lever.label,
          metric: d.simulation.verdict,
          link: { tab: "precog" },
        });
      }
    }
  }

  return evidence;
}

function extractVariableCascades(tools: ToolResult[]): string[] {
  const cas = tools.find((t) => t.tool === "simulate_variable_cascades")?.data as
    | {
        dependencyMap?: { from: string; to: string; effect: string }[];
        topByCostOfRisk?: {
          label: string;
          affects: string[];
          verdict: string;
          secondOrderNotes: string[];
          deltaCor: number;
          deltaRetained: number;
          deltaPremium: number;
          deltaResidual: number;
          deltaP50: number;
          deltaLikelihood: number;
          improves: string[];
          worsens: string[];
        }[];
        baseline?: {
          premiumAnnualNet: number;
          retainedExpected: number;
          expectedAnnualCostOfRisk: number;
          residualAverage: number;
          likelihoodMultiplier: number;
        };
        coachInstruction?: string;
      }
    | undefined;

  if (!cas?.topByCostOfRisk?.length) {
    return [
      "No cascade simulation in this run — still treat premium, deductible, controls, and residual as coupled.",
    ];
  }

  const lines: string[] = [];
  if (cas.baseline) {
    lines.push(
      `Baseline now: likelihood ×${cas.baseline.likelihoodMultiplier.toFixed(2)}, premium ${usd(cas.baseline.premiumAnnualNet)}, retained EL ${usd(cas.baseline.retainedExpected)}, annual CoR ${usd(cas.baseline.expectedAnnualCostOfRisk)}, avg residual ${cas.baseline.residualAverage}.`,
    );
  }

  for (const row of cas.topByCostOfRisk.slice(0, 5)) {
    const trade =
      row.worsens.length > 0
        ? ` Tradeoffs: ${row.worsens.slice(0, 3).join("; ")}.`
        : " No material in-model tradeoffs.";
    lines.push(
      `**If you ${row.label}**: CoR ${usd(row.deltaCor)}, retained ${usd(row.deltaRetained)}, premium ${usd(row.deltaPremium)}, residual ${row.deltaResidual >= 0 ? "+" : ""}${row.deltaResidual.toFixed(1)}, p50 ${row.deltaP50 >= 0 ? "+" : ""}${Math.round(row.deltaP50)}d, likelihood ${row.deltaLikelihood >= 0 ? "+" : ""}${row.deltaLikelihood.toFixed(2)}. Also moves: ${row.affects.slice(0, 4).join("; ")}.${trade} ${row.secondOrderNotes[0] ?? ""}`.trim(),
    );
  }

  if (cas.dependencyMap?.length) {
    lines.push(
      `Dependency spine: ${cas.dependencyMap
        .slice(0, 6)
        .map((d) => `${d.from}→${d.to} (${d.effect})`)
        .join(" · ")}`,
    );
  }

  return lines;
}

function chickenLittleCritique(tools: ToolResult[]): string[] {
  const warnings: string[] = [];
  const residual = tools.find((t) => t.tool === "get_residual_portfolio")?.data as
    | {
        averageResidual?: number;
        criticalPath?: number;
        top?: { residual: number; name: string }[];
      }
    | undefined;
  const spofs = tools.find((t) => t.tool === "get_knowledge_spofs")?.data as
    | { name: string; riskScore: number }[]
    | undefined;
  const sod = tools.find((t) => t.tool === "get_sod_conflicts")?.data as
    | { residualRiskAccepted: boolean; compensatingControls: string[] }[]
    | undefined;
  const scenario = tools.find((t) => t.tool === "run_precog_scenario")?.data as
    | { retained: { expected: number }; timelineDays: { p50: number }; title: string }
    | undefined;
  const ins = tools.find((t) => t.tool === "get_insurance_cost_of_risk")?.data as
    | {
        variables?: { deductible?: number; policyLimit?: number; hasDualControl?: boolean };
        transfer?: { retainedExpected: number; premiumAnnualNet: number };
      }
    | undefined;
  const cas = tools.find((t) => t.tool === "simulate_variable_cascades")?.data as
    | {
        topByCostOfRisk?: {
          label: string;
          worsens: string[];
          deltaCor: number;
        }[];
      }
    | undefined;

  if ((residual?.criticalPath ?? 0) >= 2) {
    warnings.push(
      `Multiple critical-path residuals (${residual?.criticalPath}) — do not treat this as a single tidy fix.`,
    );
  }
  if ((spofs?.length ?? 0) >= 2) {
    warnings.push(
      `${spofs!.length} knowledge SPOFs — one vacation week can break process and control layers together.`,
    );
  }
  if (sod?.some((g) => !g.residualRiskAccepted && g.compensatingControls.length === 0)) {
    warnings.push(
      "Open SoD gap with no compensating control and no residual acceptance — audit-blind and fraud-open.",
    );
  }
  if (scenario && scenario.retained.expected > 15000 && scenario.timelineDays.p50 < 90) {
    warnings.push(
      `"${scenario.title}" can materialize in ~${scenario.timelineDays.p50} days at ~${usd(scenario.retained.expected)} retained — waiting is an active decision.`,
    );
  }
  if ((residual?.averageResidual ?? 0) >= 60) {
    warnings.push(
      `Portfolio average residual ${residual!.averageResidual} is in Act-now territory — nice-to-haves can wait.`,
    );
  }
  if (ins?.variables?.deductible && ins.variables.deductible >= 10000) {
    warnings.push(
      `Deductible ${usd(ins.variables.deductible)} keeps a large slice of every claim on the practice — premium savings elsewhere may not cover retained EL.`,
    );
  }
  if (ins && !ins.variables?.hasDualControl) {
    warnings.push(
      "Dual control off: carrier credit not earned AND fraud opportunity stays high — insurance and control residual move together.",
    );
  }
  if (cas?.topByCostOfRisk?.some((c) => c.worsens.length >= 2 && c.deltaCor > 0)) {
    warnings.push(
      "Some popular levers worsen annual cost-of-risk under current deductible/premium settings — read cascade tradeoffs before acting.",
    );
  }

  if (warnings.length === 0) {
    warnings.push(
      "No single catastrophe signal — still re-score after any staff, deductible, or control change (variables are coupled).",
    );
  }
  return warnings;
}

function localSynthesize(
  question: string,
  tools: ToolResult[],
  evidence: EvidenceRef[],
  warnings: string[],
  variableCascades: string[],
): StructuredBrief {
  const snap = tools.find((t) => t.tool === "get_practice_snapshot")?.data as {
    practice: string;
    staff: {
      teamSize: number;
      segregationScore: number;
      dualControlPayments: boolean;
      independentBankRec: boolean;
    };
    riskVariables?: {
      deductible: number;
      basePremiumAnnual: number;
      hasSecurityCameras: boolean;
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

  const levers = tools.find((t) => t.tool === "get_tornado_levers")?.data as {
    levers: { label: string; delta: number }[];
  } | null;

  const scenario = tools.find((t) => t.tool === "run_precog_scenario")?.data as {
    title: string;
    retained: { expected: number };
    timelineDays: { p50: number; p95Low: number; p95High: number };
    dynamic: {
      expectedAnnualCostOfRisk: number;
      premiumAnnualNet: number;
      likelihoodMultiplier: number;
      grossSeverityMultiplier: number;
    } | null;
  } | null;

  const ins = tools.find((t) => t.tool === "get_insurance_cost_of_risk")?.data as {
    transfer: {
      premiumAnnualNet: number;
      retainedExpected: number;
      expectedAnnualCostOfRisk: number;
      discountPctApplied: number;
    };
  } | null;

  const cas = tools.find((t) => t.tool === "simulate_variable_cascades")?.data as {
    topByCostOfRisk?: {
      label: string;
      affects: string[];
      secondOrderNotes: string[];
      deltaCor: number;
    }[];
  } | null;

  const spofs = tools.find((t) => t.tool === "get_knowledge_spofs")?.data as {
    name: string;
    owners: { name: string }[];
  }[] | null;

  const top = residual?.top ?? [];
  const lever = levers?.levers?.[0];
  const bestCascade = cas?.topByCostOfRisk?.[0];

  const highestRisks = top.slice(0, 4).map((t) => {
    const drivers = t.drivers
      .slice(0, 2)
      .map((d) => d.label)
      .join("; ");
    return `**${t.name}** — residual **${t.residual}/100** (${t.band}). I ${t.inherent} / E ${t.controlEffectiveness}. Drivers: ${drivers || "n/a"}.${
      t.expectedLoss
        ? ` Linked scenario EL ~${usd(t.expectedLoss)} (p50 ${t.p50Days}d).`
        : ""
    }`;
  });

  const tradeoffs = [
    `Full SoD is unlikely at team size ${snap?.staff.teamSize ?? "?"}. Compensating controls + monitoring beat theater.`,
    "Accept residual risk only when documented, monitored, and re-scored after staff **or insurance variable** changes.",
    lever
      ? `Highest residual lever: **${lever.label}** (≈ −${Math.round(lever.delta)} residual points).`
      : "Re-run tornado levers after any control change.",
    ins
      ? `Insurance now: premium ${usd(ins.transfer.premiumAnnualNet)} (−${ins.transfer.discountPctApplied}% credits), retained EL ${usd(ins.transfer.retainedExpected)}, annual CoR ${usd(ins.transfer.expectedAnnualCostOfRisk)}.`
      : "Open dynamic variables to price transfer terms against residual risk.",
    scenario
      ? `Top Precog path **${scenario.title}**: retained ~${usd(scenario.retained.expected)}, p50 ${scenario.timelineDays.p50}d (95% ${scenario.timelineDays.p95Low}–${scenario.timelineDays.p95High}), likelihood ×${scenario.dynamic?.likelihoodMultiplier?.toFixed(2) ?? "?"}, CoR ~${usd(scenario.dynamic?.expectedAnnualCostOfRisk ?? 0)}.`
      : "Run a Precog scenario before accepting cash-path residual risk.",
    bestCascade
      ? `Best cascade on annual CoR: **${bestCascade.label}** (ΔCoR ${usd(bestCascade.deltaCor)}). Second-order: ${bestCascade.secondOrderNotes[0] ?? bestCascade.affects.slice(0, 2).join("; ")}.`
      : "Simulate variable cascades before changing deductible or stacking controls.",
  ];

  const decisions: PioneerDecision[] = [
    {
      action: bestCascade?.label ?? lever?.label ?? "Raise independent monitoring on cash path",
      rationale:
        bestCascade
          ? `Cascade model: ${bestCascade.secondOrderNotes[0] ?? "improves coupled CoR and residual metrics."}`
          : "Tornado / residual engine ranks this as high leverage on portfolio residual.",
      evidenceIds: evidence
        .filter((e) => e.kind === "cascade" || e.kind === "lever" || e.kind === "residual")
        .map((e) => e.id)
        .slice(0, 4),
      effort: "medium",
      horizonDays: 14,
      cascadeEffects: bestCascade?.affects?.slice(0, 5),
    },
    {
      action:
        spofs && spofs[0]
          ? `Cross-train backup for ${spofs[0].name} (owner: ${spofs[0].owners[0]?.name ?? "none"})`
          : "Document and cross-train top critical knowledge SPOF",
      rationale:
        "Knowledge continuity SPOFs cascade into process and control failures; insurance does not fix tribal knowledge.",
      evidenceIds: evidence.filter((e) => e.kind === "spof").map((e) => e.id).slice(0, 2),
      effort: "medium",
      horizonDays: 30,
      cascadeEffects: [
        "continuity residual ↓",
        "scenario timelines lengthen if knowledge was on critical path",
        "does not by itself unlock premium credits",
      ],
    },
    {
      action: "Re-check deductible vs retained EL after control changes",
      rationale:
        "Changing controls moves likelihood/severity; the same deductible can look smart or reckless after residual drops.",
      evidenceIds: evidence
        .filter((e) => e.kind === "insurance" || e.kind === "cascade")
        .map((e) => e.id)
        .slice(0, 3),
      effort: "low",
      horizonDays: 21,
      cascadeEffects: [
        "retained EL ↔ deductible",
        "annual CoR ↔ premium + annualized retained",
        "real carriers may reprice premium (model holds base premium unless load changes)",
      ],
    },
  ];

  const frontierNextMove = bestCascade
    ? `This week: **${bestCascade.label}**, then re-open Dynamic variables + top Precog scenario and confirm annual CoR, retained EL, and residual all move the way the cascade promised. Variables are coupled — do not stop at one metric.`
    : lever
      ? `This week: execute **${lever.label}**, then re-run insurance cost-of-risk and cascade simulation.`
      : "This week: turn on owner independent bank reconciliation and dual-release over threshold, then re-run cash SoD Precog and cascades.";

  const situation = `**${snap?.practice ?? "Practice"}** — COSO **${coso?.overall ?? "?"}/100** (${coso?.status ?? "n/a"}), average residual **${residual?.averageResidual ?? "?"}/100** (\`${residual?.scoringVersion ?? "n/a"}\`). Staff ${snap?.staff.teamSize ?? "?"}, segregation ${snap?.staff.segregationScore ?? "?"}/100, dual control ${snap?.staff.dualControlPayments ? "on" : "off"}, independent bank rec ${snap?.staff.independentBankRec ? "on" : "off"}${
    snap?.riskVariables
      ? `, deductible ${usd(snap.riskVariables.deductible)}, base premium ${usd(snap.riskVariables.basePremiumAnnual)}, cameras ${snap.riskVariables.hasSecurityCameras ? "on" : "off"}`
      : ""
  }. Owner question grounded: _${question}_`;

  const markdown = [
    "## Situation",
    situation,
    "",
    "## Highest residual risks",
    ...highestRisks.map((r, i) => `${i + 1}. ${r}`),
    "",
    "## Variable cascades (what else moves)",
    ...variableCascades.map((c) => `- ${c}`),
    "",
    "## Tradeoffs",
    ...tradeoffs.map((t) => `- ${t}`),
    "",
    "## Recommended moves",
    ...decisions.map((d, i) => {
      const cascade =
        d.cascadeEffects && d.cascadeEffects.length
          ? ` *Also moves:* ${d.cascadeEffects.join("; ")}.`
          : "";
      return `${i + 1}. **${d.action}** (${d.effort} effort · ${d.horizonDays}d) — ${d.rationale}${cascade}`;
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
      .slice(0, 10)
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

  const planned = planTools(question);
  steps.push({
    phase: "plan",
    title: "Plan tool retrieval",
    detail: `Selected ${planned.length} grounding tools (includes variable cascades): ${planned.join(", ")}`,
  });

  const toolResults: ToolResult[] = planned.map((tool) => executeTool(tool, {}, ctx));

  steps.push({
    phase: "retrieve",
    title: "Retrieve practice evidence + variable state",
    detail: toolResults.map((t) => `${t.tool}: ${t.summary}`).join(" | "),
    toolResults,
  });

  const evidence = extractEvidence(toolResults);
  const variableCascades = extractVariableCascades(toolResults);
  steps.push({
    phase: "analyze",
    title: "Analyze residual pressure + cross-variable cascades",
    detail: `${evidence.length} evidence anchors · ${variableCascades.length} cascade lines (how one change moves the rest).`,
  });

  const warnings = chickenLittleCritique(toolResults);
  steps.push({
    phase: "critique",
    title: "Chicken Little critique (incl. insurance coupling)",
    detail: warnings.join(" · "),
  });

  const brief = localSynthesize(
    question,
    toolResults,
    evidence,
    warnings,
    variableCascades,
  );
  steps.push({
    phase: "synthesize",
    title: "Synthesize frontier brief with cascade section",
    detail: `Structured brief with ${brief.decisions.length} decisions, ${brief.variableCascades.length} cascade notes, ${brief.evidence.length} evidence links.`,
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
): { role: "system" | "user"; content: string }[] {
  const system = `You are Precog Pioneer — the LLM differentiator for small dental practice control coaching.
You ONLY reason from TOOL RESULTS provided. Never invent metrics, names, or losses not in tools.
Never accuse individuals of fraud. Score control design, residual risk, and knowledge continuity only.

CRITICAL — dynamic variables are coupled:
- Changing dual control / bank rec / cameras moves likelihood, severity, detection lag, premium credits, retained loss, annual cost-of-risk, AND residual scores.
- Deductible and policy limit change retained vs transferred without fixing process design.
- Do not recommend a control or insurance change without saying what ELSE moves (use simulate_variable_cascades + get_insurance_cost_of_risk).
- If premium falls but retained rises (or the reverse), call out the tradeoff explicitly.

You run after an agentic retrieve step. Your job is synthesize + coach:
1. Situation (numbers from tools, include current insurance variables)
2. Highest residual risks (cite tool metrics)
3. Variable cascades (what else moves) — REQUIRED section
4. Tradeoffs (SoD reality, insurance transfer, accept vs fix)
5. Recommended moves (actionable, effort, horizon, cascade side-effects)
6. Chicken Little warnings
7. Frontier next move (ONE action for next 7 days; include re-measure step)
8. Evidence anchors (reference evidence ids)

Style: plain-spoken, active voice, frontier scout — not corporate fog.
Output markdown with those ## headings.`;

  const toolPayload = toolResults.map((t) => ({
    tool: t.tool,
    ok: t.ok,
    summary: t.summary,
    data: t.data,
  }));

  const user = `OWNER QUESTION:
${question}

TOOL CATALOG (for your awareness):
${TOOL_CATALOG.map((t) => `- ${t.name}: ${t.description}`).join("\n")}

TOOL RESULTS (JSON):
${JSON.stringify(toolPayload)}

PRE-COMPUTED VARIABLE CASCADE LINES (must use / refine, do not ignore):
${variableCascades.map((w) => `- ${w}`).join("\n")}

CHICKEN LITTLE CRITIQUE (must address):
${warnings.map((w) => `- ${w}`).join("\n")}

EVIDENCE ANCHORS (cite by id when relevant):
${evidence.map((e) => `- ${e.id}: ${e.label} | ${e.metric} | tab=${e.link.tab}`).join("\n")}

Write the structured brief now. Include "## Variable cascades (what else moves)".`;

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
  if (!apiKey) {
    return { ...local, latencyMs: Date.now() - started };
  }

  const toolResults =
    local.steps.find((s) => s.phase === "retrieve")?.toolResults ?? [];
  const warnings = local.brief.chickenLittleWarnings;
  const evidence = local.brief.evidence;
  const variableCascades = local.brief.variableCascades;
  const messages = buildGrokAgentMessages(
    question,
    toolResults,
    warnings,
    evidence,
    variableCascades,
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
        max_tokens: 2000,
        temperature: 0.3,
        messages,
      }),
    });

    if (!res.ok) {
      return { ...local, latencyMs: Date.now() - started };
    }

    const body = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      model?: string;
    };
    const text = body.choices?.[0]?.message?.content?.trim();
    if (!text) {
      return { ...local, latencyMs: Date.now() - started };
    }

    const steps: ReasoningStep[] = [
      ...local.steps.filter((s) => s.phase !== "synthesize"),
      {
        phase: "synthesize",
        title: "Grok synthesis over grounded tools + cascades",
        detail: `Model ${body.model ?? "grok-4.5"} wrote brief from ${toolResults.length} tool payloads including variable cascade coupling.`,
      },
    ];

    return {
      ok: true,
      source: "grok-agent",
      model: body.model ?? "grok-4.5",
      question,
      steps,
      toolsUsed: local.toolsUsed,
      brief: {
        ...local.brief,
        markdown: text,
      },
      contextFingerprint: local.contextFingerprint,
      latencyMs: Date.now() - started,
    };
  } catch {
    return { ...local, latencyMs: Date.now() - started };
  }
}
