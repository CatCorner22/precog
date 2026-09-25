import type { EvidenceRef, PioneerDecision, StructuredBrief, ToolResult } from "./types";
import { readSpofData } from "./spof-data";
import { formatUsd as usd } from "@/lib/utils";

export function fingerprintFromTools(tools: ToolResult[]): string {
  const residual = tools.find((t) => t.tool === "get_residual_portfolio")?.data as
    { averageResidual?: number } | undefined;
  const leading = tools.find((t) => t.tool === "get_leading_indicators")?.data as
    { breached?: number; watch?: number } | undefined;
  return `avg=${residual?.averageResidual ?? "?"};lead=${leading?.breached ?? "?"}/${leading?.watch ?? "?"};tools=${tools.length}`;
}

export function extractEvidence(tools: ToolResult[]): EvidenceRef[] {
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
      const spof = readSpofData(t.data);
      if (spof && !spof.assessed) {
        evidence.push({
          id: `ev-${++i}`,
          kind: "spof",
          label: "Who knows what",
          metric:
            spof.itemCount === 0
              ? "not assessed yet · the register is empty"
              : `not assessed yet · nobody marked on ${spof.itemCount} starter item(s)`,
          link: { tab: "knowledge" },
        });
      }
      for (const row of spof?.assessed ? spof.rows.slice(0, 3) : []) {
        evidence.push({
          id: `ev-${++i}`,
          kind: "spof",
          label: row.name,
          metric: `SPOF · ${row.riskScore ?? "?"} · ${row.owners[0]?.name ?? "unowned"}`,
          link: row.knowledgeId ? { tab: "knowledge", id: row.knowledgeId } : { tab: "knowledge" },
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

export function extractVariableCascades(tools: ToolResult[]): string[] {
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

export function chickenLittleCritique(tools: ToolResult[]): string[] {
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
    | {
        windows: { summary: string; stops: unknown[]; overlaps: unknown[] }[];
        debriefs?: { summary: string }[];
        leavers?: { summary: string; status: "notice" | "gone"; handover: unknown[] }[];
      }
    | undefined;
  for (const w of (leave?.windows ?? []).filter((x) => x.stops.length > 0).slice(0, 2)) {
    warnings.push(w.summary);
  }
  for (const l of (leave?.leavers ?? [])
    .filter((x) => x.status === "gone" || x.handover.length > 0)
    .slice(0, 1)) {
    warnings.push(l.summary);
  }
  for (const d of (leave?.debriefs ?? []).slice(0, 1)) {
    warnings.push(`Debrief due: ${d.summary}`);
  }
  if (!warnings.length) {
    warnings.push("No single red alert — still re-score after staff or insurance change.");
  }
  return warnings;
}

export function localSynthesize(
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

  const spofState = readSpofData(tools.find((t) => t.tool === "get_knowledge_spofs")?.data);
  // Rows only once the register is assessed; before that nothing on it says
  // who can run what, so no cross-training or re-confirming advice applies.
  const spofs = spofState?.assessed ? spofState.rows : null;

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
      person: { id: string; name: string };
      from: string;
      to: string;
      unplanned: boolean;
      daysUntil: number;
      status: "current" | "upcoming";
      handoffBy: string;
      overlaps: { person: { name: string } }[];
      worstStretch: {
        from: string;
        to: string;
        away: { id: string; name: string }[];
        extraStops: string[];
      };
      stops: {
        name: string;
        standIn: { name: string } | null;
        documented: boolean;
        procedureLocation: string | null;
        handoffCommitted: { reviewBy: string | null; overdue: boolean } | null;
      }[];
      remaining: { name: string }[];
      summary: string;
    }[];
    debriefs?: {
      person: { id: string; name: string };
      from: string;
      to: string;
      unplanned?: boolean;
      lengthDays: number;
      items: {
        name: string;
        standIn: { name: string } | null;
        canPromote: boolean;
        handoffOpen: boolean;
        trainingLogged: boolean;
        question: string;
      }[];
      summary: string;
    }[];
    leavers?: {
      person: { id: string; name: string };
      lastDay: string;
      daysLeft: number;
      status: "notice" | "gone";
      handoverBy: string;
      handover: {
        knowledgeId: string;
        name: string;
        criticality: string;
        successor: { name: string } | null;
        documented: boolean;
        procedureLocation: string | null;
        trainingLogged: { reviewBy: string | null } | null;
      }[];
      orphanedProcesses: string[];
      remaining: { name: string }[];
      unlogged: number;
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
    const out = w.unplanned ? "is out unexpectedly" : "is out";
    const cascade = w.unplanned ? "cover while out sick ↑" : "continuity during leave ↑";
    if (open.length === 0 && committed.length > 0) {
      const c = committed[0];
      return [
        {
          action:
            w.status === "current"
              ? `In progress: ${c.name} is covered while ${w.person.name} ${out}${c.handoffCommitted?.reviewBy ? ` — review ${c.handoffCommitted.reviewBy}` : ""}`
              : `In progress: hand-off of ${c.name} before ${w.person.name} is out${c.handoffCommitted?.reviewBy ? ` — review ${c.handoffCommitted.reviewBy}` : ""}`,
          rationale: `You already logged the hand-off in the Journal${committed.length > 1 ? ` (${committed.length} entries)` : ""}. ${w.person.name} is away ${w.from} to ${w.to}; close the entries as done once the stand-in has actually taken it over.`,
          evidenceIds: [] as string[],
          effort: "low" as const,
          horizonDays: Math.max(1, Math.min(REVIEW_HORIZON_DAYS.journal, w.daysUntil)),
          cascadeEffects: [cascade],
        },
      ];
    }
    const first = open[0];
    const noOne = open.filter((s) => !s.standIn);
    const when =
      w.status === "current"
        ? w.unplanned
          ? `${out} today (${w.from}${w.to !== w.from ? ` to ${w.to}` : ""})`
          : "is out now"
        : `is out ${w.from} to ${w.to}, in ${w.daysUntil} day${w.daysUntil === 1 ? "" : "s"}`;
    const procedure = !first.documented
      ? "nothing is written down"
      : first.procedureLocation
        ? `the procedure is at ${first.procedureLocation}`
        : "it is written down but the location is not recorded";
    const coverNow =
      w.status === "current" && first.standIn
        ? ` Tell ${first.standIn.name} today that ${first.name} is theirs for now; ${procedure}.`
        : "";
    const also = w.overlaps.length
      ? ` ${w.overlaps.map((o) => o.person.name).join(" and ")} ${w.overlaps.length === 1 ? "is" : "are"} also away for part of it.`
      : "";
    const othersAway = w.worstStretch.away.filter((p) => p.id !== w.person.id);
    const during =
      w.worstStretch.extraStops.length > 0 && othersAway.length > 0
        ? ` ${w.worstStretch.from} to ${w.worstStretch.to}, while ${othersAway.map((p) => p.name).join(" and ")} ${othersAway.length === 1 ? "is" : "are"} also away`
        : " for the whole absence";
    return [
      {
        action: first.standIn
          ? w.status === "current"
            ? `${first.standIn.name} covers ${first.name} today while ${w.person.name} ${out}${open.length > 1 ? ` — and ${open.length - 1} more` : ""}`
            : `Hand off ${first.name} to ${first.standIn.name} before ${w.person.name} is out${w.status === "upcoming" ? ` (by ${w.handoffBy})` : ""}${open.length > 1 ? ` — and ${open.length - 1} more` : ""}`
          : `Decide who covers ${first.name} while ${w.person.name} ${out}${open.length > 1 ? ` — and ${open.length - 1} more` : ""}`,
        rationale: `${w.person.name} ${when}. ${open.length === 1 ? `${first.name} stops` : `${open.length} register entries stop`}${during}${noOne.length ? `; ${noOne.map((s) => s.name).join(", ")} ${noOne.length === 1 ? "has" : "have"} nobody who can run ${noOne.length === 1 ? "it" : "them"} alone` : ""}.${also}${coverNow}${w.remaining.length ? ` Left in the business: ${w.remaining.map((p) => p.name).join(", ")}.` : " Nobody else is left in the business."}`,
        evidenceIds: [] as string[],
        effort: first.standIn ? ("low" as const) : ("medium" as const),
        horizonDays: Math.max(1, Math.min(REVIEW_HORIZON_DAYS.crossTrain, w.daysUntil)),
        cascadeEffects: [cascade],
      },
    ];
  };
  const leaverDecision = () => {
    const l = leave?.leavers?.[0];
    if (!l) return [];
    const name = l.person.name;
    if (l.status === "gone") {
      return [
        {
          action: `Mark ${name} as left on the register`,
          rationale: `${l.summary} Until then the coverage figures count ${name} as a backup${l.handover.length > 0 ? ` for ${l.handover.length} ${l.handover.length === 1 ? "entry" : "entries"} nobody else can run alone` : ""}; marking them left keeps the record in the history and shows the real gap.`,
          evidenceIds: [] as string[],
          effort: "low" as const,
          horizonDays: 1,
          cascadeEffects: ["register accuracy ↑"],
        },
      ];
    }
    if (l.handover.length === 0 && l.orphanedProcesses.length === 0) return [];
    const horizon = Math.max(1, Math.min(REVIEW_HORIZON_DAYS.crossTrain, l.daysLeft));
    if (l.handover.length === 0) {
      return [
        {
          action: `Name a new owner for ${l.orphanedProcesses[0]}${l.orphanedProcesses.length > 1 ? ` and ${l.orphanedProcesses.length - 1} more` : ""} before ${name} leaves`,
          rationale: `${l.summary} Nothing on the register depends on ${name} alone, but nobody else owns ${l.orphanedProcesses.slice(0, 3).join(", ")}. Decide by ${l.handoverBy}.`,
          evidenceIds: [] as string[],
          effort: "low" as const,
          horizonDays: horizon,
          cascadeEffects: ["continuity after departure ↑"],
        },
      ];
    }
    const open = l.handover.filter((h) => !h.trainingLogged);
    const committed = l.handover.filter((h) => h.trainingLogged);
    if (open.length === 0) {
      const c = committed[0];
      return [
        {
          action: `In progress: ${name}'s hand-over of ${c.name}${committed.length > 1 ? ` and ${committed.length - 1} more` : ""}${c.trainingLogged?.reviewBy ? ` — review ${c.trainingLogged.reviewBy}` : ""}`,
          rationale: `${l.summary} Every entry only ${name} can run alone already has a training step in the Journal; close each as done once the successor can run it, before ${l.lastDay}.`,
          evidenceIds: [] as string[],
          effort: "low" as const,
          horizonDays: horizon,
          cascadeEffects: ["continuity after departure ↑"],
        },
      ];
    }
    const first = open.find((h) => h.criticality === "critical") ?? open[0];
    const noOne = open.filter((h) => !h.successor);
    const unwritten = l.handover.filter((h) => !h.documented);
    const more = open.length - 1;
    return [
      {
        action: first.successor
          ? `Train ${first.successor.name} on ${first.name} before ${name} leaves (by ${l.handoverBy})${more > 0 ? ` — and ${more} more` : ""}`
          : `Decide who takes ${first.name} when ${name} leaves (by ${l.handoverBy})${more > 0 ? ` — and ${more} more` : ""}`,
        rationale: `${l.summary}${noOne.length ? ` ${noOne.map((h) => h.name).join(", ")} ${noOne.length === 1 ? "has" : "have"} nobody to take ${noOne.length === 1 ? "it" : "them"} — hire, outsource or retire ${noOne.length === 1 ? "it" : "them"}.` : ""}${unwritten.length ? ` Have ${name} write down ${unwritten.map((h) => h.name).join(", ")} before the last day; once ${name} has gone, nobody can.` : ""}${l.remaining.length ? ` Left in the business: ${l.remaining.map((p) => p.name).join(", ")}.` : " Nobody else is left in the business."}`,
        evidenceIds: [] as string[],
        effort: first.successor ? ("medium" as const) : ("high" as const),
        horizonDays: horizon,
        cascadeEffects: ["continuity after departure ↑", "continuity residual index ↓"],
      },
    ];
  };
  const debriefDecision = () => {
    const d = leave?.debriefs?.[0];
    if (!d) return [];
    const lead = d.items.find((e) => e.canPromote) ?? d.items[0];
    const more = d.items.length - 1;
    const days = `${d.lengthDays} day${d.lengthDays === 1 ? "" : "s"}`;
    return [
      {
        action: lead.standIn
          ? lead.canPromote
            ? `${d.person.name} is back: can ${lead.standIn.name} run ${lead.name} alone now?${more > 0 ? ` — and ${more} more` : ""}`
            : `${d.person.name} is back: close the ${lead.name} hand-off${more > 0 ? ` — and ${more} more` : ""}`
          : `${d.person.name} is back: who covered ${lead.name}?${more > 0 ? ` — and ${more} more` : ""}`,
        rationale: `${lead.question} ${d.unplanned ? "Unexpected cover" : "Leave"} is the one time a stand-in runs the work for real, so record what it proved: on the register, one click moves them to "can do" (confirmed today) and closes the hand-off; "Not yet" turns those ${days} into a tracked cross-training step instead.`,
        evidenceIds: [] as string[],
        effort: "low" as const,
        horizonDays: REVIEW_HORIZON_DAYS.journal,
        cascadeEffects: ["register accuracy ↑", "continuity residual index ↓"],
      },
    ];
  };
  const registerStartDecision = (itemCount: number): PioneerDecision => ({
    action:
      itemCount === 0
        ? "List the duties, tasks and know-how the business runs on"
        : `Mark who can do each of the ${itemCount} things the business runs on`,
    rationale:
      itemCount === 0
        ? "The register on Who knows what is empty, so nothing yet shows who alone can run what. Until it lists the work, no continuity figure describes this business."
        : "Nobody is marked on the starter register yet, so it cannot show who alone can run what. Mark each item on Who knows what; until then, no continuity figure describes this business.",
    evidenceIds: evidence
      .filter((e) => e.kind === "spof")
      .map((e) => e.id)
      .slice(0, 1),
    effort: "low",
    horizonDays: REVIEW_HORIZON_DAYS.journal,
    cascadeEffects: ["register accuracy ↑"],
  });
  const beamAction = adv?.recommendedSequence?.join(" → ");
  // Entries a leaver must hand over are advised as their hand-over, not as
  // ordinary cross-training on top.
  const handingOver = new Set(
    (leave?.leavers ?? [])
      .filter((l) => l.status === "notice")
      .flatMap((l) => l.handover.map((h) => h.knowledgeId)),
  );
  const ordinarySpofs = spofs?.filter((s) => !s.knowledgeId || !handingOver.has(s.knowledgeId));
  // Steps the owner already logged are followed up, not recommended again.
  const committedSpof = ordinarySpofs?.find((s) => s.committed);
  const commitment = committedSpof?.committed;
  const uncommittedSpof = ordinarySpofs?.find((s) => !s.committed);
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
    ...leaverDecision(),
    ...debriefDecision(),
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
    ...(spofState && !spofState.assessed
      ? [registerStartDecision(spofState.itemCount)]
      : spofs && spofs.length > 0 && !uncommittedSpof
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
