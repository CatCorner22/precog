import type { EvidenceRef, PioneerDecision, StructuredBrief, ToolResult } from "./types";
import { readSpofData } from "./spof-data";
import { describeScenarioFigures, type ScenarioRunData } from "./scenario-tools";
import { formatEstimateUsd, formatEstimateUsdDelta, formatUsd, formatUsdDelta } from "@/lib/utils";
import { joinWithAnd, verb, count } from "../text";
import { clamp } from "../number";
import { lossPhrase } from "../evidence";
import { RISK_SCALE } from "../scoring/bands";
import { RESIDUAL_BAND_LABEL, bandForScore } from "../scoring/weights";

/**
 * The brief's sections, in reading order: the answer first (what to do this
 * week, the moves, the warnings), then the figures behind it. The rules brief
 * writes them and the model is asked for the same list.
 */
export const BRIEF_SECTION = {
  answer: "Answer",
  situation: "Situation",
  thisWeek: "This week",
  moves: "Recommended moves",
  warnings: "Warnings",
  risks: "Biggest open risks",
  cases: "What this has cost other businesses",
  cascades: "What else moves",
  limits: "Limits",
} as const;

export function leverAction(label: string): string {
  if (!label.endsWith(" (stack)")) return label;
  const parts = label
    .slice(0, -" (stack)".length)
    .split(/\s+\+\s+/)
    .map((part) => part.charAt(0).toLowerCase() + part.slice(1));
  return `Put ${joinWithAnd(parts)} in place together`;
}

export function destack(text: string): string {
  const wording = (first: string, second: string, third: string) =>
    `${first}, ${joinWithAnd(
      [second, third].map((part) => part.charAt(0).toLowerCase() + part.slice(1)),
    )} together`;
  return text
    .replace(
      /([^\n]*?)\s+\+\s+([^+\n]+)\s+\+\s+([^+\n]+) \(stack\)/g,
      (_match, first, second, third) => wording(first, second, third),
    )
    .replace(/([^\n]*?),\s*([^,\n]+),\s*([^,\n]+) \(stack\)/g, (_match, first, second, third) =>
      wording(first, second, third),
    );
}

/**
 * When a warning fires. Every threshold is this app's own choice, not a
 * benchmark, and the text that quotes one says so.
 */
export const WARNING_RULES = {
  /** The risk index's "act now" band (scoring/bands). */
  averageResidual: RISK_SCALE.actNow,
  /** One critical-path risk is on the register already; two or more is a pattern. */
  criticalPathCount: 2,
  /** A scenario loss this app treats as large for a small business... */
  scenarioRetainedUsd: 15_000,
  /** ...assumed to surface within a quarter. */
  scenarioDaysUntilFound: 90,
  /** At this team size or below, separating every duty is rarely realistic. */
  smallTeamSize: 6,
} as const;

/** The warning when nothing crosses a threshold; the critic lens says the same. */
export const NO_ALERT_WARNING =
  "Nothing is at a red alert; check again after a team or insurance change.";

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
              : `not assessed yet · nobody marked on ${spof.itemCount} sample item(s)`,
          link: { tab: "knowledge" },
        });
      }
      for (const row of spof?.assessed ? spof.rows.slice(0, 3) : []) {
        evidence.push({
          id: `ev-${++i}`,
          kind: "spof",
          label: row.name,
          metric: row.owners[0]
            ? `only ${row.owners[0].name} can run it · risk index ${row.riskScore ?? "?"}/100`
            : `nobody can run it · risk index ${row.riskScore ?? "?"}/100`,
          link: row.knowledgeId ? { tab: "knowledge", id: row.knowledgeId } : { tab: "knowledge" },
        });
      }
    }

    if (t.tool === "run_precog_scenario") {
      const d = t.data as ScenarioRunData;
      evidence.push({
        id: `ev-${++i}`,
        kind: "scenario",
        label: d.title,
        metric: describeScenarioFigures(d),
        link: { tab: "precog", id: d.scenarioId },
      });
    }

    if (t.tool === "get_coso_assessment") {
      const d = t.data as { gaps: number; notAssessed: number; principles: number };
      evidence.push({
        id: `ev-${++i}`,
        kind: "coso",
        label: "Coverage check",
        metric: `${d.gaps} of ${d.principles} with a gap · ${d.notAssessed} not assessed`,
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
            ? `${d.matchingCases} cases; median stated loss ${formatUsd(d.lossRange.median)}`
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
        metric: `premium ${formatUsd(d.transfer.premiumAnnualNet)} (${d.transfer.discountPctApplied}% discount)`,
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
          metric: `risk index ${row.deltaResidual >= 0 ? "+" : ""}${row.deltaResidual.toFixed(1)}`,
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
          metric: "control guidance",
          link: { tab: "intel" },
        });
      }
    }

    if (t.tool === "get_leading_indicators") {
      const d = t.data as { breached: number; watch: number };
      evidence.push({
        id: `ev-${++i}`,
        kind: "ml",
        label: "Watched conditions",
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
        label: "Lever order (Precog's model)",
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
    return [
      "The premium, the deductible and the controls move together; run the what-else-moves check again after you change one.",
    ];
  }

  const lines: string[] = [];
  if (cas.baseline) {
    lines.push(
      `Baseline: likelihood ×${cas.baseline.likelihoodMultiplier.toFixed(2)}, premium ${formatUsd(cas.baseline.premiumAnnualNet)}, assumed retained ${formatEstimateUsd(cas.baseline.retainedExpected)}, risk index ${cas.baseline.residualAverage}.`,
    );
  }
  for (const [index, row] of cas.topByCostOfRisk.slice(0, 4).entries()) {
    const parts: string[] = [];
    const riskDelta = Number(row.deltaResidual.toFixed(1));
    if (riskDelta !== 0) {
      parts.push(
        `risk index ${Number.isInteger(riskDelta) ? Math.abs(riskDelta) : Math.abs(riskDelta).toFixed(1)} points ${riskDelta < 0 ? "lower" : "higher"}`,
      );
    }
    const days = Math.round(row.deltaP50);
    if (days !== 0) parts.push(`found ${Math.abs(days)} days ${days < 0 ? "sooner" : "later"}`);
    const retained = formatEstimateUsdDelta(row.deltaRetained);
    if (row.deltaRetained !== 0 && !retained.includes("$0")) {
      parts.push(`assumed retained ${retained}`);
    }
    const premium = formatUsdDelta(row.deltaPremium);
    if (row.deltaPremium !== 0 && !premium.includes("$0")) parts.push(`premium ${premium}`);
    const changes = parts.length ? parts.join(", ") : "no change in Precog's figures";
    const affects = row.affects.slice(0, 3).join("; ");
    const secondOrder = index === 0 ? row.secondOrderNotes[0] : undefined;
    lines.push(
      `**${leverAction(row.label)}**: ${changes}.${affects ? ` Also: ${affects}.` : ""}${secondOrder ? ` ${secondOrder}` : ""}`,
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
    ScenarioRunData | undefined;

  if ((residual?.averageResidual ?? 0) >= WARNING_RULES.averageResidual) {
    warnings.push(
      `The average risk index is ${residual!.averageResidual}/100, in the "${bandForScore(residual!.averageResidual!).label}" band on Precog's own index (Precog warns at ${WARNING_RULES.averageResidual} or more).`,
    );
  }
  if ((residual?.criticalPath ?? 0) >= WARNING_RULES.criticalPathCount) {
    warnings.push(
      `${residual!.criticalPath} risks are in the "${RESIDUAL_BAND_LABEL.critical_path}" band.`,
    );
  }
  if (leading && (leading.breached ?? 0) > 0) {
    warnings.push(`${count(leading.breached!, "watched condition")} breached.`);
  }
  if (
    scenario &&
    scenario.retained.expected > WARNING_RULES.scenarioRetainedUsd &&
    scenario.timelineDays.p50 < WARNING_RULES.scenarioDaysUntilFound
  ) {
    warnings.push(
      `"${scenario.title}" assumes ${formatEstimateUsd(scenario.retained.expected)} retained, found about ${scenario.timelineDays.p50} days in (a scenario assumption, not a forecast; Precog warns above ${formatUsd(WARNING_RULES.scenarioRetainedUsd)} found within ${WARNING_RULES.scenarioDaysUntilFound} days).`,
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
    warnings.push(NO_ALERT_WARNING);
  }
  return warnings;
}

export function localSynthesize(
  _question: string,
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
    gaps: number;
    principles: number;
  } | null;

  const leading = tools.find((t) => t.tool === "get_leading_indicators")?.data as {
    breached: number;
    watch: number;
    topActions: string[];
  } | null;

  const scenario = tools.find((t) => t.tool === "run_precog_scenario")
    ?.data as ScenarioRunData | null;

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
        successor: { id: string; name: string } | null;
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

  const highestRisks = top.slice(0, 3).map((t) => {
    const drivers = t.drivers
      .filter((d) => !["severity level", "likelihood level"].includes(d.label.trim().toLowerCase()))
      .slice(0, 2)
      .map((d) => d.label)
      .join("; ");
    return `**${t.name}**: risk index **${t.residual}/100** (${t.band}).${drivers ? ` Drivers: ${drivers}.` : ""}`;
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
      `**${BRIEF_SECTION.cases}**: ${caseEv.matchingCases} prosecuted ${verb(caseEv.matchingCases, "case matches", "cases match")} these conflicts` +
        (caseEv.lossRange
          ? `; median stated loss ${formatUsd(caseEv.lossRange.median)} across ${caseEv.lossRange.n} cases`
          : "") +
        (largest ? `; largest ${lossPhrase(largest)}` : "") +
        ". Not this business; see Start here.",
    );
  }

  const tradeoffs = [
    (() => {
      const n = snap?.staff.teamSize;
      if (typeof n !== "number")
        return "Team size unknown: enter your team to see how far duties can be separated.";
      return n <= WARNING_RULES.smallTeamSize
        ? `Team of ${n}: at Precog's ${WARNING_RULES.smallTeamSize}-person cutoff, separating every duty is rarely realistic; owner review and compensating controls help.`
        : `Team of ${n}: enough people to separate the critical duties; resolve the open conflicts before adding compensating controls.`;
    })(),
    leading
      ? `Watched conditions: **${leading.breached} breached**, ${leading.watch} at watch. ${leading.topActions[0] ?? ""}`
      : "Check the watched conditions on Patterns for what comes before a loss.",
    bestCascade
      ? `Biggest knock-on effect: **${leverAction(bestCascade.label)}**. ${bestCascade.secondOrderNotes[0] ?? ""}`
      : "Run the what-else-moves check on What could happen.",
    rag?.hits?.[0]
      ? `Guidance: _${rag.hits[0].title}_: ${rag.hits[0].text.slice(0, 140)}…`
      : "Read the control guidance on Patterns before you accept a risk.",
  ];

  // Planning cadences, not measurements: how soon the coach suggests reviewing
  // each kind of decision. They become an editable "review by" date in the journal.
  const REVIEW_HORIZON_DAYS = { control: 14, crossTrain: 30, journal: 7 } as const;

  const checkInDecision = (plan: NonNullable<typeof checkIns>["checkIns"]) => {
    const first = plan[0];
    const others = plan.length - 1;
    return {
      action: `Check in with ${first.person.name}: ${count(first.items.length, "register entry", "register entries")} to re-confirm${others > 0 ? ` (${others} more ${verb(others, "person", "people")} after that)` : ""}`,
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

  const reconfirmDecision = (stale: { name: string }[]) => ({
    action: `Re-confirm the register entry for ${stale[0].name}${stale.length > 1 ? ` and ${stale.length - 1} more` : ""}`,
    rationale:
      "Nobody on the active team holds these entries and nobody has confirmed them in 90+ days; decide whether they still matter, then assign someone or retire them.",
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
          rationale: `You already logged the hand-off in the Decisions log${committed.length > 1 ? ` (${committed.length} entries)` : ""}. ${w.person.name} is away ${w.from} to ${w.to}; close the entries as done once the stand-in has actually taken it over.`,
          evidenceIds: [] as string[],
          effort: "low" as const,
          horizonDays: clamp(w.daysUntil, 1, REVIEW_HORIZON_DAYS.journal),
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
        : `is out ${w.from} to ${w.to}, in ${count(w.daysUntil, "day")}`;
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
      ? ` ${joinWithAnd(w.overlaps.map((o) => o.person.name))} ${verb(w.overlaps.length, "is", "are")} also away for part of it.`
      : "";
    const othersAway = w.worstStretch.away.filter((p) => p.id !== w.person.id);
    const during =
      w.worstStretch.extraStops.length > 0 && othersAway.length > 0
        ? ` ${w.worstStretch.from} to ${w.worstStretch.to}, while ${joinWithAnd(othersAway.map((p) => p.name))} ${verb(othersAway.length, "is", "are")} also away`
        : " for the whole absence";
    return [
      {
        action: first.standIn
          ? w.status === "current"
            ? `${first.standIn.name} covers ${first.name} today while ${w.person.name} ${out}${open.length > 1 ? ` — and ${open.length - 1} more` : ""}`
            : `Hand off ${first.name} to ${first.standIn.name} before ${w.person.name} is out${w.status === "upcoming" ? ` (by ${w.handoffBy})` : ""}${open.length > 1 ? ` — and ${open.length - 1} more` : ""}`
          : `Decide who covers ${first.name} while ${w.person.name} ${out}${open.length > 1 ? ` — and ${open.length - 1} more` : ""}`,
        rationale: `${w.person.name} ${when}. ${open.length === 1 ? `${first.name} stops` : `${open.length} register entries stop`}${during}${noOne.length ? `; ${noOne.map((s) => s.name).join(", ")} ${verb(noOne.length, "has", "have")} nobody who can run ${verb(noOne.length, "it", "them")} alone` : ""}.${also}${coverNow}${w.remaining.length ? ` Still in the business: ${w.remaining.map((p) => p.name).join(", ")}.` : " Nobody else remains in the business."}`,
        evidenceIds: [] as string[],
        effort: first.standIn ? ("low" as const) : ("medium" as const),
        horizonDays: clamp(w.daysUntil, 1, REVIEW_HORIZON_DAYS.crossTrain),
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
          rationale: `${l.summary} Until then the coverage figures count ${name} as a stand-in${l.handover.length > 0 ? ` for ${count(l.handover.length, "entry", "entries")} nobody else can run alone` : ""}; marking them left keeps the record in the history and shows the real gap.`,
          evidenceIds: [] as string[],
          effort: "low" as const,
          horizonDays: 1,
          cascadeEffects: ["register accuracy ↑"],
        },
      ];
    }
    if (l.handover.length === 0 && l.orphanedProcesses.length === 0) return [];
    const horizon = clamp(l.daysLeft, 1, REVIEW_HORIZON_DAYS.crossTrain);
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
          action: `In progress: ${name}'s hand-off of ${c.name}${committed.length > 1 ? ` and ${committed.length - 1} more` : ""}${c.trainingLogged?.reviewBy ? ` — review ${c.trainingLogged.reviewBy}` : ""}`,
          rationale: `${l.summary} Every entry only ${name} can run alone already has a training step in the Decisions log; close each as done once the successor can run it, before ${l.lastDay}.`,
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
        rationale: `${l.summary}${noOne.length ? ` ${noOne.map((h) => h.name).join(", ")} ${verb(noOne.length, "has", "have")} nobody to take ${verb(noOne.length, "it", "them")} — hire, outsource or retire ${verb(noOne.length, "it", "them")}.` : ""}${unwritten.length ? ` Have ${name} write down ${unwritten.map((h) => h.name).join(", ")} before the last day; once ${name} has left, nobody can.` : ""}${l.remaining.length ? ` Still in the business: ${l.remaining.map((p) => p.name).join(", ")}.` : " Nobody else remains in the business."}`,
        evidenceIds: [] as string[],
        effort: first.successor ? ("medium" as const) : ("high" as const),
        horizonDays: horizon,
        cascadeEffects: ["continuity after departure ↑", "continuity residual index ↓"],
        link: {
          tab: "knowledge",
          id: first.knowledgeId,
          step: "cover" as const,
          personId: first.successor?.id,
        },
      },
    ];
  };
  const debriefDecision = () => {
    const d = leave?.debriefs?.[0];
    if (!d) return [];
    const lead = d.items.find((e) => e.canPromote) ?? d.items[0];
    const more = d.items.length - 1;
    const days = `${count(d.lengthDays, "day")}`;
    return [
      {
        action: lead.standIn
          ? lead.canPromote
            ? `${d.person.name} is back: can ${lead.standIn.name} run ${lead.name} alone now?${more > 0 ? ` — and ${more} more` : ""}`
            : `${d.person.name} is back: close the ${lead.name} hand-off${more > 0 ? ` — and ${more} more` : ""}`
          : `${d.person.name} is back: who covered ${lead.name}?${more > 0 ? ` — and ${more} more` : ""}`,
        rationale: `${lead.question} ${d.unplanned ? "An unexpected absence" : "Leave"} is the one time a stand-in runs the work for real, so record what it proved: on the register, one click moves them to "can do" (confirmed today) and closes the hand-off; "Not yet" turns those ${days} into a tracked cross-training step instead.`,
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
        ? "List the duties and know-how the business runs on"
        : `Mark who can do each of the ${itemCount} things the business runs on`,
    rationale:
      itemCount === 0
        ? "The register on Who knows what is empty, so nothing yet shows who alone can run what. Until it lists the work, no continuity figure describes this business."
        : "Nobody is marked on the sample register yet, so it cannot show who alone can run what. Mark each item on Who knows what; until then, no continuity figure describes this business.",
    evidenceIds: evidence
      .filter((e) => e.kind === "spof")
      .map((e) => e.id)
      .slice(0, 1),
    effort: "low",
    horizonDays: REVIEW_HORIZON_DAYS.journal,
    cascadeEffects: ["register accuracy ↑"],
  });
  const beamAction = adv?.recommendedSequence?.map(leverAction).join(" → ");
  // Entries a leaver must hand off are advised as their hand-off, not as
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
  const secondSignerOff = !snap?.staff.dualControlPayments;
  const bankRecOff = !snap?.staff.independentBankRec;
  const journalAction =
    "Write down in the Decisions log which open gaps you accept and which you will fix, each with a review date";
  const journalRationale =
    "An open gap stays flagged until you record a decision on it, and the record is the trail an outside reviewer asks for.";
  const defaultControl = secondSignerOff
    ? bankRecOff
      ? {
          action: "Turn on a second signer for payments and an independent bank reconciliation",
          rationale:
            "Default when no ranking ran: a second signer on payments and an independent bank reconciliation each remove a path one person can use alone.",
        }
      : {
          action: "Turn on a second signer for payments",
          rationale:
            "Default when no ranking ran: a second signer on payments removes a path one person can use alone.",
        }
    : bankRecOff
      ? {
          action: "Set up an independent bank reconciliation",
          rationale:
            "Default when no ranking ran: an independent bank reconciliation adds a separate check on bank activity.",
        }
      : { action: journalAction, rationale: journalRationale };
  const journalFallback = !secondSignerOff && !bankRecOff && !beamAction && !bestCascade;
  const decisions: PioneerDecision[] = [
    {
      action: leverAction(beamAction || bestCascade?.label || defaultControl.action),
      rationale: beamAction
        ? "Precog's model ranks this first, using its own weights. It is an ordering, not a measurement."
        : bestCascade
          ? `The what-else-moves check puts this first: it moves the risk index the most. ${bestCascade.secondOrderNotes[0] ?? ""}`.trim()
          : defaultControl.rationale,
      evidenceIds: evidence
        .filter((e) => e.kind === "cascade" || e.kind === "ml" || e.kind === "reasoning")
        .map((e) => e.id)
        .slice(0, 4),
      effort: journalFallback ? "low" : "medium",
      horizonDays: journalFallback ? REVIEW_HORIZON_DAYS.journal : REVIEW_HORIZON_DAYS.control,
      cascadeEffects: bestCascade?.affects?.slice(0, 5),
    },
    ...leaveDecision(),
    ...leaverDecision(),
    ...debriefDecision(),
    ...(committedSpof && commitment
      ? [
          {
            action: commitment.overdue
              ? `Review overdue: can ${commitment.trainee?.name ?? "the stand-in"} run ${committedSpof.name} alone yet?`
              : `In progress: ${commitment.trainee?.name ?? "a stand-in"} on ${committedSpof.name}${commitment.reviewBy ? ` — review ${commitment.reviewBy}` : ""}`,
            rationale: `You already logged "${commitment.subject}" in the Decisions log, but the register still says only ${committedSpof.owners[0]?.name ?? "one person"} can run it. ${
              commitment.overdue
                ? "Close it as done there — which updates the register — or push the review date if training is still under way."
                : "Nothing new to start; when the training is finished, close it as done in the Decisions log so the register catches up."
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
                  : `Cross-train a stand-in for ${uncommittedSpof.name}`
                : "Train a second person on the work only one person can run",
              rationale:
                uncommittedSpof?.nextStep ??
                "Work only one person can run is the continuity gap the watched conditions look for.",
              evidenceIds: evidence
                .filter((e) => e.kind === "spof")
                .map((e) => e.id)
                .slice(0, 2),
              effort: uncommittedSpof?.documented ? ("low" as const) : ("medium" as const),
              horizonDays: REVIEW_HORIZON_DAYS.crossTrain,
              cascadeEffects: ["continuity residual index ↓"],
              link: uncommittedSpof?.knowledgeId
                ? {
                    tab: "knowledge",
                    id: uncommittedSpof.knowledgeId,
                    step: "cover" as const,
                    personId: uncommittedSpof.suggestedTrainee?.id,
                  }
                : { tab: "knowledge" },
            },
          ]),
    // Register freshness comes from the check-in tool alone; it always runs.
    ...(checkIns?.checkIns[0] ? [checkInDecision(checkIns.checkIns)] : []),
    ...(checkIns && checkIns.unheld.length > 0 ? [reconfirmDecision(checkIns.unheld)] : []),
    ...(!journalFallback
      ? [
          {
            action: journalAction,
            rationale: journalRationale,
            evidenceIds: evidence
              .filter((e) => e.kind === "sod" || e.kind === "rag")
              .map((e) => e.id)
              .slice(0, 2),
            effort: "low" as const,
            horizonDays: REVIEW_HORIZON_DAYS.journal,
          },
        ]
      : []),
  ];

  const frontierNextMove = bestCascade
    ? `This week: **${leverAction(bestCascade.label)}**, then re-check the watched conditions and What is still exposed.`
    : `This week: **${leverAction(defaultControl.action)}**, then ask again and re-check the watched conditions.`;
  const thisWeek = frontierNextMove.replace(/^This week:\s*/, "");
  const thisWeekBody = `${thisWeek.charAt(0).toUpperCase()}${thisWeek.slice(1)}`;

  const situation = `**${snap?.practice ?? "This business"}**: average risk index **${residual?.averageResidual ?? "?"}/100** · **${leading?.breached ?? "?"}** watched conditions breached · **${coso ? `${coso.gaps} of ${coso.principles}` : "?"}** control checks have a gap. Second signer on payments: ${snap?.staff.dualControlPayments ? "on" : "off"}. Independent bank reconciliation: ${snap?.staff.independentBankRec ? "on" : "off"}.`;
  const conditions = [
    leading
      ? `- Watched conditions: **${leading.breached} breached**, ${leading.watch} at watch (thresholds set in Precog, not benchmarks)`
      : "- Not checked in this run",
    ...(scenario?.warningSigns?.length
      ? [
          `- Early signs of "${scenario.title}": ${scenario.warningSigns
            .slice(0, 3)
            .map((sign, i) => {
              const text = sign.replace(/\.$/, "");
              return i === 0 ? text : text.charAt(0).toLowerCase() + text.slice(1);
            })
            .join("; ")}.`,
        ]
      : []),
  ];
  const markdownWarnings = leading
    ? warnings.filter((warning) => !/^\d+ watched conditions? breached/i.test(warning))
    : warnings;

  const markdown = [
    `## ${BRIEF_SECTION.situation}`,
    situation,
    "",
    `## ${BRIEF_SECTION.thisWeek}`,
    thisWeekBody,
    "",
    `## ${BRIEF_SECTION.moves}`,
    ...decisions.map(renderDecision),
    "",
    `## ${BRIEF_SECTION.warnings}`,
    ...markdownWarnings.map((w) => `- ${w}`),
    ...conditions,
    "",
    `## ${BRIEF_SECTION.risks}`,
    ...highestRisks.map((r, i) =>
      r.startsWith(`**${BRIEF_SECTION.cases}**`) ? `\n\n${r}` : `${i + 1}. ${r}`,
    ),
    "",
    `## ${BRIEF_SECTION.limits}`,
    ...limitsLines(tradeoffs, advancedReasoning).map((line) => `- ${line}`),
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

function limitsLines(tradeoffs: string[], advancedReasoning: string[]): string[] {
  const teamSize = tradeoffs[0];
  const verifyNext = advancedReasoning.find((line) =>
    line.startsWith("Most useful thing to verify next:"),
  );
  return [
    ...(teamSize ? [teamSize] : []),
    ...(verifyNext ? [verifyNext] : []),
    "Rankings use Precog's weights, not a measurement of this business.",
  ];
}

/** "1. **Move one duty** (medium effort · within 14 days): why." */
export function renderDecision(d: PioneerDecision, i: number): string {
  const steps = d.procedure?.map((step, n) => `${n + 1}. ${step}`).join(" ");
  return `${i + 1}. **${d.action}** (${d.effort} effort · within ${count(d.horizonDays, "day")}): ${d.rationale}${steps ? ` Procedure: ${steps}` : ""}`;
}
