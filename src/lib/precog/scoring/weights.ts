/**
 * Versioned weight tables for Precog residual risk scoring.
 *
 * Every number here is a weight this app chose. The residual index they
 * produce is an ordering device, not a measurement; see scoring/bands.ts for
 * the shared cutoffs and the sentence every index surface shows. Every
 * constant the residual engine, the scenario engine and the likelihood model
 * read lives here, so SCORING_VERSION covers all of them.
 */
import { RISK_SCALE } from "./bands";
import { clamp } from "../number";
/**
 * 1.6.0 (2 October 2026): one rule for open duty conflicts, one band table,
 * each control answer read once, placeholder scenario dollars out of the
 * ranking, map completeness in place of map health. See docs/SCORING_1.6.md.
 */
export const SCORING_VERSION = "precog-residual-v1.6.0";

/** Inherent risk factors (0–1 contribution before normalization) */
const INHERENT_WEIGHTS = {
  assetExposure: 0.28,
  processCriticality: 0.22,
  fraudOpportunityClass: 0.25,
  detectionDifficulty: 0.15,
  cascadePotential: 0.1,
} as const;

/** Control effectiveness factors (higher = stronger control) */
const CONTROL_EFFECTIVENESS_WEIGHTS = {
  segregationQuality: 0.3,
  dualAuthorization: 0.15,
  independentReconciliation: 0.15,
  compensatingControls: 0.15,
  monitoringCadence: 0.15,
  knowledgeRedundancy: 0.1,
} as const;

/**
 * Staff composition modifiers applied after residual to control and register
 * rows. A scenario row reads its staffing through its likelihood level
 * instead (see SCENARIO_STAFF_UPLIFT), so no staffing condition counts twice
 * on one row.
 */
const STAFF_MODIFIERS = {
  smallTeamUplift: 0.12, // teamSize <= 6
  lowTenureUplift: 0.05, // avgTenure < 3
} as const;

/**
 * The fixed levels (0–1) a control row reads. Inherent levels describe the
 * control's duties and the scenarios it guards; effectiveness levels describe
 * the owner's answers, each read once.
 */
const CONTROL_LEVELS = {
  fraudOpportunityHigh: 0.85,
  fraudOpportunityLow: 0.45,
  criticalityMultiDuty: 0.8,
  criticalitySingleDuty: 0.5,
  exposureMoney: 0.9,
  exposureOther: 0.55,
  detectionDifficultyLevel: 0.75,
  cascadeDutySplit: 0.7,
  cascadeOther: 0.4,
  segregatedLevel: 0.9,
  segregationScoreLevel: 0.45,
  dualReleaseOnLevel: 0.85,
  dualReleaseOffLevel: 0.15,
  bankRecCashLevel: 0.9,
  bankRecOtherLevel: 0.45,
  bankRecOffLevel: 0.1,
  monitoringLevel: 0.25,
} as const;

/**
 * The levels (0–1) a know-how row reads: how critical the item is sets its
 * inherent risk, and how many strong holders it has sets the control. The
 * holder count is read once, as the control.
 */
const KNOWLEDGE_LEVELS = {
  criticalItemLevel: 0.9,
  importantItemLevel: 0.6,
  twoHoldersLevel: 0.7,
  oneHolderLevel: 0.25,
  noHolderLevel: 0.05,
} as const;

// A scenario row ranks on two levels, never on the scenario's dollar or day
// figures, which are illustrative examples not sized to any business. Each
// level starts from the kind of scheme (cash fraud, other fraud, not fraud)
// and moves with the owner's answers through one path each: the likelihood
// model (LIKELIHOOD_WEIGHTS) for controls, and the staffing conditions in
// SCENARIO_STAFF_UPLIFT for the team. Shares and starting levels are this
// app's choices, not calibrated against loss data.
const SCENARIO_WEIGHTS = {
  severityShare: 0.55,
  likelihoodShare: 0.45,
  severityCashFraud: 0.65,
  severityFraud: 0.55,
  severityNotFraud: 0.4,
  likelihoodFraud: 0.4,
  likelihoodNotFraud: 0.3,
} as const;

/**
 * Multipliers on a scenario's assumed loss and timeline (scenario page) and
 * on its likelihood level (residual index) for staffing conditions. The two
 * control answers among them (dual release, bank reconciliation) move the
 * scenario page only: the residual index reads those answers through the
 * likelihood model, once.
 */
const SCENARIO_STAFF_UPLIFT = {
  smallTeamFactor: 1.15,
  soleHolderFactor: 1.2,
  weakSegregationFactor: 1.25,
  noDualReleaseFactor: 1.08,
  noBankRecFactor: 1.06,
  lowTenureFactor: 1.05,
  timelineReliefShare: 0.4,
} as const;

/** How the owner's controls and cash intensity move likelihood, scheme size and days until found. */
const LIKELIHOOD_WEIGHTS = {
  camerasFraudLikelihood: 0.88,
  camerasOtherLikelihood: 0.95,
  camerasDetectionLag: 0.92,
  dualFraudLikelihood: 0.72,
  dualOtherLikelihood: 0.9,
  dualSeverity: 0.85,
  bankRecLikelihood: 0.9,
  bankRecDetectionLag: 0.75,
  bankRecSeverity: 0.88,
  alarmCashLikelihood: 0.94,
  alarmOtherLikelihood: 0.97,
  bondedLikelihood: 0.93,
  bondedSeverity: 0.97,
  cashReferenceUsd: 2500,
} as const;

/** Index values (0–100) for know-how held by too few people, on the residual index's scale. */
const KNOWLEDGE_RISK_INDEX = {
  unheldIndex: 100,
  soleCriticalIndex: 85,
  soleImportantIndex: 65,
  sharedIndex: 20,
} as const;

/** Knowledge-item control credit for a written procedure (0–1 effectiveness added). */
const KNOWLEDGE_WEIGHTS = {
  documentedLocatedCredit: 0.15, // written AND location recorded
  documentedUnlocatedCredit: 0.07, // written, nobody recorded where
} as const;

export interface ScoringWeights {
  inherent: Record<keyof typeof INHERENT_WEIGHTS, number>;
  control: Record<keyof typeof CONTROL_EFFECTIVENESS_WEIGHTS, number>;
  controlLevels: Record<keyof typeof CONTROL_LEVELS, number>;
  staff: Record<keyof typeof STAFF_MODIFIERS, number>;
  scenario: Record<keyof typeof SCENARIO_WEIGHTS, number>;
  scenarioStaff: Record<keyof typeof SCENARIO_STAFF_UPLIFT, number>;
  likelihood: Record<keyof typeof LIKELIHOOD_WEIGHTS, number>;
  knowledge: Record<keyof typeof KNOWLEDGE_WEIGHTS, number>;
  knowledgeLevels: Record<keyof typeof KNOWLEDGE_LEVELS, number>;
  knowledgeIndex: Record<keyof typeof KNOWLEDGE_RISK_INDEX, number>;
}

export const DEFAULT_WEIGHTS: ScoringWeights = {
  inherent: INHERENT_WEIGHTS,
  control: CONTROL_EFFECTIVENESS_WEIGHTS,
  controlLevels: CONTROL_LEVELS,
  staff: STAFF_MODIFIERS,
  scenario: SCENARIO_WEIGHTS,
  scenarioStaff: SCENARIO_STAFF_UPLIFT,
  likelihood: LIKELIHOOD_WEIGHTS,
  knowledge: KNOWLEDGE_WEIGHTS,
  knowledgeLevels: KNOWLEDGE_LEVELS,
  knowledgeIndex: KNOWLEDGE_RISK_INDEX,
};

export const WEIGHT_DESCRIPTIONS: Record<string, string> = {
  "inherent.assetExposure": "Weights how much valuable cash, assets, or processes are in scope.",
  "inherent.processCriticality":
    "Weights how disruptive a process failure would be to the business.",
  "inherent.fraudOpportunityClass":
    "Weights how much opportunity the duty pattern creates for misuse.",
  "inherent.detectionDifficulty": "Weights how difficult an issue would be to notice promptly.",
  "inherent.cascadePotential": "Weights how widely one gap could affect connected work.",
  "control.segregationQuality": "Weights separation of incompatible duties as control strength.",
  "control.dualAuthorization": "Weights a second signer as evidence of control strength.",
  "control.independentReconciliation": "Weights independent checking of records and balances.",
  "control.compensatingControls":
    "Reserved for tested compensating measures. Free-text control notes receive no effectiveness credit.",
  "control.monitoringCadence": "Weights recurring monitoring as a source of control strength.",
  "control.knowledgeRedundancy":
    "Weights having more than one capable holder of critical knowledge.",
  "controlLevels.fraudOpportunityHigh":
    "Fraud opportunity of a control over cash, payments, billing or receivables, or one a fraud scenario names.",
  "controlLevels.fraudOpportunityLow": "Fraud opportunity of every other control.",
  "controlLevels.criticalityMultiDuty": "Criticality of a control that covers two or more duties.",
  "controlLevels.criticalitySingleDuty": "Criticality of a control that covers one duty.",
  "controlLevels.exposureMoney": "Exposure of a control over money held or paid out.",
  "controlLevels.exposureOther": "Exposure of every other control.",
  "controlLevels.detectionDifficultyLevel":
    "Detection difficulty, the same for every control before any control credit.",
  "controlLevels.cascadeDutySplit": "Knock-on effect of a control that splits a pair of duties.",
  "controlLevels.cascadeOther": "Knock-on effect of every other control.",
  "controlLevels.segregatedLevel":
    "Separation credit when different people hold the control's duties.",
  "controlLevels.segregationScoreLevel":
    "Most separation credit the team's segregation score gives a control whose duties one person holds.",
  "controlLevels.dualReleaseOnLevel":
    "Dual release credit on a cash or payment control when two people approve payments.",
  "controlLevels.dualReleaseOffLevel": "Dual release credit on every other control.",
  "controlLevels.bankRecCashLevel":
    "Reconciliation credit on a cash control when someone independent reconciles the bank.",
  "controlLevels.bankRecOtherLevel":
    "Reconciliation credit on every other control when someone independent reconciles the bank.",
  "controlLevels.bankRecOffLevel": "Reconciliation credit with no independent bank reconciliation.",
  "controlLevels.monitoringLevel":
    "Monitoring credit, the same for every control until monitoring evidence is recorded.",
  "staff.smallTeamUplift":
    "Raises residual risk on control and know-how rows when a team of six or fewer has fewer ways to keep duties apart.",
  "staff.lowTenureUplift":
    "Raises residual risk on control and know-how rows when average tenure is under three years.",
  "scenario.severityShare": "Weights the severity level in a scenario's residual index.",
  "scenario.likelihoodShare": "Weights the likelihood level in a scenario's residual index.",
  "scenario.severityCashFraud":
    "Starting severity of a fraud that runs through cash, deposits or payments.",
  "scenario.severityFraud": "Starting severity of any other fraud.",
  "scenario.severityNotFraud":
    "Starting severity of a departure or another loss that is not fraud.",
  "scenario.likelihoodFraud": "Starting likelihood of a fraud scenario.",
  "scenario.likelihoodNotFraud": "Starting likelihood of a scenario that is not fraud.",
  "scenarioStaff.smallTeamFactor":
    "Raises likelihood, and the scenario page's loss and days, when the team has six or fewer people.",
  "scenarioStaff.soleHolderFactor":
    "Raises likelihood, and the scenario page's loss and days, when two or more critical items have one strong holder.",
  "scenarioStaff.weakSegregationFactor":
    "Raises likelihood, and the scenario page's loss and days, when the segregation score is under 50.",
  "scenarioStaff.noDualReleaseFactor":
    "Raises the scenario page's loss and days with no dual release. The residual index reads dual release through the likelihood model instead.",
  "scenarioStaff.noBankRecFactor":
    "Raises the scenario page's loss and days with no independent bank reconciliation. The residual index reads it through the likelihood model instead.",
  "scenarioStaff.lowTenureFactor":
    "Raises likelihood, and the scenario page's loss and days, when average tenure is under three years.",
  "scenarioStaff.timelineReliefShare":
    "Share of a mitigation's loss reduction the scenario page also takes off the days until found.",
  "likelihood.camerasFraudLikelihood": "Likelihood of a fraud scenario with security cameras.",
  "likelihood.camerasOtherLikelihood": "Likelihood of any other scenario with security cameras.",
  "likelihood.camerasDetectionLag": "Days until found with security cameras.",
  "likelihood.dualFraudLikelihood": "Likelihood of a fraud scenario with dual release.",
  "likelihood.dualOtherLikelihood":
    "Likelihood of any other scenario with dual release, on the scenario page's loss and days. The residual index leaves dual release out of a scenario that is not fraud.",
  "likelihood.dualSeverity":
    "Size of a scheme with dual release. The residual index applies it to fraud scenarios only.",
  "likelihood.bankRecLikelihood": "Likelihood with an independent bank reconciliation.",
  "likelihood.bankRecDetectionLag": "Days until found with an independent bank reconciliation.",
  "likelihood.bankRecSeverity": "Size of a scheme with an independent bank reconciliation.",
  "likelihood.alarmCashLikelihood": "Likelihood of a cash scheme with an alarm or access control.",
  "likelihood.alarmOtherLikelihood":
    "Likelihood of any other scheme with an alarm or access control.",
  "likelihood.bondedLikelihood": "Likelihood with bonded or background-checked cash handlers.",
  "likelihood.bondedSeverity": "Size of a scheme with bonded or background-checked cash handlers.",
  "likelihood.cashReferenceUsd":
    "The daily cash figure at which cash intensity neither raises nor lowers a cash scheme.",
  "knowledge.documentedLocatedCredit":
    "Credits a know-how item when someone has written its procedure down and recorded where it lives, so a stand-in can follow it.",
  "knowledge.documentedUnlocatedCredit":
    "Smaller credit when someone has written a procedure but nobody has recorded where it lives.",
  "knowledgeLevels.criticalItemLevel": "Inherent risk of a know-how item marked critical.",
  "knowledgeLevels.importantItemLevel": "Inherent risk of a know-how item marked important.",
  "knowledgeLevels.twoHoldersLevel": "Control credit when two or more people can do the item well.",
  "knowledgeLevels.oneHolderLevel": "Control credit when one person can do the item well.",
  "knowledgeLevels.noHolderLevel": "Control credit when nobody can do the item well.",
  "knowledgeIndex.unheldIndex": "Index for an item nobody can do well.",
  "knowledgeIndex.soleCriticalIndex": "Index for a critical item one person holds.",
  "knowledgeIndex.soleImportantIndex": "Index for an important item one person holds.",
  "knowledgeIndex.sharedIndex": "Index for an item two or more people hold.",
};

export type ActionBand = "accept_monitor" | "mitigate" | "act_now" | "critical_path";

/**
 * The residual index's bands, by how much risk is left: Low, Moderate, High
 * and Severe. They are not the priority list's words: "Fix first" names only
 * the priority list's top band (PRIORITY_BAND_LABEL in bands.ts), so the two
 * scales never share a label with different cutoffs.
 */
const ACTION_BANDS: {
  band: ActionBand;
  min: number;
  max: number;
  label: string;
  guidance: string;
}[] = [
  {
    band: "accept_monitor",
    min: 0,
    max: RISK_SCALE.mitigate - 1,
    label: "Low",
    guidance: "Little risk is left. Keep your checks running and look again at your next review.",
  },
  {
    band: "mitigate",
    min: RISK_SCALE.mitigate,
    max: RISK_SCALE.actNow - 1,
    label: "Moderate",
    guidance: "Add a check, or a second person, in the next few months.",
  },
  {
    band: "act_now",
    min: RISK_SCALE.actNow,
    max: RISK_SCALE.critical - 1,
    label: "High",
    guidance: "Close this gap soon. Leave it open only if the owner decides to and logs it.",
  },
  {
    band: "critical_path",
    min: RISK_SCALE.critical,
    max: 100,
    label: "Severe",
    guidance: "A serious gap in your controls. Close it before other improvements.",
  },
];

/**
 * Each residual band's label and its whole-number range (min to max), for
 * tiles, notes and the glossary that print a band's cutoffs.
 */
export const RESIDUAL_BANDS = Object.fromEntries(
  ACTION_BANDS.map(({ band, label, min, max }) => [band, { label, min, max }]),
) as Record<ActionBand, { label: string; min: number; max: number }>;

/** Each residual band's label, for tiles and notes that name a band without a score. */
export const RESIDUAL_BAND_LABEL = Object.fromEntries(
  ACTION_BANDS.map((b) => [b.band, b.label]),
) as Record<ActionBand, string>;

/**
 * The band a 0–100 score falls in: the highest band whose minimum it reaches,
 * so a score between two integer bands (39.5) stays in the lower one.
 */
export function bandForScore(score: number): (typeof ACTION_BANDS)[number] {
  const s = clamp(score, 0, 100);
  let found = ACTION_BANDS[0];
  for (const band of ACTION_BANDS) if (s >= band.min) found = band;
  return found;
}
