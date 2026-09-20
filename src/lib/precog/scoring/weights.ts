/**
 * Versioned weight tables for Precog residual risk scoring.
 *
 * Every number here is a weight this app chose. The residual index they
 * produce is an ordering device, not a measurement; see scoring/bands.ts for
 * the shared cutoffs and the sentence every index surface shows.
 */
import { RISK_SCALE } from "./bands";
export const SCORING_VERSION = "precog-residual-v1.0.0";

/** Inherent risk factors (0–1 contribution before normalization) */
export const INHERENT_WEIGHTS = {
  assetExposure: 0.28,
  processCriticality: 0.22,
  fraudOpportunityClass: 0.25,
  detectionDifficulty: 0.15,
  cascadePotential: 0.1,
} as const;

/** Control effectiveness factors (higher = stronger control) */
export const CONTROL_EFFECTIVENESS_WEIGHTS = {
  segregationQuality: 0.3,
  dualAuthorization: 0.15,
  independentReconciliation: 0.15,
  compensatingControls: 0.15,
  monitoringCadence: 0.15,
  knowledgeRedundancy: 0.1,
} as const;

/** Staff composition modifiers applied after residual */
export const STAFF_MODIFIERS = {
  smallTeamUplift: 0.12, // teamSize <= 6
  soleOwnerUpliftPerItem: 0.06, // capped
  weakSegregationUplift: 0.15, // segregationScore < 50
  lowTenureUplift: 0.05, // avgTenure < 3
} as const;

// A scenario's assumed loss and assumed days-to-impact are folded onto the
// same 0–100 index as controls and knowledge so they can be sorted together.
// The normalizers and weights below are this app's choices: $125,000 and 240
// days are the points at which the index saturates, and effectiveness is
// credited at half strength. None of it is calibrated against loss data.
export const SCENARIO_WEIGHTS = {
  lossSaturationUsd: 125_000,
  daysSaturation: 240,
  lossShare: 0.55,
  timeShare: 0.45,
  effectivenessCredit: 0.5,
  baseEffectiveness: 0.2,
  dualControlCredit: 0.15,
  independentBankRecCredit: 0.15,
  segregationCredit: 0.25,
} as const;

export interface ScoringWeights {
  inherent: Record<keyof typeof INHERENT_WEIGHTS, number>;
  control: Record<keyof typeof CONTROL_EFFECTIVENESS_WEIGHTS, number>;
  staff: Record<keyof typeof STAFF_MODIFIERS, number>;
  scenario: Record<keyof typeof SCENARIO_WEIGHTS, number>;
}

export const DEFAULT_WEIGHTS: ScoringWeights = {
  inherent: INHERENT_WEIGHTS,
  control: CONTROL_EFFECTIVENESS_WEIGHTS,
  staff: STAFF_MODIFIERS,
  scenario: SCENARIO_WEIGHTS,
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
  "control.dualAuthorization": "Weights a second approver as evidence of control strength.",
  "control.independentReconciliation": "Weights independent checking of records and balances.",
  "control.compensatingControls":
    "Weights documented backup controls when primary separation is limited.",
  "control.monitoringCadence": "Weights recurring monitoring as a source of control strength.",
  "control.knowledgeRedundancy":
    "Weights having more than one capable holder of critical knowledge.",
  "staff.smallTeamUplift":
    "Raises residual risk when a small team has fewer natural separation options.",
  "staff.soleOwnerUpliftPerItem":
    "Raises residual risk for each critical knowledge item with one strong owner.",
  "staff.weakSegregationUplift": "Raises residual risk when the overall segregation score is weak.",
  "staff.lowTenureUplift": "Raises residual risk when average team tenure is low.",
  "scenario.lossSaturationUsd":
    "Sets the expected-loss level where scenario loss contribution reaches its ceiling.",
  "scenario.daysSaturation":
    "Sets the timeline where faster impact contributes its full scenario effect.",
  "scenario.lossShare": "Weights expected financial impact in the scenario inherent-risk blend.",
  "scenario.timeShare": "Weights time to material impact in the scenario inherent-risk blend.",
  "scenario.effectivenessCredit":
    "Scales how much scenario control effectiveness reduces residual risk.",
  "scenario.baseEffectiveness":
    "Sets the baseline scenario effectiveness before explicit controls are credited.",
  "scenario.dualControlCredit": "Credits dual payment control in scenario effectiveness.",
  "scenario.independentBankRecCredit":
    "Credits independent bank reconciliation in scenario effectiveness.",
  "scenario.segregationCredit": "Credits the staff segregation score in scenario effectiveness.",
};

export type ActionBand = "accept_monitor" | "mitigate" | "act_now" | "critical_path";

export const ACTION_BANDS: {
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
    label: "Accept & monitor",
    guidance: "Residual risk is tolerable if monitoring stays live. Set a re-review date.",
  },
  {
    band: "mitigate",
    min: RISK_SCALE.mitigate,
    max: RISK_SCALE.actNow - 1,
    label: "Mitigate",
    guidance: "Install compensating controls or reduce likelihood within one planning cycle.",
  },
  {
    band: "act_now",
    min: RISK_SCALE.actNow,
    max: RISK_SCALE.critical - 1,
    label: "Act now",
    guidance: "Priority remediation. Do not accept residual risk without owner sign-off.",
  },
  {
    band: "critical_path",
    min: RISK_SCALE.critical,
    max: 100,
    label: "Critical path",
    guidance: "Material control failure path. Address before other nice-to-haves.",
  },
];

export function bandForScore(score: number): (typeof ACTION_BANDS)[number] {
  const s = Math.max(0, Math.min(100, score));
  return (
    ACTION_BANDS.find((b) => s >= b.min && s <= b.max) ?? ACTION_BANDS[ACTION_BANDS.length - 1]
  );
}
