import { formatPct, formatUsd } from "@/lib/utils";

/** A weight as the customer reads it: a dollar or day figure with its unit, a share as a percentage. */
export function formatWeight(key: string, value: number): string {
  const unit = UNIT[key];
  if (unit === "usd") return formatUsd(value);
  if (unit === "days") return `${value} days`;
  return formatPct(value);
}

/** A weight key in plain words ("Loss at which the index tops out"). */
export function weightLabel(key: string): string {
  return WEIGHT_LABEL[key] ?? key;
}

/** Weights that are not shares: the two points at which the scenario index saturates. */
export const UNIT: Record<string, "usd" | "days"> = {
  lossSaturationUsd: "usd",
  daysSaturation: "days",
};

/** Plain names for the weight keys in scoring/weights.ts. */
const WEIGHT_LABEL: Record<string, string> = {
  assetExposure: "Asset exposure",
  processCriticality: "Process criticality",
  fraudOpportunityClass: "Fraud opportunity",
  detectionDifficulty: "Detection difficulty",
  cascadePotential: "Knock-on effects",
  segregationQuality: "Separation of duties",
  dualAuthorization: "Two-person approval",
  independentReconciliation: "Independent reconciliation",
  compensatingControls: "Compensating controls",
  monitoringCadence: "Monitoring frequency",
  knowledgeRedundancy: "Know-how with a stand-in",
  smallTeamUplift: "Small-team uplift",
  soleOwnerUpliftPerItem: "Uplift per item one person holds",
  soleOwnerUpliftCap: "Most the one-person uplift can add",
  weakSegregationUplift: "Weak-separation uplift",
  lowTenureUplift: "Short-tenure uplift",
  lossSaturationUsd: "Loss at which the index tops out",
  daysSaturation: "Days at which the index tops out",
  lossShare: "Share from the loss",
  timeShare: "Share from time to impact",
  timeFloor: "Least of the time share a slow scenario keeps",
  effectivenessCredit: "Credit for control effectiveness",
  baseEffectiveness: "Starting control effectiveness",
  dualControlCredit: "Two-person approval credit",
  independentBankRecCredit: "Independent bank reconciliation credit",
  segregationCredit: "Separation of duties credit",
  documentedLocatedCredit: "Written and findable credit",
  documentedUnlocatedCredit: "Written, location unknown credit",
};
