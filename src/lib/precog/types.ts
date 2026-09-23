export type MatrixLayerId =
  "surface" | "process" | "knowledge" | "control" | "source" | "continuity";

export type Criticality = "critical" | "important" | "nice-to-have";
export type KnowledgeLevel = "expert" | "proficient" | "basic" | "aware";
export type KnowledgeCategory =
  "process" | "system" | "clinical" | "compliance" | "vendor" | "tribal";

export type ProcessRiskKind =
  "control" | "fraud" | "continuity" | "quality" | "compliance" | "revenue" | "safety";

export type LeanWasteKind =
  "muda_waiting" | "muda_rework" | "muda_motion" | "muda_overprocessing" | "mura" | "muri";

export interface ProcessRisk {
  id: string;
  title: string;
  kind: ProcessRiskKind;
  severity: 1 | 2 | 3 | 4 | 5;
  likelihood: 1 | 2 | 3 | 4 | 5;
  note: string;
  linkedControlId?: string;
  linkedScenarioId?: string;
  linkedKnowledgeId?: string;
}

export interface ProcessIdea {
  id: string;
  title: string;
  category: "control" | "lean" | "tech" | "training" | "policy";
  effort: "low" | "medium" | "high";
  impact: "low" | "medium" | "high";
  note: string;
  status: "backlog" | "exploring" | "planned" | "done";
}

export interface ProcessWaste {
  id: string;
  kind: LeanWasteKind;
  label: string;
  note: string;
}

export interface Person {
  id: string;
  name: string;
  role: string;
  active: boolean;
  /** Years of service. Undefined when unknown; never defaulted, so unknown tenure adds nothing to any score. */
  tenureYears?: number;
  /**
   * Last working day (owner's calendar) once they have given notice. They stay
   * active — and count for coverage — until marked as left; the planner runs a
   * hand-over against this date.
   */
  lastDay?: string;
  /** Explicit duty entitlements when role is custom or needs override. */
  entitlements?: string[];
  /** Department or cost centre from the roster, kept for grouping; the engines ignore it. */
  department?: string;
  /** The employee id the HR or payroll roster gave this person; re-imports match on it. */
  employeeId?: string;
}

export type KnowledgeKind = "duty" | "task" | "knowledge";

export interface KnowledgeItem {
  id: string;
  name: string;
  criticality: Criticality;
  category: KnowledgeCategory;
  description: string;
  linkedProcessIds: string[];
  /** Recurring responsibility, discrete task, or know-how. Absent = knowledge. */
  kind?: KnowledgeKind;
  /** A written procedure exists that a backup could follow. */
  documented?: boolean;
  /** Where that procedure lives (shared drive path, binder, URL) so a stand-in can find it. */
  procedureLocation?: string;
  /** ISO date (YYYY-MM-DD) the owner last confirmed who holds this and whether it is documented. Absent = never confirmed. */
  confirmedAt?: string;
}

export interface KnowledgeRelation {
  personId: string;
  knowledgeId: string;
  level: KnowledgeLevel;
}

export type EvidenceFrequency = "daily" | "weekly" | "monthly" | "quarterly" | "annual";

/** A recurring review/attestation that proves a control is operating. */
export interface EvidenceItem {
  id: string;
  label: string;
  frequency: EvidenceFrequency;
  reviewerPersonId?: string;
  /** ISO timestamp of the last completed review. */
  lastDoneAt?: string;
  note?: string;
}

/** How often a process runs. Drives the continuity view of what stops, and how soon, when the owner is out. */
export type ProcessCadence =
  "continuous" | "daily" | "weekly" | "monthly" | "quarterly" | "annual" | "ad-hoc";

export interface ProcessNode {
  id: string;
  name: string;
  layer: MatrixLayerId;
  description: string;
  dependencies: string[];
  controlIds: string[];
  /** Value-stream stage order (left-to-right) */
  stage?: number;
  ownerPersonIds?: string[];
  risks?: ProcessRisk[];
  ideas?: ProcessIdea[];
  wastes?: ProcessWaste[];
  inputs?: string[];
  outputs?: string[];
  evidence?: EvidenceItem[];
  /** How often the process runs. Absent = not recorded. */
  cadence?: ProcessCadence;
  /** Software, portals, or physical systems the process runs in (practice-management system, bank portal, payroll provider). */
  systems?: string[];
  /**
   * A written procedure exists that a stand-in could follow. Mirrors
   * KnowledgeItem.documented so continuity logic reads both the same way.
   * Absent = not recorded, which the map treats as nothing written down.
   */
  documented?: boolean;
  /** Where that procedure lives (shared drive path, binder, URL). */
  procedureLocation?: string;
}

export interface ControlItem {
  id: string;
  name: string;
  description: string;
  duties: string[];
  segregated: boolean;
  compensatingControls: string[];
  residualRiskAccepted: boolean;
  /**
   * Carried over from the industry example onto an owner's own business, and
   * not yet confirmed to run there. Its "segregated" flag is the example's,
   * not a fact about this business.
   */
  starter?: boolean;
}

export interface StaffComposition {
  teamSize: number;
  soleOwnerKnowledgeCount: number;
  avgTenureYears: number;
  segregationScore: number; // 0-100
  /** "manual" when the owner overrode the derived segregation score. Absent = derived when a real team exists. */
  segregationSource?: "derived" | "manual";
  dualControlPayments: boolean;
  independentBankRec: boolean;
  /** "manual" when the owner set the bank-reconciliation flag by hand. Absent or "derived" = read from the team's duties when the team changes. */
  bankRecSource?: "derived" | "manual";
}

/**
 * Published fraud statistics, and the one modelling assumption the app makes.
 *
 * These figures used to be invented — an "industryEmbezzlementRate" of 18%,
 * varied per industry (16%, 18%, 22%) to look precise. No published source
 * gives an annual probability of occupational fraud for a small business in a
 * given industry, so those numbers asserted something nobody knows. They are
 * replaced here by what the research does establish, and the one number that
 * remains a judgement call is named as such rather than dressed as a measurement.
 *
 * Because no source supports per-industry variation, this record is shared
 * across every industry template rather than differing between them.
 */
export interface CrimeFraudStats {
  /**
   * A modelling assumption, NOT an observed rate: the prior probability the
   * Bayesian reasoning module starts from before it sees anything about a
   * specific business. Deliberately weak, so evidence about the actual
   * business moves it quickly, and deliberately uniform across industries.
   */
  assumedControlFailurePrior: number;
  /** Median loss, organizations under 100 employees. */
  medianLossSmallOrgUsd: number;
  /** Median loss across all cases studied, any size. */
  medianLossAllUsd: number;
  /** Estimated share of annual revenue organizations lose to fraud. */
  revenueLossRateAnnual: number;
  /** Median months from when a scheme starts to when it is found. */
  medianDetectionMonths: number;
  /** Median loss where a scheme is caught inside six months. */
  lossIfCaughtEarlyUsd: number;
  /** Median loss where a scheme runs beyond five years. */
  lossIfRunsLongUsd: number;
  /** Share of cases found within six months. */
  shareFoundUnderSixMonths: number;
  /** Share of cases that ran beyond five years. */
  shareRunningOverFiveYears: number;
  source: string;
  /** Link to the study, so a reader can check any figure above. */
  sourceUrl: string;
}

export interface ScenarioTemplate {
  id: string;
  title: string;
  description: string;
  controlId?: string;
  knowledgeId?: string;
  baseTimelineDays: { p50: number; p95Low: number; p95High: number };
  baseFinancialImpact: { expected: number; low: number; high: number };
  cascadeLayers: MatrixLayerId[];
  mitigations: MitigationOption[];
}

export interface MitigationOption {
  id: string;
  label: string;
  effort: "low" | "medium" | "high";
  riskReduction: number; // 0-1
  costAnnual: number;
}

export interface DynamicRiskSlice {
  likelihoodMultiplier: number;
  grossSeverityMultiplier: number;
  detectionLagMultiplier: number;
  grossExpected: number;
  retainedExpected: number;
  transferredExpected: number;
  premiumAnnualNet: number;
  discountPctApplied: number;
  expectedAnnualCostOfRisk: number;
  eventPlusPremiumExpected: number;
  drivers: { id: string; label: string; effect: string; on: string }[];
  discountLines: { label: string; pct: number; active: boolean; reason: string }[];
  notes: string[];
}

export interface PrecogResult {
  scenarioId: string;
  timelineDays: { p50: number; p95Low: number; p95High: number };
  confidenceLabel: string;
  /** Gross loss before insurance retention */
  financialImpact: { expected: number; low: number; high: number };
  /** Practice-retained severity after deductible/limit */
  retainedImpact: { expected: number; low: number; high: number };
  staffModifiers: string[];
  crimeModifiers: string[];
  cascade: { layer: MatrixLayerId; effect: string }[];
  mitigations: MitigationOption[];
  residualIfNothing: string;
  sources: string[];
  assumptions: string[];
  dynamic?: DynamicRiskSlice;
}

export interface KnowledgeRisk {
  knowledgeId: string;
  name: string;
  soleOwner: boolean;
  ownerCount: number;
  owners: Person[];
  riskScore: number;
}
