import { findKnowledgeRisks, runPrecogScenario } from "../engine";
import { documentationState } from "../continuity/coverage";
import type { IndustryTemplate } from "../templates";
import type { ControlItem, KnowledgeItem, StaffComposition } from "../types";
import {
  ACTION_BANDS,
  bandForScore,
  DEFAULT_WEIGHTS,
  type ScoringWeights,
  SCORING_VERSION,
  type ActionBand,
} from "./weights";

export interface RiskDriver {
  id: string;
  label: string;
  direction: "increases" | "decreases";
  weight: number;
  detail: string;
}

export interface ResidualRiskScore {
  id: string;
  name: string;
  category: "control" | "knowledge" | "scenario" | "portfolio";
  inherent: number;
  controlEffectiveness: number;
  residualRaw: number;
  residual: number; // 0-100 after staff modifiers
  band: ActionBand;
  bandLabel: string;
  bandGuidance: string;
  drivers: RiskDriver[];
  linkedScenarioId?: string;
  linkedKnowledgeId?: string;
  linkedControlId?: string;
  expectedLoss?: number;
  p50Days?: number;
  scoringVersion: string;
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function clamp100(n: number) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function staffUplift(
  staff: StaffComposition,
  weights: ScoringWeights,
): { factor: number; drivers: RiskDriver[] } {
  let factor = 1;
  const drivers: RiskDriver[] = [];

  if (staff.teamSize <= 6) {
    factor += weights.staff.smallTeamUplift;
    drivers.push({
      id: "staff-small",
      label: "Small team",
      direction: "increases",
      weight: weights.staff.smallTeamUplift,
      detail: `Team size ${staff.teamSize} reduces natural SoD options.`,
    });
  }
  if (staff.soleOwnerKnowledgeCount > 0) {
    const u = Math.min(0.24, staff.soleOwnerKnowledgeCount * weights.staff.soleOwnerUpliftPerItem);
    factor += u;
    drivers.push({
      id: "staff-spof",
      label: "Sole-owner knowledge",
      direction: "increases",
      weight: u,
      detail: `${staff.soleOwnerKnowledgeCount} critical item(s) with sole strong owner.`,
    });
  }
  if (staff.segregationScore < 50) {
    factor += weights.staff.weakSegregationUplift;
    drivers.push({
      id: "staff-seg",
      label: "Weak segregation score",
      direction: "increases",
      weight: weights.staff.weakSegregationUplift,
      detail: `Segregation score ${staff.segregationScore}/100.`,
    });
  }
  if (staff.avgTenureYears < 3) {
    factor += weights.staff.lowTenureUplift;
    drivers.push({
      id: "staff-tenure",
      label: "Low average tenure",
      direction: "increases",
      weight: weights.staff.lowTenureUplift,
      detail: `Avg tenure ${staff.avgTenureYears} years.`,
    });
  }

  return { factor, drivers };
}

function controlInherent(
  c: ControlItem,
  weights: ScoringWeights,
): { score: number; drivers: RiskDriver[] } {
  const duties = c.duties.length;
  const fraudClass =
    c.id.includes("sod") || c.id.includes("cash") || c.id.includes("ap") || c.id.includes("ar")
      ? 0.85
      : 0.45;
  const criticality = duties >= 2 ? 0.8 : 0.5;
  const exposure = c.id.includes("cash") || c.id.includes("ap") ? 0.9 : 0.55;
  const detectHard = !c.segregated ? 0.75 : 0.35;
  const cascade = c.id.includes("sod") ? 0.7 : 0.4;

  const score =
    weights.inherent.assetExposure * exposure +
    weights.inherent.processCriticality * criticality +
    weights.inherent.fraudOpportunityClass * fraudClass +
    weights.inherent.detectionDifficulty * detectHard +
    weights.inherent.cascadePotential * cascade;

  return {
    score: clamp01(score),
    drivers: [
      {
        id: `${c.id}-inher-fraud`,
        label: "Fraud opportunity class",
        direction: "increases",
        weight: fraudClass,
        detail: c.segregated ? "Duties largely separated." : "Incompatible duties concentrated.",
      },
      {
        id: `${c.id}-inher-exp`,
        label: "Asset / process exposure",
        direction: "increases",
        weight: exposure,
        detail: `Duties in scope: ${c.duties.join(", ") || "review"}.`,
      },
    ],
  };
}

function controlEffectiveness(
  c: ControlItem,
  staff: StaffComposition,
  knowledgeRedundancy: number,
  weights: ScoringWeights,
): { score: number; drivers: RiskDriver[] } {
  const seg = c.segregated ? 0.9 : (staff.segregationScore / 100) * 0.45;
  const dual =
    staff.dualControlPayments && (c.id.includes("ap") || c.id.includes("cash"))
      ? 0.85
      : staff.dualControlPayments
        ? 0.5
        : 0.15;
  const indRec =
    staff.independentBankRec && (c.id.includes("cash") || c.id.includes("sod-cash"))
      ? 0.9
      : staff.independentBankRec
        ? 0.45
        : 0.1;
  const comp =
    c.compensatingControls.length === 0
      ? 0.1
      : Math.min(0.85, 0.35 + c.compensatingControls.length * 0.25);
  const mon = staff.independentBankRec ? 0.55 : 0.25;
  const know = knowledgeRedundancy;

  const score =
    weights.control.segregationQuality * seg +
    weights.control.dualAuthorization * dual +
    weights.control.independentReconciliation * indRec +
    weights.control.compensatingControls * comp +
    weights.control.monitoringCadence * mon +
    weights.control.knowledgeRedundancy * know;

  const drivers: RiskDriver[] = [];
  if (!c.segregated) {
    drivers.push({
      id: `${c.id}-eff-seg`,
      label: "SoD not achieved",
      direction: "increases",
      weight: 1 - seg,
      detail: "Primary segregation missing; residual depends on compensating controls.",
    });
  }
  if (c.compensatingControls.length > 0) {
    drivers.push({
      id: `${c.id}-eff-comp`,
      label: "Compensating controls present",
      direction: "decreases",
      weight: comp,
      detail: c.compensatingControls.join("; "),
    });
  } else if (!c.segregated) {
    drivers.push({
      id: `${c.id}-eff-nocomp`,
      label: "No compensating control",
      direction: "increases",
      weight: 0.8,
      detail: "Gap is open without detective or dual-control backup.",
    });
  }
  if (c.residualRiskAccepted) {
    drivers.push({
      id: `${c.id}-eff-accept`,
      label: "Residual risk accepted",
      direction: "increases",
      weight: 0.2,
      detail: "Documented acceptance still leaves residual score elevated for monitoring.",
    });
  }

  return { score: clamp01(score), drivers };
}

function scoreControl(
  c: ControlItem,
  staff: StaffComposition,
  knowledgeRedundancy: number,
  weights: ScoringWeights,
): ResidualRiskScore {
  const inherent = controlInherent(c, weights);
  const effectiveness = controlEffectiveness(c, staff, knowledgeRedundancy, weights);
  const residualRaw = inherent.score * (1 - effectiveness.score);
  const uplift = staffUplift(staff, weights);
  const residual = clamp100(residualRaw * 100 * uplift.factor);
  const band = bandForScore(residual);

  const scenarioMap: Record<string, string> = {
    "c-sod-cash": "sc-cash-sod-failure",
    "c-cash": "sc-cash-sod-failure",
    "c-sod-billing": "sc-writeoff-abuse",
    "c-sod-ap": "sc-vendor-fraud",
  };

  return {
    id: `ctrl-${c.id}`,
    name: c.name,
    category: "control",
    inherent: clamp100(inherent.score * 100),
    controlEffectiveness: clamp100(effectiveness.score * 100),
    residualRaw: clamp100(residualRaw * 100),
    residual,
    band: band.band,
    bandLabel: band.label,
    bandGuidance: band.guidance,
    drivers: [...inherent.drivers, ...effectiveness.drivers, ...uplift.drivers]
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 6),
    linkedControlId: c.id,
    linkedScenarioId: scenarioMap[c.id],
    scoringVersion: SCORING_VERSION,
  };
}

function scoreKnowledge(
  tpl: IndustryTemplate,
  knowledgeId: string,
  name: string,
  soleOwner: boolean,
  ownerCount: number,
  item: KnowledgeItem | undefined,
  staff: StaffComposition,
  weights: ScoringWeights,
): ResidualRiskScore {
  const criticality = item?.criticality ?? "important";
  const crit = criticality === "critical" ? 0.9 : 0.6;
  const ownership = ownerCount === 0 ? 1 : soleOwner ? 0.85 : ownerCount === 2 ? 0.35 : 0.15;
  const inherent = clamp01(0.55 * crit + 0.45 * ownership);
  const docState = item ? documentationState(item) : "none";
  const base = ownerCount >= 2 ? 0.7 : ownerCount === 1 ? 0.25 : 0.05;
  const docCredit =
    docState === "located"
      ? weights.knowledge.documentedLocatedCredit
      : docState === "unlocated"
        ? weights.knowledge.documentedUnlocatedCredit
        : 0;
  const effectiveness = clamp01(base + docCredit);
  const residualRaw = inherent * (1 - effectiveness);
  const uplift = staffUplift(staff, weights);
  const residual = clamp100(residualRaw * 100 * uplift.factor);
  const band = bandForScore(residual);

  const drivers: RiskDriver[] = [
    {
      id: `k-${knowledgeId}-own`,
      label: soleOwner
        ? "Single point of failure"
        : ownerCount === 0
          ? "No strong owner"
          : "Redundant ownership",
      direction: soleOwner || ownerCount === 0 ? "increases" : "decreases",
      weight: ownership,
      detail: `${ownerCount} proficient/expert holder(s).`,
    },
    {
      id: `k-${knowledgeId}-crit`,
      label: "Knowledge criticality",
      direction: "increases",
      weight: crit,
      detail: criticality,
    },
    {
      id: `k-${knowledgeId}-doc`,
      label:
        docState === "located"
          ? "Written procedure, findable"
          : docState === "unlocated"
            ? "Written procedure, location unknown"
            : "Nothing written down",
      direction: docState === "none" ? "increases" : "decreases",
      weight: docState === "none" ? 0.3 : docCredit,
      detail:
        docState === "none"
          ? "No written procedure a stand-in could follow."
          : docState === "unlocated"
            ? "Procedure exists but nobody has recorded where it lives."
            : `Procedure at ${item?.procedureLocation?.trim() ?? ""}.`,
    },
    ...uplift.drivers,
  ];

  return {
    id: `know-${knowledgeId}`,
    name,
    category: "knowledge",
    inherent: clamp100(inherent * 100),
    controlEffectiveness: clamp100(effectiveness * 100),
    residualRaw: clamp100(residualRaw * 100),
    residual,
    band: band.band,
    bandLabel: band.label,
    bandGuidance: band.guidance,
    drivers: drivers.sort((a, b) => b.weight - a.weight).slice(0, 6),
    linkedKnowledgeId: knowledgeId,
    linkedScenarioId: tpl.scenarios.find((s) => s.knowledgeId === knowledgeId)?.id,
    scoringVersion: SCORING_VERSION,
  };
}

export function scoreAllResidualRisks(
  tpl: IndustryTemplate,
  staff?: StaffComposition,
  weights: ScoringWeights = DEFAULT_WEIGHTS,
): ResidualRiskScore[] {
  const staffResolved = staff ?? tpl.staffComposition;
  const risks = findKnowledgeRisks(tpl);
  const knowledgeRedundancy =
    risks.filter((r) => r.ownerCount >= 2).length / Math.max(1, risks.length);

  const controlScores = tpl.controls.map((c) =>
    scoreControl(c, staffResolved, knowledgeRedundancy, weights),
  );

  const knowledgeScores = risks.map((r) => {
    const k = tpl.knowledge.find((x) => x.id === r.knowledgeId);
    return scoreKnowledge(
      tpl,
      r.knowledgeId,
      r.name,
      r.soleOwner,
      r.ownerCount,
      k,
      staffResolved,
      weights,
    );
  });

  const scenarioScores = tpl.scenarios.map((s) => {
    const result = runPrecogScenario(tpl, s.id, { staff: staffResolved })!;
    const lossNorm = clamp01(result.financialImpact.expected / weights.scenario.lossSaturationUsd);
    const timeNorm = clamp01(1 - result.timelineDays.p50 / weights.scenario.daysSaturation);
    const inherent = clamp01(
      weights.scenario.lossShare * lossNorm + weights.scenario.timeShare * (0.5 + timeNorm * 0.5),
    );
    const effectiveness = clamp01(
      weights.scenario.baseEffectiveness +
        (staffResolved.dualControlPayments ? weights.scenario.dualControlCredit : 0) +
        (staffResolved.independentBankRec ? weights.scenario.independentBankRecCredit : 0) +
        (staffResolved.segregationScore / 100) * weights.scenario.segregationCredit,
    );
    const residualRaw = inherent * (1 - effectiveness * weights.scenario.effectivenessCredit);
    const uplift = staffUplift(staffResolved, weights);
    const residual = clamp100(residualRaw * 100 * uplift.factor);
    const band = bandForScore(residual);

    return {
      id: `scen-${s.id}`,
      name: s.title,
      category: "scenario" as const,
      inherent: clamp100(inherent * 100),
      controlEffectiveness: clamp100(effectiveness * 100),
      residualRaw: clamp100(residualRaw * 100),
      residual,
      band: band.band,
      bandLabel: band.label,
      bandGuidance: band.guidance,
      drivers: [
        {
          id: `${s.id}-loss`,
          label: "Assumed loss if this happened",
          direction: "increases" as const,
          weight: lossNorm,
          detail: `~$${result.financialImpact.expected.toLocaleString()} — the app's scenario assumption, not a measured figure`,
        },
        {
          id: `${s.id}-time`,
          label: "Assumed time before it hurts",
          direction: "increases" as const,
          weight: timeNorm,
          detail: `about ${result.timelineDays.p50} days, assumed range ${result.timelineDays.p95Low}–${result.timelineDays.p95High} — the app's scenario assumption`,
        },
        ...uplift.drivers,
      ].slice(0, 6),
      linkedScenarioId: s.id,
      expectedLoss: result.financialImpact.expected,
      p50Days: result.timelineDays.p50,
      scoringVersion: SCORING_VERSION,
    };
  });

  return [...controlScores, ...knowledgeScores, ...scenarioScores].sort(
    (a, b) => b.residual - a.residual,
  );
}

export function portfolioSummary(
  tpl: IndustryTemplate,
  staff?: StaffComposition,
  weights: ScoringWeights = DEFAULT_WEIGHTS,
) {
  const scores = scoreAllResidualRisks(tpl, staff ?? tpl.staffComposition, weights);
  const top = scores.slice(0, 8);
  const avg = scores.reduce((s, x) => s + x.residual, 0) / Math.max(1, scores.length);
  const criticalPath = scores.filter((s) => s.band === "critical_path").length;
  const actNow = scores.filter((s) => s.band === "act_now").length;

  return {
    scoringVersion: SCORING_VERSION,
    actionBands: ACTION_BANDS,
    averageResidual: clamp100(avg),
    criticalPath,
    actNow,
    top,
    all: scores,
  };
}

/** Tornado sensitivity: which staff/control lever moves average residual most */
export function tornadoSensitivity(tpl: IndustryTemplate, baseStaff?: StaffComposition) {
  const baseStaffResolved = baseStaff ?? tpl.staffComposition;
  const base = portfolioSummary(tpl, baseStaffResolved).averageResidual;
  const levers: { id: string; label: string; delta: number; improvedAvg: number }[] = [];

  const trials: { id: string; label: string; staff: StaffComposition }[] = [
    {
      id: "dual",
      label: "Enable dual control on payments",
      staff: { ...baseStaffResolved, dualControlPayments: true },
    },
    {
      id: "bank",
      label: "Independent bank reconciliation",
      staff: { ...baseStaffResolved, independentBankRec: true },
    },
    {
      id: "seg",
      label: "Raise segregation score to 75",
      staff: { ...baseStaffResolved, segregationScore: 75 },
    },
    {
      id: "spof",
      label: "Eliminate sole-owner knowledge",
      staff: { ...baseStaffResolved, soleOwnerKnowledgeCount: 0 },
    },
    {
      id: "team",
      label: "Grow team to 10 (more SoD room)",
      staff: { ...baseStaffResolved, teamSize: 10 },
    },
  ];

  for (const t of trials) {
    const improved = portfolioSummary(tpl, t.staff).averageResidual;
    levers.push({
      id: t.id,
      label: t.label,
      delta: base - improved,
      improvedAvg: improved,
    });
  }

  return {
    baseAverage: base,
    levers: levers.sort((a, b) => b.delta - a.delta),
  };
}
