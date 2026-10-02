import { formatPct, formatUsd } from "@/lib/utils";

/** A weight as the customer reads it: a dollar figure, a multiplier or an index value with its unit, a share as a percentage. */
export function formatWeight(key: string, value: number): string {
  const unit = UNIT[key];
  if (unit === "usd") return formatUsd(value);
  if (unit === "times") return `×${value}`;
  if (unit === "points") return `${value} of 100`;
  return formatPct(value);
}

/** A weight key in plain words ("Loss at which the index tops out"). */
export function weightLabel(key: string): string {
  return WEIGHT_LABEL[key] ?? key;
}

/** Weights that are not shares: dollar figures, multipliers and index values. */
export const UNIT: Record<string, "usd" | "times" | "points"> = {
  cashReferenceUsd: "usd",
  smallTeamFactor: "times",
  soleHolderFactor: "times",
  weakSegregationFactor: "times",
  noDualReleaseFactor: "times",
  noBankRecFactor: "times",
  lowTenureFactor: "times",
  camerasFraudLikelihood: "times",
  camerasOtherLikelihood: "times",
  camerasDetectionLag: "times",
  dualFraudLikelihood: "times",
  dualOtherLikelihood: "times",
  dualSeverity: "times",
  bankRecLikelihood: "times",
  bankRecDetectionLag: "times",
  bankRecSeverity: "times",
  alarmCashLikelihood: "times",
  alarmOtherLikelihood: "times",
  bondedLikelihood: "times",
  bondedSeverity: "times",
  unheldIndex: "points",
  soleCriticalIndex: "points",
  soleImportantIndex: "points",
  sharedIndex: "points",
};

/** Plain names for the weight keys in scoring/weights.ts. */
const WEIGHT_LABEL: Record<string, string> = {
  assetExposure: "Asset exposure",
  processCriticality: "Process criticality",
  fraudOpportunityClass: "Fraud opportunity",
  detectionDifficulty: "Detection difficulty",
  cascadePotential: "Knock-on effects",
  segregationQuality: "Separation of duties",
  dualAuthorization: "Dual release",
  independentReconciliation: "Independent reconciliation",
  compensatingControls: "Compensating controls",
  monitoringCadence: "Monitoring frequency",
  knowledgeRedundancy: "Know-how with a stand-in",
  fraudOpportunityHigh: "Fraud opportunity, money controls",
  fraudOpportunityLow: "Fraud opportunity, other controls",
  criticalityMultiDuty: "Criticality, two or more duties",
  criticalitySingleDuty: "Criticality, one duty",
  exposureMoney: "Exposure, money held or paid",
  exposureOther: "Exposure, other controls",
  detectionDifficultyLevel: "Detection difficulty level",
  cascadeDutySplit: "Knock-on, duty split controls",
  cascadeOther: "Knock-on, other controls",
  segregatedLevel: "Duties held by different people",
  segregationScoreLevel: "Most credit from the segregation score",
  dualReleaseOnLevel: "Dual release on a cash or payment control",
  dualReleaseOffLevel: "Dual release elsewhere or off",
  bankRecCashLevel: "Bank reconciliation on a cash control",
  bankRecOtherLevel: "Bank reconciliation on other controls",
  bankRecOffLevel: "No independent bank reconciliation",
  monitoringLevel: "Monitoring level",
  smallTeamUplift: "Small-team uplift",
  lowTenureUplift: "Short-tenure uplift",
  severityShare: "Share from the severity level",
  likelihoodShare: "Share from the likelihood level",
  severityCashFraud: "Starting severity, cash fraud",
  severityFraud: "Starting severity, other fraud",
  severityNotFraud: "Starting severity, not fraud",
  likelihoodFraud: "Starting likelihood, fraud",
  likelihoodNotFraud: "Starting likelihood, not fraud",
  smallTeamFactor: "Small team",
  soleHolderFactor: "Items one person holds",
  weakSegregationFactor: "Weak segregation score",
  noDualReleaseFactor: "No dual release",
  noBankRecFactor: "No independent bank reconciliation",
  lowTenureFactor: "Short tenure",
  timelineReliefShare: "Mitigation share taken off the days",
  camerasFraudLikelihood: "Cameras, fraud likelihood",
  camerasOtherLikelihood: "Cameras, other likelihood",
  camerasDetectionLag: "Cameras, days until found",
  dualFraudLikelihood: "Dual release, fraud likelihood",
  dualOtherLikelihood: "Dual release, other likelihood",
  dualSeverity: "Dual release, scheme size",
  bankRecLikelihood: "Bank reconciliation, likelihood",
  bankRecDetectionLag: "Bank reconciliation, days until found",
  bankRecSeverity: "Bank reconciliation, scheme size",
  alarmCashLikelihood: "Alarm, cash scheme likelihood",
  alarmOtherLikelihood: "Alarm, other likelihood",
  bondedLikelihood: "Bonded handlers, likelihood",
  bondedSeverity: "Bonded handlers, scheme size",
  cashReferenceUsd: "Daily cash reference",
  documentedLocatedCredit: "Written and findable credit",
  documentedUnlocatedCredit: "Written, location unknown credit",
  criticalItemLevel: "Critical item",
  importantItemLevel: "Important item",
  twoHoldersLevel: "Two or more holders",
  oneHolderLevel: "One holder",
  noHolderLevel: "No holder",
  unheldIndex: "Nobody holds it",
  soleCriticalIndex: "One holder, critical",
  soleImportantIndex: "One holder, important",
  sharedIndex: "Two or more holders",
};
