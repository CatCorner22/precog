export type MatrixLayerId =
  | "surface"
  | "process"
  | "knowledge"
  | "control"
  | "source"
  | "continuity";

export type Criticality = "critical" | "important" | "nice-to-have";
export type KnowledgeLevel = "expert" | "proficient" | "basic" | "aware";
export type KnowledgeCategory =
  | "process"
  | "system"
  | "clinical"
  | "compliance"
  | "vendor"
  | "tribal";

export type ProcessRiskKind =
  | "control"
  | "fraud"
  | "continuity"
  | "quality"
  | "compliance"
  | "revenue"
  | "safety";

export type LeanWasteKind =
  | "muda_waiting"
  | "muda_rework"
  | "muda_motion"
  | "muda_overprocessing"
  | "mura"
  | "muri";

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
  tenureYears: number;
}

export interface KnowledgeItem {
  id: string;
  name: string;
  criticality: Criticality;
  category: KnowledgeCategory;
  description: string;
  linkedProcessIds: string[];
}

export interface KnowledgeRelation {
  personId: string;
  knowledgeId: string;
  level: KnowledgeLevel;
}

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
}

export interface ControlItem {
  id: string;
  name: string;
  description: string;
  duties: string[];
  segregated: boolean;
  compensatingControls: string[];
  residualRiskAccepted: boolean;
}

export interface StaffComposition {
  teamSize: number;
  soleOwnerKnowledgeCount: number;
  avgTenureYears: number;
  segregationScore: number; // 0-100
  dualControlPayments: boolean;
  independentBankRec: boolean;
}

export interface CrimeFraudStats {
  industryEmbezzlementRate: number; // annual probability base
  typicalLossMid: number;
  typicalLossHigh: number;
  medianDetectionDays: number;
  detectionDaysP95: number;
  source: string;
}

export interface ScenarioTemplate {
  id: string;
  title: string;
  description: string;
  controlId?: string;
  knowledgeId?: string;
  baseTimelineDays: { p50: number; p95Low: number; p95High: number };
  baseFinancialImpact: { expected: number; low: number; high: number };
  statSources: string[];
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
