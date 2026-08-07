/**
 * Agentic reasoning loop for Precog Pioneer.
 * Plan → Retrieve (tools) → Analyze → Critique (Chicken Little) → Synthesize
 *
 * Local path is fully deterministic from tools.
 * Grok path receives tool payloads only (grounded), then writes the brief.
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
  ToolName,
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
  const rData = residual?.data as { averageResidual?: number; top?: { residual?: number }[] } | null;
  const cData = coso?.data as { overall?: number } | null;
  return `avg=${rData?.averageResidual ?? "?"};top=${rData?.top?.[0]?.residual ?? "?"};coso=${cData?.overall ?? "?"};tools=${tools.length}`;
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
      const d = t.data as { overall: number; status: string; components: { name: string; score: number; status: string }[] };
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
      const rows = t.data as { id: string; name: string; residualRiskAccepted: boolean }[];
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
  }

  return evidence;
}

function chickenLittleCritique(tools: ToolResult[]): string[] {
  const warnings: string[] = [];
  const residual = tools.find((t) => t.tool === "get_residual_portfolio")?.data as
    | { averageResidual?: number; criticalPath?: number; top?: { residual: number; name: string }[] }
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
  if (warnings.length === 0) {
    warnings.push(
      "No single catastrophe signal — still re-score after any staff or insurance change.",
    );
  }
  return warnings;
}

function localSynthesize(
  question: string,
  tools: ToolResult[],
  evidence: EvidenceRef[],
  warnings: string[],
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

  const levers = tools.find((t) => t.tool === "get_tornado_levers")?.data as {
    levers: { label: string; delta: number }[];
  } | null;

  const scenario = tools.find((t) => t.tool === "run_precog_scenario")?.data as {
    title: string;
    retained: { expected: number };
    timelineDays: { p50: number; p95Low: number; p95High: number };
    dynamic: { expectedAnnualCostOfRisk: number; premiumAnnualNet: number } | null;
  } | null;

  const compare = tools.find((t) => t.tool === "compare_scenario_futures")?.data as {
    columns: { label: string; retained?: number; annualCor?: number }[];
  } | null;

  const spofs = tools.find((t) => t.tool === "get_knowledge_spofs")?.data as {
    name: string;
    owners: { name: string }[];
  }[] | null;

  const top = residual?.top ?? [];
  const lever = levers?.levers?.[0];

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
    "Accept residual risk only when documented, monitored, and re-scored after staff or insurance changes.",
    lever
      ? `Highest-leverage lever: **${lever.label}** (≈ −${Math.round(lever.delta)} residual points on portfolio average).`
      : "Re-run tornado levers after any control change.",
    scenario
      ? `Top Precog path **${scenario.title}**: retained ~${usd(scenario.retained.expected)}, p50 ${scenario.timelineDays.p50}d (95% ${scenario.timelineDays.p95Low}–${scenario.timelineDays.p95High}), annual CoR ~${usd(scenario.dynamic?.expectedAnnualCostOfRisk ?? 0)}.`
      : "Run a Precog scenario before accepting cash-path residual risk.",
  ];

  if (compare?.columns?.length) {
    const best = [...compare.columns].sort(
      (a, b) => (a.retained ?? 1e12) - (b.retained ?? 1e12),
    )[0];
    if (best) {
      tradeoffs.push(
        `Futures compare winner on retained loss: **${best.label}** (~${usd(best.retained ?? 0)} retained; CoR ~${usd(best.annualCor ?? 0)}).`,
      );
    }
  }

  const decisions: PioneerDecision[] = [
    {
      action: lever?.label ?? "Raise independent monitoring on cash path",
      rationale: "Tornado / residual engine ranks this as high leverage on portfolio residual.",
      evidenceIds: evidence.filter((e) => e.kind === "lever" || e.kind === "residual").map((e) => e.id).slice(0, 3),
      effort: "medium",
      horizonDays: 14,
    },
    {
      action:
        spofs && spofs[0]
          ? `Cross-train backup for ${spofs[0].name} (owner: ${spofs[0].owners[0]?.name ?? "none"})`
          : "Document and cross-train top critical knowledge SPOF",
      rationale: "Knowledge continuity SPOFs cascade into process and control failures.",
      evidenceIds: evidence.filter((e) => e.kind === "spof").map((e) => e.id).slice(0, 2),
      effort: "medium",
      horizonDays: 30,
    },
    {
      action: "Close or formally accept each open SoD gap with a review date",
      rationale: "COSO control activities require either design effectiveness or deliberate residual acceptance.",
      evidenceIds: evidence.filter((e) => e.kind === "sod" || e.kind === "coso").map((e) => e.id).slice(0, 2),
      effort: "low",
      horizonDays: 21,
    },
  ];

  const frontierNextMove = lever
    ? `This week: execute **${lever.label}**, then re-open the top Precog scenario and confirm retained loss and annual cost-of-risk drop. That is the sharpest single cut.`
    : "This week: turn on owner independent bank reconciliation and dual-release over threshold, then re-run cash SoD Precog.";

  const situation = `**${snap?.practice ?? "Practice"}** — COSO **${coso?.overall ?? "?"}/100** (${coso?.status ?? "n/a"}), average residual **${residual?.averageResidual ?? "?"}/100** (\`${residual?.scoringVersion ?? "n/a"}\`). Staff ${snap?.staff.teamSize ?? "?"}, segregation ${snap?.staff.segregationScore ?? "?"}/100, dual control ${snap?.staff.dualControlPayments ? "on" : "off"}, independent bank rec ${snap?.staff.independentBankRec ? "on" : "off"}. Owner question grounded: _${question}_`;

  const markdown = [
    "## Situation",
    situation,
    "",
    "## Highest residual risks",
    ...highestRisks.map((r, i) => `${i + 1}. ${r}`),
    "",
    "## Tradeoffs",
    ...tradeoffs.map((t) => `- ${t}`),
    "",
    "## Recommended moves",
    ...decisions.map(
      (d, i) =>
        `${i + 1}. **${d.action}** (${d.effort} effort · ${d.horizonDays}d) — ${d.rationale}`,
    ),
    "",
    "## Chicken Little warnings",
    ...warnings.map((w) => `- ${w}`),
    "",
    "## Frontier next move",
    frontierNextMove,
    "",
    "## Evidence anchors",
    ...evidence.slice(0, 8).map((e) => `- [${e.id}] **${e.label}** — ${e.metric ?? e.kind} → ${e.link.tab}`),
  ].join("\n");

  return {
    situation,
    highestRisks,
    tradeoffs,
    decisions,
    frontierNextMove,
    chickenLittleWarnings: warnings,
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
    detail: `Selected ${planned.length} grounding tools from question intent: ${planned.join(", ")}`,
  });

  const toolResults: ToolResult[] = planned.map((tool) => {
    const args: Record<string, unknown> = {};
    if (tool === "run_precog_scenario" || tool === "compare_scenario_futures" || tool === "get_insurance_cost_of_risk") {
      // leave scenarioId empty → tools pick top ranked
    }
    return executeTool(tool, args, ctx);
  });

  steps.push({
    phase: "retrieve",
    title: "Retrieve practice evidence",
    detail: toolResults.map((t) => `${t.tool}: ${t.summary}`).join(" | "),
    toolResults,
  });

  const evidence = extractEvidence(toolResults);
  steps.push({
    phase: "analyze",
    title: "Analyze residual, SPOF, and scenario pressure",
    detail: `Extracted ${evidence.length} evidence anchors from tool payloads for citation.`,
  });

  const warnings = chickenLittleCritique(toolResults);
  steps.push({
    phase: "critique",
    title: "Chicken Little critique",
    detail: warnings.join(" · "),
  });

  const brief = localSynthesize(question, toolResults, evidence, warnings);
  steps.push({
    phase: "synthesize",
    title: "Synthesize frontier brief",
    detail: `Structured brief with ${brief.decisions.length} decisions and ${brief.evidence.length} evidence links.`,
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
): { role: "system" | "user"; content: string }[] {
  const system = `You are Precog Pioneer — the LLM differentiator for small dental practice control coaching.
You ONLY reason from TOOL RESULTS provided. Never invent metrics, names, or losses not in tools.
Never accuse individuals of fraud. Score control design, residual risk, and knowledge continuity only.

You run after an agentic retrieve step. Your job is synthesize + coach:
1. Situation (numbers from tools)
2. Highest residual risks (cite tool metrics)
3. Tradeoffs (SoD reality, insurance transfer, accept vs fix)
4. Recommended moves (actionable, effort, horizon)
5. Chicken Little warnings (use the provided critique list; you may sharpen wording)
6. Frontier next move (ONE action for next 7 days)
7. Evidence anchors (reference evidence ids)

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

CHICKEN LITTLE CRITIQUE (must address):
${warnings.map((w) => `- ${w}`).join("\n")}

EVIDENCE ANCHORS (cite by id when relevant):
${evidence.map((e) => `- ${e.id}: ${e.label} | ${e.metric} | tab=${e.link.tab}`).join("\n")}

Write the structured brief now.`;

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
  const messages = buildGrokAgentMessages(question, toolResults, warnings, evidence);

  try {
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-4.5",
        max_tokens: 1800,
        temperature: 0.3,
        messages,
      }),
    });

    if (!res.ok) {
      return {
        ...local,
        latencyMs: Date.now() - started,
      };
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
        title: "Grok synthesis over grounded tools",
        detail: `Model ${body.model ?? "grok-4.5"} wrote brief from ${toolResults.length} tool payloads (no freestyle inventing).`,
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

export type { ToolName };
