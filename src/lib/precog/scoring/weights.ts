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
