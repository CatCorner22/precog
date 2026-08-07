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
