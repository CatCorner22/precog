import { findKnowledgeRisks, runPrecogScenario } from "../engine";
import { documentationState } from "../continuity/documentation";
import { registerAssessed } from "../continuity/register-state";
import { scenariosInScope, starterScenariosLeftOut } from "./scope";
import type { IndustryTemplate } from "../templates";
import type {
  ControlItem,
  KnowledgeRelation,
  KnowledgeRisk,
  ScenarioTemplate,
  StaffComposition,
} from "../types";
import type { RiskVariableState } from "./dynamic-variables";
import { scenarioFlags } from "./scenario-kind";
import {
  bandForScore,
  DEFAULT_WEIGHTS,
  type ScoringWeights,
  SCORING_VERSION,
  type ActionBand,
} from "./weights";
import { formatUsd } from "../../utils";
import { clamp, wholePercent } from "../number";
import { count } from "../text";

export interface ResidualRiskScore {
  id: string;
  name: string;
  category: "control" | "knowledge" | "scenario" | "portfolio";
  inherent: number;
  controlEffectiveness: number;
  /**
   * Scenario rows only: the share of control effectiveness the formula
   * credits (weights.scenario.effectivenessCredit) and the effectiveness it
   * therefore counts, so the shown figures reproduce the residual.
   */
  effectivenessCredit?: number;
  creditedEffectiveness?: number;
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

/** What the business's own records say beyond the template and staff. */
export interface ResidualScope {
  /** Which of the template's scenarios the owner has confirmed as their own (see scoring/scope). */
  confirmedScenarioIds?: ReadonlySet<string>;
  /**
   * The profile's risk variables (cameras, daily cash, insurance), so a
   * scenario row prices the loss and timeline the Scenario tab shows. Without
   * them the scenario engine uses the app's defaults.
   */
  riskVariables?: RiskVariableState;
}

interface RiskDriver {
  id: string;
  label: string;
  direction: "increases" | "decreases";
  weight: number;
  detail: string;
}

interface StaffUplift {
  factor: number;
  drivers: RiskDriver[];
}

/**
 * Every residual row the business's own records support: its controls, the
 * register items someone has marked (none while the register is not assessed)
 * and the scenarios in scope (all of the sample's; for an owner's own people
 * only the starter scenarios they confirmed).
 */
export function scoreAllResidualRisks(
  tpl: IndustryTemplate,
  staff?: StaffComposition,
  weights: ScoringWeights = DEFAULT_WEIGHTS,
  scope: ResidualScope = {},
): ResidualRiskScore[] {
  const staffResolved = staff ?? tpl.staffComposition;
  // The staffing uplift depends on the staff alone: one figure for every row.
  const uplift = staffUplift(staffResolved, weights);
  const risks = findKnowledgeRisks(tpl);
  const knowledgeRedundancy =
    risks.length > 0 ? risks.filter((r) => r.ownerCount >= 2).length / risks.length : null;

  // A starter control nobody has confirmed runs here says nothing about this
  // business; it is scored once the owner confirms it (Where risk sits).
  const controlScores = tpl.controls
    .filter((c) => !c.starter)
    .map((c) => scoreControl(tpl, c, staffResolved, knowledgeRedundancy, uplift, weights));

  const knowledgeScores = risks.map((r) => scoreKnowledge(tpl, r, uplift, weights));

  const scenarioScores = scenariosInScope(tpl, scope.confirmedScenarioIds).map((s) =>
    scoreScenario(tpl, s, staffResolved, uplift, weights, scope.riskVariables),
  );

  return [...controlScores, ...knowledgeScores, ...scenarioScores].sort(
    (a, b) => b.residual - a.residual,
  );
}

/** The residual register's summary: every row, the top eight, the average and the band counts. */
export function portfolioSummary(
  tpl: IndustryTemplate,
  staff?: StaffComposition,
  weights: ScoringWeights = DEFAULT_WEIGHTS,
  scope: ResidualScope = {},
) {
  const scores = scoreAllResidualRisks(tpl, staff ?? tpl.staffComposition, weights, scope);
  const top = scores.slice(0, 8);
  const avg = scores.reduce((s, x) => s + x.residual, 0) / Math.max(1, scores.length);
  const criticalPath = scores.filter((s) => s.band === "critical_path").length;
  const actNow = scores.filter((s) => s.band === "act_now").length;

  return {
    scoringVersion: SCORING_VERSION,
    averageResidual: wholePercent(avg),
    criticalPath,
    actNow,
    top,
    all: scores,
    /** False while the register is not assessed: no knowledge rows are scored. */
    knowledgeAssessed: registerAssessed(tpl),
    /** Starter scenarios left out until the owner confirms them. */
    starterScenariosLeftOut: starterScenariosLeftOut(tpl, scope.confirmedScenarioIds).map(
      (s) => s.id,
    ),
    /** Starter controls left out until the owner confirms they run here. */
    starterControlsLeftOut: tpl.controls.filter((c) => c.starter).map((c) => c.id),
  };
}

/**
 * Tornado sensitivity: which staff or control lever lowers the average
 * residual most. A lever is offered only when pulling it lowers the average:
 * one already in place (dual control on, segregation at or above the target,
 * no item held by one person) never moves a score, and a lever that would not
 * help is left out. Every lever is a control the owner can put in place;
 * hiring is not one.
 */
export function tornadoSensitivity(
  tpl: IndustryTemplate,
  baseStaff?: StaffComposition,
  scope: ResidualScope = {},
) {
  const baseStaffResolved = baseStaff ?? tpl.staffComposition;
  const base = portfolioSummary(tpl, baseStaffResolved, DEFAULT_WEIGHTS, scope).averageResidual;
  const levers: { id: string; label: string; delta: number; improvedAvg: number }[] = [];
  const crossTrained = crossTrainSoleHolders(tpl);

  const trials: { id: string; label: string; staff: StaffComposition; tpl?: IndustryTemplate }[] = [
    {
      id: "dual",
      label: "Turn on dual release for payments",
      staff: { ...baseStaffResolved, dualControlPayments: true },
    },
    {
      id: "bank",
      label: "Independent bank reconciliation",
      staff: { ...baseStaffResolved, independentBankRec: true },
    },
    {
      id: "seg",
      label: `Raise segregation score to ${TORNADO_SEGREGATION_TARGET}`,
      staff: {
        ...baseStaffResolved,
        segregationScore: Math.max(baseStaffResolved.segregationScore, TORNADO_SEGREGATION_TARGET),
      },
    },
    {
      // A real cross-training: every item one person holds gets a second
      // strong holder, so the register rows move as well as the uplift.
      id: "spof",
      label: "Cross-train every item only one person knows",
      staff: { ...baseStaffResolved, soleOwnerKnowledgeCount: 0 },
      tpl: crossTrained ?? tpl,
    },
  ];

  for (const t of trials) {
    const improved = portfolioSummary(
      t.tpl ?? tpl,
      t.staff,
      DEFAULT_WEIGHTS,
      scope,
    ).averageResidual;
    const delta = base - improved;
    if (delta <= 0) continue;
    levers.push({ id: t.id, label: t.label, delta, improvedAvg: improved });
  }

  return {
    baseAverage: base,
    levers: levers.sort((a, b) => b.delta - a.delta),
  };
}

function scoreControl(
  tpl: IndustryTemplate,
  c: ControlItem,
  staff: StaffComposition,
  knowledgeRedundancy: number | null,
  uplift: StaffUplift,
  weights: ScoringWeights,
): ResidualRiskScore {
  const inherent = controlInherent(tpl, c, weights);
  const effectiveness = controlEffectiveness(c, staff, knowledgeRedundancy, weights);
  const beforeUplift = inherent.score * (1 - effectiveness.score);
  const residual = wholePercent(beforeUplift * 100 * uplift.factor);
  const band = bandForScore(residual);

  return {
    id: `ctrl-${c.id}`,
    name: c.name,
    category: "control",
    inherent: wholePercent(inherent.score * 100),
    controlEffectiveness: wholePercent(effectiveness.score * 100),
    residual,
    band: band.band,
    bandLabel: band.label,
    bandGuidance: band.guidance,
    drivers: [...inherent.drivers, ...effectiveness.drivers, ...uplift.drivers]
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 6),
    linkedControlId: c.id,
    linkedScenarioId: tpl.scenarios.find((s) => s.controlId === c.id)?.id,
    scoringVersion: SCORING_VERSION,
  };
}

function scoreKnowledge(
  tpl: IndustryTemplate,
  risk: KnowledgeRisk,
  uplift: StaffUplift,
  weights: ScoringWeights,
): ResidualRiskScore {
  const { knowledgeId, name, soleOwner, ownerCount } = risk;
  const item = tpl.knowledge.find((x) => x.id === knowledgeId);
  const criticality = item?.criticality ?? "important";
  const crit = criticality === "critical" ? 0.9 : 0.6;
  const ownership = ownerCount === 0 ? 1 : soleOwner ? 0.85 : ownerCount === 2 ? 0.35 : 0.15;
  const inherent = clamp(0.55 * crit + 0.45 * ownership, 0, 1);
  const docState = item ? documentationState(item) : "none";
  const base = ownerCount >= 2 ? 0.7 : ownerCount === 1 ? 0.25 : 0.05;
  const docCredit =
    docState === "located"
      ? weights.knowledge.documentedLocatedCredit
      : docState === "unlocated"
        ? weights.knowledge.documentedUnlocatedCredit
        : 0;
  const effectiveness = clamp(base + docCredit, 0, 1);
  const beforeUplift = inherent * (1 - effectiveness);
  const residual = wholePercent(beforeUplift * 100 * uplift.factor);
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
      detail: `${count(ownerCount, "proficient or expert holder")}.`,
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
    inherent: wholePercent(inherent * 100),
    controlEffectiveness: wholePercent(effectiveness * 100),
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

/**
 * A scenario's row: its assumed loss and days until found (from the scenario
 * engine, priced with the owner's risk variables) folded onto the index, less
 * the credited control effectiveness, times the staffing uplift.
 */
function scoreScenario(
  tpl: IndustryTemplate,
  s: ScenarioTemplate,
  staff: StaffComposition,
  uplift: StaffUplift,
  weights: ScoringWeights,
  riskVariables: RiskVariableState | undefined,
): ResidualRiskScore {
  const result = runPrecogScenario(tpl, s.id, { staff, riskVariables })!;
  const lossNorm = clamp(
    result.financialImpact.expected / weights.scenario.lossSaturationUsd,
    0,
    1,
  );
  const timeNorm = clamp(1 - result.timelineDays.p50 / weights.scenario.daysSaturation, 0, 1);
  const { timeFloor } = weights.scenario;
  const inherent = clamp(
    weights.scenario.lossShare * lossNorm +
      weights.scenario.timeShare * (timeFloor + timeNorm * (1 - timeFloor)),
    0,
    1,
  );
  // Dual payment control guards against someone moving money, so it is
  // credited to fraud scenarios only; a departure is not slowed by it.
  const dualCredit =
    staff.dualControlPayments && scenarioFlags(s.id).fraudRelated
      ? weights.scenario.dualControlCredit
      : 0;
  const effectiveness = clamp(
    weights.scenario.baseEffectiveness +
      dualCredit +
      (staff.independentBankRec ? weights.scenario.independentBankRecCredit : 0) +
      (staff.segregationScore / 100) * weights.scenario.segregationCredit,
    0,
    1,
  );
  const beforeUplift = inherent * (1 - effectiveness * weights.scenario.effectivenessCredit);
  const residual = wholePercent(beforeUplift * 100 * uplift.factor);
  const band = bandForScore(residual);

  return {
    id: `scen-${s.id}`,
    name: s.title,
    category: "scenario",
    inherent: wholePercent(inherent * 100),
    controlEffectiveness: wholePercent(effectiveness * 100),
    effectivenessCredit: weights.scenario.effectivenessCredit,
    creditedEffectiveness: wholePercent(effectiveness * weights.scenario.effectivenessCredit * 100),
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
        detail: `~${formatUsd(result.financialImpact.expected)} — Precog's scenario assumption, not a measured figure`,
      },
      {
        id: `${s.id}-time`,
        label: "Assumed days until found",
        direction: "increases" as const,
        weight: timeNorm,
        detail: `about ${result.timelineDays.p50} days, assumed range ${result.timelineDays.p95Low}–${result.timelineDays.p95High}, Precog's scenario assumption; this index weighs a scenario that comes to light sooner as nearer at hand`,
      },
      ...uplift.drivers,
    ].slice(0, 6),
    linkedScenarioId: s.id,
    expectedLoss: result.financialImpact.expected,
    p50Days: result.timelineDays.p50,
    scoringVersion: SCORING_VERSION,
  };
}

/** The staffing uplift every row is multiplied by, with the drivers that explain it. */
function staffUplift(staff: StaffComposition, weights: ScoringWeights): StaffUplift {
  let factor = 1;
  const drivers: RiskDriver[] = [];

  if (staff.teamSize <= 6) {
    factor += weights.staff.smallTeamUplift;
    drivers.push({
      id: "staff-small",
      label: "Small team",
      direction: "increases",
      weight: weights.staff.smallTeamUplift,
      detail: `A team of ${staff.teamSize} has fewer people to keep duties apart.`,
    });
  }
  if (staff.soleOwnerKnowledgeCount > 0) {
    const u = Math.min(
      weights.staff.soleOwnerUpliftCap,
      staff.soleOwnerKnowledgeCount * weights.staff.soleOwnerUpliftPerItem,
    );
    factor += u;
    drivers.push({
      id: "staff-spof",
      label: "Sole-owner knowledge",
      direction: "increases",
      weight: u,
      detail: `${count(staff.soleOwnerKnowledgeCount, "critical item")} with one strong holder.`,
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
  tpl: Pick<IndustryTemplate, "scenarios">,
  c: ControlItem,
  weights: ScoringWeights,
): { score: number; drivers: RiskDriver[] } {
  const duties = c.duties.length;
  const guarded = tpl.scenarios.filter((s) => s.controlId === c.id).map((s) => scenarioFlags(s.id));
  const fraudClass =
    FRAUD_OPPORTUNITY_CONTROLS.has(c.id) || guarded.some((f) => f.fraudRelated) ? 0.85 : 0.45;
  const criticality = duties >= 2 ? 0.8 : 0.5;
  const exposure =
    MONEY_EXPOSURE_CONTROLS.has(c.id) || guarded.some((f) => f.fraudRelated && f.cashRelated)
      ? 0.9
      : 0.55;
  // Inherent exposure is evaluated before crediting the control design.
  const detectHard = 0.75;
  const cascade = c.id.startsWith("c-sod-") ? 0.7 : 0.4;

  const score =
    weights.inherent.assetExposure * exposure +
    weights.inherent.processCriticality * criticality +
    weights.inherent.fraudOpportunityClass * fraudClass +
    weights.inherent.detectionDifficulty * detectHard +
    weights.inherent.cascadePotential * cascade;

  return {
    score: clamp(score, 0, 1),
    drivers: [
      {
        id: `${c.id}-inher-fraud`,
        label: "Fraud opportunity class",
        direction: "increases",
        weight: fraudClass,
        detail: "Exposure of the duties and scenarios in scope, before control credit.",
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

/**
 * `knowledgeRedundancy` is the share of scored register items with two or
 * more strong holders, or null when no register item is scored (the register
 * is not assessed yet). A null term is left out and the other weights are
 * scaled up to fill its share, so an unanswered question never scores as the
 * worst answer.
 */
function controlEffectiveness(
  c: ControlItem,
  staff: StaffComposition,
  knowledgeRedundancy: number | null,
  weights: ScoringWeights,
): { score: number; drivers: RiskDriver[] } {
  const seg = c.segregated ? 0.9 : (staff.segregationScore / 100) * 0.45;
  const dual =
    staff.dualControlPayments && (CASH_CONTROLS.has(c.id) || PAYMENT_CONTROLS.has(c.id))
      ? 0.85
      : staff.dualControlPayments
        ? 0.5
        : 0.15;
  const indRec =
    staff.independentBankRec && CASH_CONTROLS.has(c.id)
      ? 0.9
      : staff.independentBankRec
        ? 0.45
        : 0.1;
  // Free-text descriptions are retained for review, not treated as tested
  // controls. Structured operating evidence must exist before this factor
  // can receive credit; note count, wording and duplication are irrelevant.
  const comp = 0;
  const mon = staff.independentBankRec ? 0.55 : 0.25;

  const scoredWithoutKnowledge =
    weights.control.segregationQuality * seg +
    weights.control.dualAuthorization * dual +
    weights.control.independentReconciliation * indRec +
    weights.control.compensatingControls * comp +
    weights.control.monitoringCadence * mon;
  const score =
    knowledgeRedundancy === null
      ? scoredWithoutKnowledge / (1 - weights.control.knowledgeRedundancy)
      : scoredWithoutKnowledge + weights.control.knowledgeRedundancy * knowledgeRedundancy;

  const drivers: RiskDriver[] = [];
  if (!c.segregated) {
    drivers.push({
      id: `${c.id}-eff-seg`,
      label: "Duties not kept apart",
      direction: "increases",
      weight: 1 - seg,
      detail: "Primary segregation missing; residual depends on compensating controls.",
    });
  }
  if (c.compensatingControls.length > 0) {
    drivers.push({
      id: `${c.id}-eff-comp`,
      label: "Control notes awaiting verification",
      direction: "increases",
      weight: 1,
      detail:
        "These descriptions are not verified operating evidence and receive no effectiveness credit: " +
        c.compensatingControls.join("; "),
    });
  } else if (!c.segregated) {
    drivers.push({
      id: `${c.id}-eff-nocomp`,
      label: "Compensating control not verified",
      direction: "increases",
      weight: 0.8,
      detail:
        "No tested compensating measure is established by this record. Check design, operation and evidence before relying on one.",
    });
  }
  if (c.residualRiskAccepted) {
    drivers.push({
      id: `${c.id}-eff-accept`,
      label: "Residual risk accepted",
      direction: "increases",
      weight: 0.2,
      detail: "Documented acceptance still leaves residual risk elevated for monitoring.",
    });
  }

  return { score: clamp(score, 0, 1), drivers };
}

/**
 * The template with a second strong holder on every register item one person
 * holds: another active person, marked expert. Null when nothing is held by
 * one person or nobody else is on the team.
 */
function crossTrainSoleHolders(tpl: IndustryTemplate): IndustryTemplate | null {
  const active = tpl.people.filter((p) => p.active);
  const added: KnowledgeRelation[] = [];
  for (const r of findKnowledgeRisks(tpl)) {
    if (!r.soleOwner) continue;
    const second = active.find((p) => p.id !== r.owners[0]?.id);
    if (second) added.push({ personId: second.id, knowledgeId: r.knowledgeId, level: "expert" });
  }
  if (added.length === 0) return null;
  const replaced = (rel: KnowledgeRelation) =>
    added.some((a) => a.personId === rel.personId && a.knowledgeId === rel.knowledgeId);
  return { ...tpl, relations: [...tpl.relations.filter((rel) => !replaced(rel)), ...added] };
}

/** The segregation score the tornado's "raise to" lever aims for. */
const TORNADO_SEGREGATION_TARGET = 75;

/** Cash custody controls: the drawer, the deposit and the bank reconciliation. */
const CASH_CONTROLS = new Set(["c-cash", "c-sod-cash"]);

/** Controls on the payment path: vendors and payables. */
const PAYMENT_CONTROLS = new Set(["c-ap", "c-sod-ap"]);

/**
 * Controls whose duties let someone take money: the shared cash, payment,
 * billing and receivables controls and the trust-account controls. A control
 * that a fraud scenario names as its guard counts too (see controlInherent).
 */
const FRAUD_OPPORTUNITY_CONTROLS = new Set([
  ...CASH_CONTROLS,
  ...PAYMENT_CONTROLS,
  "c-ar",
  "c-sod-ar",
  "c-sod-billing",
  "c-trust-rec",
  "c-trust-disb",
]);

/**
 * Controls over money held or paid out, the highest asset exposure. A control
 * guarding a cash scheme (fictitious payees, skimmed gifts) counts too.
 */
const MONEY_EXPOSURE_CONTROLS = new Set([
  ...CASH_CONTROLS,
  ...PAYMENT_CONTROLS,
  "c-trust-rec",
  "c-trust-disb",
]);
