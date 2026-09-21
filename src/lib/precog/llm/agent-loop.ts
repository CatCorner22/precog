/**
 * Agentic reasoning loop: Plan → Retrieve → Analyze → Specialize → Critique → Synthesize
 */
import { executeTool, planTools, TOOL_CATALOG, type ToolContext } from "./tools";
import { runSpecialistAgents } from "./multi-agent";
import { grokChat } from "./grok-client.server";
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
    { averageResidual?: number } | undefined;
  const leading = tools.find((t) => t.tool === "get_leading_indicators")?.data as
    { breached?: number; watch?: number } | undefined;
  return `avg=${residual?.averageResidual ?? "?"};lead=${leading?.breached ?? "?"}/${leading?.watch ?? "?"};tools=${tools.length}`;
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
        metric: `assumed retained ${usd(d.retained.expected)} · about ${d.timelineDays.p50}d · CoR ${usd(d.dynamic?.expectedAnnualCostOfRisk ?? 0)}`,
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

    if (t.tool === "get_case_evidence") {
      const d = t.data as {
        matchingCases: number;
        lossRange: { median: number; n: number } | null;
        cases: { title: string; lossUsd: number; lossIsFloor: boolean }[];
      };
      if (d.matchingCases > 0) {
        evidence.push({
          id: `ev-${++i}`,
          kind: "sod",
          label: "Prosecuted cases matching the open gaps",
          metric: d.lossRange
            ? `${d.matchingCases} cases; median stated loss ${usd(d.lossRange.median)}`
            : `${d.matchingCases} cases`,
          link: { tab: "start" },
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

    if (t.tool === "get_leading_indicators") {
      const d = t.data as { breached: number; watch: number };
      evidence.push({
        id: `ev-${++i}`,
        kind: "ml",
        label: "Leading indicators",
        metric: `${d.breached} breached · ${d.watch} at watch`,
        link: { tab: "intel" },
      });
    }

    if (t.tool === "run_advanced_reasoning") {
      const d = t.data as {
        recommendedSequence: string[];
        verifyNext: { observation: string }[];
      };
      evidence.push({
        id: `ev-${++i}`,
        kind: "reasoning",
        label: "Lever order (this app's model)",
        metric: d.recommendedSequence.join(" → ") || "status quo",
        link: { tab: "intel" },
      });
      if (d.verifyNext[0]) {
        evidence.push({
          id: `ev-${++i}`,
          kind: "reasoning",
          label: "Verify next",
          metric: d.verifyNext[0].observation,
          link: { tab: "intel" },
        });
      }
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
    { averageResidual?: number; criticalPath?: number } | undefined;
  const leading = tools.find((t) => t.tool === "get_leading_indicators")?.data as
    { breached?: number; watch?: number } | undefined;
  const scenario = tools.find((t) => t.tool === "run_precog_scenario")?.data as
    { retained: { expected: number }; timelineDays: { p50: number }; title: string } | undefined;

  if ((residual?.averageResidual ?? 0) >= 60) {
    warnings.push(`Avg residual ${residual!.averageResidual} is Act-now territory.`);
  }
  if ((residual?.criticalPath ?? 0) >= 2) {
    warnings.push(`Multiple critical-path residuals (${residual!.criticalPath}).`);
  }
  if (leading && (leading.breached ?? 0) > 0) {
    warnings.push(
      `${leading.breached} leading indicator(s) breached — the conditions that precede a loss are present.`,
    );
  }
  if (scenario && scenario.retained.expected > 15000 && scenario.timelineDays.p50 < 90) {
    warnings.push(
      `"${scenario.title}" assumes ${usd(scenario.retained.expected)} retained about ${scenario.timelineDays.p50} days out (a scenario assumption, not a forecast).`,
    );
  }
  const leave = tools.find((t) => t.tool === "get_planned_absences")?.data as
    { windows: { summary: string; stops: unknown[]; overlaps: unknown[] }[] } | undefined;
  for (const w of (leave?.windows ?? []).filter((x) => x.stops.length > 0).slice(0, 2)) {
    warnings.push(w.summary);
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
    breached: number;
    watch: number;
    topActions: string[];
  } | null;

  const cas = tools.find((t) => t.tool === "simulate_variable_cascades")?.data as {
    topByCostOfRisk?: {
      label: string;
      deltaCor: number;
      affects: string[];
      secondOrderNotes: string[];
    }[];
  } | null;

  const rag = tools.find((t) => t.tool === "retrieve_guidance")?.data as {
    hits: { title: string; text: string }[];
  } | null;

  const spofs = tools.find((t) => t.tool === "get_knowledge_spofs")?.data as
    | {
        name: string;
        knowledgeId?: string;
        owners: { name: string }[];
        suggestedTrainee?: { name: string } | null;
        documented?: boolean;
        stale?: boolean;
        nextStep?: string | null;
        committed?: {
          subject: string;
          trainee: { name: string } | null;
          reviewBy: string | null;
          overdue: boolean;
        } | null;
      }[]
    | null;

  const checkIns = tools.find((t) => t.tool === "get_register_checkins")?.data as {
    checkIns: {
      person: { name: string };
      soleCount: number;
      items: { name: string }[];
    }[];
    unheld: { name: string }[];
  } | null;

  const leave = tools.find((t) => t.tool === "get_planned_absences")?.data as {
    windows: {
      person: { name: string };
      from: string;
      to: string;
      daysUntil: number;
      status: "current" | "upcoming";
      handoffBy: string;
      overlaps: { person: { name: string } }[];
      stops: {
        name: string;
        standIn: { name: string } | null;
        handoffCommitted: { reviewBy: string | null; overdue: boolean } | null;
      }[];
      remaining: { name: string }[];
      summary: string;
    }[];
  } | null;

  const top = residual?.top ?? [];
  const bestCascade = cas?.topByCostOfRisk?.[0];
  const adv = tools.find((t) => t.tool === "run_advanced_reasoning")?.data as {
    recommendedSequence?: string[];
    synthesis?: string[];
  } | null;

  const highestRisks = top.slice(0, 4).map((t) => {
    const drivers = t.drivers
      .slice(0, 2)
      .map((d) => d.label)
      .join("; ");
    return `**${t.name}** — residual **${t.residual}/100** (${t.band}). Drivers: ${drivers || "n/a"}.`;
  });

  // Real losses behind the open gaps. Facts stated in cited sources, so the
  // brief can say what this exposure has cost others without forecasting.
  const caseEv = tools.find((t) => t.tool === "get_case_evidence")?.data as {
    matchingCases: number;
    lossRange: { median: number; low: number; high: number; n: number } | null;
    largest: { title: string; lossUsd: number; lossIsFloor: boolean } | null;
  } | null;
  if (caseEv && caseEv.matchingCases > 0) {
    const largest = caseEv.largest;
    highestRisks.push(
      `**What this has cost other businesses** — ${caseEv.matchingCases} prosecuted ${caseEv.matchingCases === 1 ? "case matches" : "cases match"} the open duty conflicts` +
        (caseEv.lossRange
          ? `; median stated loss ${usd(caseEv.lossRange.median)} across ${caseEv.lossRange.n} with a figure`
          : "") +
        (largest
          ? `. Largest: "${largest.title}" (${largest.lossIsFloor ? "at least " : ""}${usd(largest.lossUsd)}).`
          : ".") +
        " Other organizations, not this one; see Start here for the sources.",
    );
  }

  const tradeoffs = [
    (() => {
      const n = snap?.staff.teamSize;
      if (typeof n !== "number")
        return "Team size unknown — enter your team to see how far duties can be separated.";
      return n <= 6
        ? `Team size ${n} — with this few people, separating every duty is rarely realistic, so compensating controls and owner review carry the load.`
        : `Team size ${n} — enough people to separate the critical duties; resolve the open conflicts before adding compensating controls.`;
    })(),
    leading
      ? `Leading indicators: **${leading.breached} breached**, ${leading.watch} at watch. ${leading.topActions[0] ?? ""}`
      : "Check the leading indicators for conditions that precede a loss.",
    bestCascade
      ? `Best cascade: **${bestCascade.label}** (ΔCoR ${usd(bestCascade.deltaCor)}). ${bestCascade.secondOrderNotes[0] ?? ""}`
      : "Simulate variable cascades.",
    rag?.hits?.[0]
      ? `RAG: _${rag.hits[0].title}_ — ${rag.hits[0].text.slice(0, 140)}…`
      : "Retrieve control guidance for acceptance language.",
  ];

  // Planning cadences, not measurements: how soon the coach suggests reviewing
  // each kind of decision. They become an editable "review by" date in the journal.
  const REVIEW_HORIZON_DAYS = { control: 14, crossTrain: 30, journal: 7 } as const;

  const checkInDecision = (plan: NonNullable<typeof checkIns>["checkIns"]) => {
    const first = plan[0];
    const others = plan.length - 1;
    return {
      action: `Check in with ${first.person.name}: ${first.items.length} register ${first.items.length === 1 ? "entry" : "entries"} to re-confirm${others > 0 ? ` (${others} more ${others === 1 ? "person" : "people"} after that)` : ""}`,
      rationale: `The register says ${first.person.name} can do ${first.items
        .slice(0, 3)
        .map((entry) => entry.name)
        .join(
          ", ",
        )}${first.items.length > 3 ? ` and ${first.items.length - 3} more` : ""}, but nobody has confirmed it in 90+ days${first.soleCount > 0 ? `; ${first.soleCount} of those nobody else can run alone` : ""}. People leave, learn and forget, so the coverage figures above may be false comfort.`,
      evidenceIds: [] as string[],
      effort: "low" as const,
      horizonDays: REVIEW_HORIZON_DAYS.crossTrain,
      cascadeEffects: ["register accuracy ↑"],
    };
  };

  const reconfirmDecision = (stale: { name: string }[], unheld: boolean) => ({
    action: `Re-confirm the register entry for ${stale[0].name}${stale.length > 1 ? ` and ${stale.length - 1} more` : ""}`,
    rationale: unheld
      ? "Nobody on the active team holds these entries and nobody has confirmed them in 90+ days; decide whether they still matter, then assign someone or retire them."
      : "The register says who can run this, but nobody has confirmed it in 90+ days; people leave, learn and forget, so the coverage figures above may be false comfort.",
    evidenceIds: [] as string[],
    effort: "low" as const,
    horizonDays: REVIEW_HORIZON_DAYS.crossTrain,
    cascadeEffects: ["register accuracy ↑"],
  });
  const leaveDecision = () => {
    const w = leave?.windows.find((x) => x.stops.length > 0);
    if (!w) return [];
    const open = w.stops.filter((s) => !s.handoffCommitted);
    const committed = w.stops.filter((s) => s.handoffCommitted);
    if (open.length === 0 && committed.length > 0) {
      const c = committed[0];
      return [
        {
          action: `In progress: hand-off of ${c.name} before ${w.person.name} is out${c.handoffCommitted?.reviewBy ? ` — review ${c.handoffCommitted.reviewBy}` : ""}`,
          rationale: `You already logged the hand-off in the Journal${committed.length > 1 ? ` (${committed.length} entries)` : ""}. ${w.person.name} is away ${w.from} to ${w.to}; close the entries as done once the stand-in has actually taken it over.`,
          evidenceIds: [] as string[],
          effort: "low" as const,
          horizonDays: Math.max(1, Math.min(REVIEW_HORIZON_DAYS.journal, w.daysUntil)),
          cascadeEffects: ["continuity during leave ↑"],
        },
      ];
    }
    const first = open[0];
    const noOne = open.filter((s) => !s.standIn);
    const when =
      w.status === "current"
        ? "is out now"
        : `is out ${w.from} to ${w.to}, in ${w.daysUntil} day${w.daysUntil === 1 ? "" : "s"}`;
    const also = w.overlaps.length
      ? ` ${w.overlaps.map((o) => o.person.name).join(" and ")} ${w.overlaps.length === 1 ? "is" : "are"} also away for part of it.`
      : "";
    return [
      {
        action: first.standIn
          ? `Hand off ${first.name} to ${first.standIn.name} before ${w.person.name} is out${w.status === "upcoming" ? ` (by ${w.handoffBy})` : ""}${open.length > 1 ? ` — and ${open.length - 1} more` : ""}`
          : `Decide who covers ${first.name} while ${w.person.name} is out${open.length > 1 ? ` — and ${open.length - 1} more` : ""}`,
        rationale: `${w.person.name} ${when}. ${open.length === 1 ? `${first.name} stops` : `${open.length} register entries stop`} for the whole absence${noOne.length ? `; ${noOne.map((s) => s.name).join(", ")} ${noOne.length === 1 ? "has" : "have"} nobody who can run ${noOne.length === 1 ? "it" : "them"} alone` : ""}.${also}${w.remaining.length ? ` Left in the business: ${w.remaining.map((p) => p.name).join(", ")}.` : " Nobody else is left in the business."}`,
        evidenceIds: [] as string[],
        effort: first.standIn ? ("low" as const) : ("medium" as const),
        horizonDays: Math.max(1, Math.min(REVIEW_HORIZON_DAYS.crossTrain, w.daysUntil)),
        cascadeEffects: ["continuity during leave ↑"],
      },
    ];
  };
  const beamAction = adv?.recommendedSequence?.join(" → ");
  // Steps the owner already logged are followed up, not recommended again.
  const committedSpof = spofs?.find((s) => s.committed);
  const commitment = committedSpof?.committed;
  const uncommittedSpof = spofs?.find((s) => !s.committed);
  const decisions: PioneerDecision[] = [
    {
      action: beamAction || bestCascade?.label || "Enable dual control + independent bank rec",
      rationale: beamAction
        ? "The order this app's lever model prefers, using its own weights; read it as an ordering, not a measurement."
        : bestCascade
          ? `Cascade + ML agree this moves CoR and residual. ${bestCascade.secondOrderNotes[0] ?? ""}`
          : "Default when no ranking ran: a second signer on payments and an independent bank reconciliation each remove a path one person can use alone.",
      evidenceIds: evidence
        .filter((e) => e.kind === "cascade" || e.kind === "ml" || e.kind === "reasoning")
        .map((e) => e.id)
        .slice(0, 4),
      effort: "medium",
      horizonDays: REVIEW_HORIZON_DAYS.control,
      cascadeEffects: bestCascade?.affects?.slice(0, 5),
    },
    ...leaveDecision(),
    ...(committedSpof && commitment
      ? [
          {
            action: commitment.overdue
              ? `Review overdue: can ${commitment.trainee?.name ?? "the backup"} run ${committedSpof.name} alone yet?`
              : `In progress: ${commitment.trainee?.name ?? "a backup"} on ${committedSpof.name}${commitment.reviewBy ? ` — review ${commitment.reviewBy}` : ""}`,
            rationale: `You already logged "${commitment.subject}" in the Journal, but the register still says only ${committedSpof.owners[0]?.name ?? "one person"} can run it. ${
              commitment.overdue
                ? "Close it as done there — which updates the register — or push the review date if training is still under way."
                : "Nothing new to start; when the training is finished, close it as done in the Journal so the register catches up."
            }`,
            evidenceIds: evidence
              .filter((e) => e.kind === "spof")
              .map((e) => e.id)
              .slice(0, 2),
            effort: "low" as const,
            horizonDays: REVIEW_HORIZON_DAYS.journal,
            cascadeEffects: ["continuity residual index ↓"],
          },
        ]
      : []),
    ...(spofs && spofs.length > 0 && !uncommittedSpof
      ? []
      : [
          {
            action: uncommittedSpof
              ? uncommittedSpof.suggestedTrainee
                ? `Cross-train ${uncommittedSpof.suggestedTrainee.name} on ${uncommittedSpof.name}${uncommittedSpof.owners[0] ? ` with ${uncommittedSpof.owners[0].name}` : ""}`
                : `Cross-train backup for ${uncommittedSpof.name}`
              : "Cross-train top knowledge SPOF",
            rationale:
              uncommittedSpof?.nextStep ??
              "Sole-owner knowledge is the continuity gap the leading indicators watch for.",
            evidenceIds: evidence
              .filter((e) => e.kind === "spof")
              .map((e) => e.id)
              .slice(0, 2),
            effort: uncommittedSpof?.documented ? ("low" as const) : ("medium" as const),
            horizonDays: REVIEW_HORIZON_DAYS.crossTrain,
            cascadeEffects: ["continuity residual index ↓"],
          },
        ]),
    ...(checkIns
      ? [
          ...(checkIns.checkIns[0] ? [checkInDecision(checkIns.checkIns)] : []),
          ...(checkIns.unheld.length > 0 ? [reconfirmDecision(checkIns.unheld, true)] : []),
        ]
      : spofs?.some((s) => s.stale)
        ? [
            reconfirmDecision(
              spofs.filter((s) => s.stale),
              false,
            ),
          ]
        : []),
    {
      action: "Log residual accept/remediate decisions with review dates",
      rationale:
        "COSO monitoring requires a trail; an open gap stays flagged until a decision is recorded.",
      evidenceIds: evidence
        .filter((e) => e.kind === "sod" || e.kind === "rag")
        .map((e) => e.id)
        .slice(0, 2),
      effort: "low",
      horizonDays: REVIEW_HORIZON_DAYS.journal,
    },
  ];

  const frontierNextMove = bestCascade
    ? `This week: **${bestCascade.label}**, then re-check the leading indicators and the residual register.`
    : "This week: dual control + independent bank rec, then re-run Pioneer and re-check the leading indicators.";

  const situation = `**${snap?.practice ?? "Practice"}** — COSO **${coso?.overall ?? "?"}/100**, residual **${residual?.averageResidual ?? "?"}/100**, leading indicators **${leading?.breached ?? "?"} breached**. Dual control ${snap?.staff.dualControlPayments ? "on" : "off"}, bank rec ${snap?.staff.independentBankRec ? "on" : "off"}. Question: _${question}_`;

  const specialistMd = specialistNotes
    .map((n) => `### ${n.title}\n${n.bullets.map((b) => `- ${b}`).join("\n")}`)
    .join("\n\n");

  const markdown = [
    "## Situation",
    situation,
    "",
    "## Highest residual risks",
    ...highestRisks.map((r, i) => `${i + 1}. ${r}`),
    "",
    "## Leading indicators",
    leading
      ? `- **${leading.breached} breached**, ${leading.watch} at watch (thresholds set in this app, not benchmarks)`
      : "- Not checked in this run",
    "",
    "## Variable cascades (what else moves)",
    ...variableCascades.map((c) => `- ${c}`),
    "",
    "## Lever ordering (this app's model)",
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
      const c = d.cascadeEffects?.length ? ` *Also moves:* ${d.cascadeEffects.join("; ")}.` : "";
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

export function runLocalAgentLoop(question: string, ctx: ToolContext = {}): AgentRunResult {
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
    title: "Retrieve evidence, guidance, and indicators",
    detail: toolResults.map((t) => `${t.tool}: ${t.summary}`).join(" | "),
    toolResults,
  });

  const evidence = extractEvidence(toolResults);
  const variableCascades = extractVariableCascades(toolResults);
  steps.push({
    phase: "analyze",
    title: "Analyze residual, cascades, indicators",
    detail: `${evidence.length} anchors · ${variableCascades.length} cascade lines`,
  });

  const advTool = toolResults.find((t) => t.tool === "run_advanced_reasoning");
  const advancedReasoning = (advTool?.data as { synthesis?: string[] } | undefined)?.synthesis ?? [
    "Lever ordering not in plan.",
  ];
  steps.push({
    phase: "reason",
    title: "Lever ordering (this app's model)",
    detail: advancedReasoning.join(" · "),
    toolResults: advTool ? [advTool] : undefined,
  });

  const metaTool = toolResults.find((t) => t.tool === "run_meta_analysis");
  const metaData = metaTool?.data as
    | {
        summary?: { knownKnowns?: number; knownUnknowns?: number; unknownUnknowns?: number };
        recommendations?: string[];
      }
    | undefined;
  steps.push({
    phase: "meta",
    title: "What this app can see (known / unknown unknowns)",
    detail: metaData
      ? `${metaData.summary?.knownKnowns ?? "?"} measured · ${metaData.summary?.knownUnknowns ?? "?"} known gaps · ${metaData.summary?.unknownUnknowns ?? "?"} outside the model`
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
  const system = `You are Precog Pioneer — tool-grounded multi-agent coach for small businesses.
ONLY use TOOL RESULTS. Never invent metrics or accuse people of fraud.

You must integrate:
1) Residual + COSO + SoD facts
2) Variable cascades (coupled insurance/control effects)
3) Leading indicators (conditions at watch or breach; thresholds are this app's, not benchmarks)
4) RAG guidance snippets (cite chunk titles)
5) Specialist board notes (Operator, Shield, Precog, Critic)
6) Lever ordering (this app's model: the order and the reasons, never a probability or dollar figure)
7) Prosecuted cases (get_case_evidence): real losses at other businesses with the same open duty conflicts. Cite a case by its title and publisher, with the loss as stated; never invent, merge, or round a case, and never imply this business has suffered one.

Every scenario figure is an assumption written into the scenario; every 0–100 score is this app's own index. Say so whenever you use one, and never call either a measurement, forecast, expected value, or confidence interval.

Output markdown sections:
## Situation
## Highest residual risks
## What this has cost other businesses
## Leading indicators
## Variable cascades (what else moves)
## Lever ordering (this app's model)
## Specialist board
## Tradeoffs
## Recommended moves
## Chicken Little warnings
## Frontier next move
## Evidence anchors

Plain-spoken, active voice. Use only numbers the tools returned.`;

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

  const toolResults = local.steps.find((s) => s.phase === "retrieve")?.toolResults ?? [];
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
    const response = await grokChat(apiKey, {
      messages,
      maxTokens: 2200,
      temperature: 0.3,
    });
    if (!response) return { ...local, latencyMs: Date.now() - started };

    return {
      ok: true,
      source: "grok-agent",
      model: response.model,
      question,
      steps: [
        ...local.steps.filter((s) => s.phase !== "synthesize"),
        {
          phase: "synthesize",
          title: "Grok multi-agent synthesis",
          detail: `Model ${response.model} over ${toolResults.length} tools incl. RAG/ML`,
        },
      ],
      toolsUsed: local.toolsUsed,
      brief: { ...local.brief, markdown: response.text },
      contextFingerprint: local.contextFingerprint,
      latencyMs: Date.now() - started,
    };
  } catch {
    return { ...local, latencyMs: Date.now() - started };
  }
}
