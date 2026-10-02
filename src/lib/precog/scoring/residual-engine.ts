import { findKnowledgeRisks, runPrecogScenario, scenarioMultipliers } from "../engine";
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
import { scenarioLevels } from "./scenario-level";
import {
  bandForScore,
  DEFAULT_WEIGHTS,
  type ScoringWeights,
  SCORING_VERSION,
  type ActionBand,
} from "./weights";
import { clamp, wholePercent } from "../number";
import { count } from "../text";

export interface ResidualRiskScore {
  id: string;
  name: string;
  category: "control" | "knowledge" | "scenario" | "portfolio";
  inherent: number;
  controlEffectiveness: number;
  /**
   * Scenario rows only: the likelihood and severity levels (0–100) the row
   * ranks on (scoring/scenario-level). A scenario row takes no effectiveness
   * credit, because its controls are already in these levels.
   */
  likelihoodLevel?: number;
  severityLevel?: number;
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
    scoreScenario(tpl, s, staffResolved, weights, scope.riskVariables),
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
  const inBand = (band: ActionBand) => scores.filter((s) => s.band === band).length;

  return {
    scoringVersion: SCORING_VERSION,
    averageResidual: wholePercent(avg),
    /** Rows in each band, the counts the KPI tiles show in place of the average. */
    criticalPath: inBand("critical_path"),
    actNow: inBand("act_now"),
    mitigate: inBand("mitigate"),
    watch: inBand("accept_monitor"),
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
  const levels = weights.knowledgeLevels;
  // How critical the item is sets the inherent risk; how many people hold it
  // is the control, read once here and not again in the inherent risk.
  const crit = criticality === "critical" ? levels.criticalItemLevel : levels.importantItemLevel;
  const inherent = clamp(crit, 0, 1);
  const docState = item ? documentationState(item) : "none";
  const base =
    ownerCount >= 2
      ? levels.twoHoldersLevel
      : ownerCount === 1
        ? levels.oneHolderLevel
        : levels.noHolderLevel;
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
      weight: soleOwner || ownerCount === 0 ? 1 - base : base,
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
 * A scenario's row: its likelihood and severity levels (scoring/scenario-level),
 * never its dollars or days. Each control answer reaches the row once, through
 * the likelihood model the scenario engine ran with the owner's settings; no
 * effectiveness credit or staffing uplift is laid on top.
 */
function scoreScenario(
  tpl: IndustryTemplate,
  s: ScenarioTemplate,
  staff: StaffComposition,
  weights: ScoringWeights,
  riskVariables: RiskVariableState | undefined,
): ResidualRiskScore {
  const result = runPrecogScenario(tpl, s.id, { staff, riskVariables })!;
  const levels = scenarioLevels(s.id, scenarioMultipliers(result), staff, weights);
  const residual = wholePercent(levels.index);
  const band = bandForScore(residual);

  return {
    id: `scen-${s.id}`,
    name: s.title,
    category: "scenario",
    inherent: residual,
    controlEffectiveness: 0,
    likelihoodLevel: wholePercent(levels.likelihood * 100),
    severityLevel: wholePercent(levels.severity * 100),
    residual,
    band: band.band,
    bandLabel: band.label,
    bandGuidance: band.guidance,
    drivers: [
      {
        id: `${s.id}-severity`,
        label: "Severity level",
        direction: "increases" as const,
        weight: levels.severity,
        detail: `${wholePercent(levels.severity * 100)} of 100: the kind of scheme, scaled by your controls and cash figures.`,
      },
      {
        id: `${s.id}-likelihood`,
        label: "Likelihood level",
        direction: "increases" as const,
        weight: levels.likelihood,
        detail: `${wholePercent(levels.likelihood * 100)} of 100: the kind of scheme, scaled by your controls and staffing.`,
      },
    ],
    // The illustrative loss and days are no driver: they set no rank, and the
    // panel prints them under their own label.
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
  // Items one person holds and the segregation score are not uplifts here:
  // each already enters its own rows once (the register rows, and each
  // control's separation credit).
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
  const levels = weights.controlLevels;
  const duties = c.duties.length;
  const guarded = tpl.scenarios.filter((s) => s.controlId === c.id).map((s) => scenarioFlags(s.id));
  const fraudClass =
    FRAUD_OPPORTUNITY_CONTROLS.has(c.id) || guarded.some((f) => f.fraudRelated)
      ? levels.fraudOpportunityHigh
      : levels.fraudOpportunityLow;
  const criticality = duties >= 2 ? levels.criticalityMultiDuty : levels.criticalitySingleDuty;
  const exposure =
    MONEY_EXPOSURE_CONTROLS.has(c.id) || guarded.some((f) => f.fraudRelated && f.cashRelated)
      ? levels.exposureMoney
      : levels.exposureOther;
  // Inherent exposure is evaluated before crediting the control design.
  const detectHard = levels.detectionDifficultyLevel;
  const cascade = c.id.startsWith("c-sod-") ? levels.cascadeDutySplit : levels.cascadeOther;

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
  const levels = weights.controlLevels;
  const seg = c.segregated
    ? levels.segregatedLevel
    : (staff.segregationScore / 100) * levels.segregationScoreLevel;
  const dual =
    staff.dualControlPayments && (CASH_CONTROLS.has(c.id) || PAYMENT_CONTROLS.has(c.id))
      ? levels.dualReleaseOnLevel
      : levels.dualReleaseOffLevel;
  const indRec =
    staff.independentBankRec && CASH_CONTROLS.has(c.id)
      ? levels.bankRecCashLevel
      : staff.independentBankRec
        ? levels.bankRecOtherLevel
        : levels.bankRecOffLevel;
  // Free-text descriptions are retained for review, not treated as tested
  // controls. Structured operating evidence must exist before this factor
  // can receive credit; note count, wording and duplication are irrelevant.
  const comp = 0;
  // Bank reconciliation is already the independentReconciliation term.
  // Do not also treat it as the monitoring cadence.
  const mon = levels.monitoringLevel;

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
  // A recorded acceptance never closes a gap or moves this row, so it is not
  // a driver: the duty-conflict list shows it as "Open, risk accepted".

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
