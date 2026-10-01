/**
 * Versioned weight tables for Precog residual risk scoring.
 *
 * Every number here is a weight this app chose. The residual index they
 * produce is an ordering device, not a measurement; see scoring/bands.ts for
 * the shared cutoffs and the sentence every index surface shows.
 */
import { RISK_SCALE } from "./bands";
import { clamp } from "../number";
export const SCORING_VERSION = "precog-residual-v1.5.0";

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

/** Staff composition modifiers applied after residual */
const STAFF_MODIFIERS = {
  smallTeamUplift: 0.12, // teamSize <= 6
  soleOwnerUpliftPerItem: 0,
  soleOwnerUpliftCap: 0.24,
  weakSegregationUplift: 0,
  lowTenureUplift: 0.05, // avgTenure < 3
} as const;

// A scenario's assumed loss and assumed days-to-impact are folded onto the
// same 0–100 index as controls and knowledge so they can be sorted together.
// The normalizers and weights below are this app's choices: $125,000 and 240
// days are the points at which the index saturates, the time term never falls
// below half its weight (timeFloor), however long a scenario runs before it is
// found, and effectiveness is credited at half strength. None of it is
// calibrated against loss data.
const SCENARIO_WEIGHTS = {
  lossSaturationUsd: 125_000,
  daysSaturation: 240,
  lossShare: 0.55,
  timeShare: 0.45,
  timeFloor: 0.5,
  effectivenessCredit: 0.5,
  // A scenario with nothing installed is not already partly controlled.
  baseEffectiveness: 0,
  dualControlCredit: 0.15,
  independentBankRecCredit: 0.15,
  segregationCredit: 0.25,
} as const;

/** Knowledge-item control credit for a written procedure (0–1 effectiveness added). */
const KNOWLEDGE_WEIGHTS = {
  documentedLocatedCredit: 0.15, // written AND location recorded
  documentedUnlocatedCredit: 0.07, // written, nobody recorded where
} as const;

export interface ScoringWeights {
  inherent: Record<keyof typeof INHERENT_WEIGHTS, number>;
  control: Record<keyof typeof CONTROL_EFFECTIVENESS_WEIGHTS, number>;
  staff: Record<keyof typeof STAFF_MODIFIERS, number>;
  scenario: Record<keyof typeof SCENARIO_WEIGHTS, number>;
  knowledge: Record<keyof typeof KNOWLEDGE_WEIGHTS, number>;
}

export const DEFAULT_WEIGHTS: ScoringWeights = {
  inherent: INHERENT_WEIGHTS,
  control: CONTROL_EFFECTIVENESS_WEIGHTS,
  staff: STAFF_MODIFIERS,
  scenario: SCENARIO_WEIGHTS,
  knowledge: KNOWLEDGE_WEIGHTS,
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
  "staff.smallTeamUplift":
    "Raises residual risk when a small team has fewer natural separation options.",
  "staff.soleOwnerUpliftPerItem":
    "Raises residual risk for each critical knowledge item with one strong owner.",
  "staff.soleOwnerUpliftCap":
    "The most the sole-owner uplift can add, however many items one person holds.",
  "staff.weakSegregationUplift": "Raises residual risk when the overall segregation score is weak.",
  "staff.lowTenureUplift": "Raises residual risk when average team tenure is low.",
  "scenario.lossSaturationUsd":
    "Sets the expected-loss level where scenario loss contribution reaches its ceiling.",
  "scenario.daysSaturation":
    "Sets the timeline where faster impact contributes its full scenario effect.",
  "scenario.lossShare": "Weights expected financial impact in the scenario inherent-risk blend.",
  "scenario.timeShare": "Weights time to material impact in the scenario inherent-risk blend.",
  "scenario.timeFloor":
    "The share of the time weight a scenario keeps however long it runs before someone finds it.",
  "scenario.effectivenessCredit":
    "Scales how much scenario control effectiveness reduces residual risk.",
  "scenario.baseEffectiveness":
    "Sets the baseline scenario effectiveness before Precog credits explicit controls.",
  "scenario.dualControlCredit":
    "Credits dual payment control in the effectiveness of fraud scenarios; it does not slow a departure.",
  "scenario.independentBankRecCredit":
    "Credits independent bank reconciliation in scenario effectiveness.",
  "scenario.segregationCredit": "Credits the staff segregation score in scenario effectiveness.",
  "knowledge.documentedLocatedCredit":
    "Credits a know-how item when someone has written its procedure down and recorded where it lives, so a stand-in can follow it.",
  "knowledge.documentedUnlocatedCredit":
    "Smaller credit when someone has written a procedure but nobody has recorded where it lives.",
};

export type ActionBand = "accept_monitor" | "mitigate" | "act_now" | "critical_path";

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
    label: "Watch",
    guidance: "Residual risk is tolerable if monitoring stays live. Set a re-review date.",
  },
  {
    band: "mitigate",
    min: RISK_SCALE.mitigate,
    max: RISK_SCALE.actNow - 1,
    label: "Worth doing",
    guidance: "Install compensating controls or reduce likelihood within one planning cycle.",
  },
  {
    band: "act_now",
    min: RISK_SCALE.actNow,
    max: RISK_SCALE.critical - 1,
    label: "Fix soon",
    guidance: "Priority remediation. Do not accept residual risk without owner sign-off.",
  },
  {
    band: "critical_path",
    min: RISK_SCALE.critical,
    max: 100,
    label: "Fix first",
    guidance: "Material control failure path. Address before other nice-to-haves.",
  },
];

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
