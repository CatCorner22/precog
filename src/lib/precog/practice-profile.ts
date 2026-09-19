import type { SavedProcessBlock } from "./builder/process-blocks";
import type { AuditEntry } from "./builder/audit";
import type { ControlTestRecord } from "./builder/test-plan";
import type { RiskAppetite } from "./appetite";
import type { Person, ProcessNode, StaffComposition } from "./types";
import { getIndustryTemplate } from "./templates";
import {
  DEFAULT_RISK_VARIABLES,
  type RiskVariableState,
} from "./scoring/dynamic-variables";
import {
  defaultDualReleasePolicy,
  mergeDualReleasePolicy,
  type DualReleasePolicy,
} from "./controls/dual-release";
import { industryMeta, type IndustryId } from "./industry";

export type DecisionKind = "accept_residual" | "remediate" | "monitor" | "insure";

export interface DecisionEntry {
  id: string;
  createdAt: string;
  subject: string;
  kind: DecisionKind;
  note: string;
  reviewBy?: string;
  residualAtDecision?: number;
  linkedTab?: string;
  linkedId?: string;
}

export interface PracticeProfile {
  practiceName: string;
  industry: IndustryId;
  staff: StaffComposition;
  riskVariables: RiskVariableState;
  dualRelease: DualReleasePolicy;
  decisions: DecisionEntry[];
  /** False on first visit until the user picks an industry template. */
  onboardingComplete?: boolean;
  /** User-built process map. Null/undefined = use the industry template as-is. */
  customProcesses?: ProcessNode[] | null;
  /** The user's real team. Null/undefined = template demo people. */
  customPeople?: Person[] | null;
  /** Pinned canvas positions for process nodes (from drag in build mode). */
  mapLayout?: Record<string, { x: number; y: number }>;
  /** User-saved process blocks for reuse in the map builder. */
  savedProcessBlocks?: SavedProcessBlock[];
  /** Map health score snapshots over time (newest last). */
  mapHealthHistory?: MapHealthPoint[];
  /** Named snapshots of the map for restore/compare (newest first). */
  mapVersions?: MapVersion[];
  /** Stable id of this business within the user's portfolio. */
  businessId?: string;
  /** Derived activity log (newest first). */
  auditLog?: AuditEntry[];
  /** Recorded control test results (newest first). */
  controlTests?: ControlTestRecord[];
  /** How much risk the owner is willing to carry — retunes thresholds app-wide. */
  riskAppetite?: RiskAppetite;
  /** Completed items in the first-30-days plan. */
  planDone?: string[];
  /** When this business was created in Precog (drives the 30-day plan window). */
  createdAt?: string;
  updatedAt: string;
}

export interface BusinessSummary {
  id: string;
  name: string;
  industry: IndustryId;
  updatedAt: string;
  processCount: number;
  healthScore: number | null;
}

const PORTFOLIO_KEY = "precog.portfolio.v1";

export function makeBusinessId(): string {
  return `biz_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function summarizeBusiness(p: PracticeProfile): BusinessSummary {
  const tpl = getIndustryTemplate(p.industry);
  const history = p.mapHealthHistory ?? [];
  return {
    id: p.businessId ?? "biz_default",
    name: p.practiceName,
    industry: p.industry,
    updatedAt: p.updatedAt,
    processCount: (p.customProcesses ?? tpl.processes).length,
    healthScore: history.length ? history[history.length - 1].score : null,
  };
}

/** Local portfolio: every business this device knows about, keyed by id (includes the active one). */
export function loadPortfolio(): Record<string, PracticeProfile> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(PORTFOLIO_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, PracticeProfile>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function savePortfolioEntry(profile: PracticeProfile): void {
  if (typeof window === "undefined") return;
  const id = profile.businessId ?? "biz_default";
  const all = loadPortfolio();
  all[id] = { ...profile, businessId: id };
  try {
    localStorage.setItem(PORTFOLIO_KEY, JSON.stringify(all));
  } catch {
    // quota — portfolio is a convenience cache; active profile is saved separately
  }
}

export function removePortfolioEntry(id: string): void {
  if (typeof window === "undefined") return;
  const all = loadPortfolio();
  delete all[id];
  localStorage.setItem(PORTFOLIO_KEY, JSON.stringify(all));
}

export interface MapVersion {
  id: string;
  name: string;
  createdAt: string;
  healthScore: number;
  processes: ProcessNode[];
  people: Person[];
  layout: Record<string, { x: number; y: number }>;
}

export interface MapHealthPoint {
  at: string;
  score: number;
}

const STORAGE_KEY = "precog.practiceProfile.v2";

export function defaultProfile(industry: IndustryId = "dental"): PracticeProfile {
  const tpl = getIndustryTemplate(industry);
  const staff = { ...tpl.staffComposition };
  const dualRelease = defaultDualReleasePolicy(staff);
  return {
    practiceName: tpl.businessName,
    industry,
    staff,
    riskVariables: {
      ...DEFAULT_RISK_VARIABLES,
      hasDualControl: staff.dualControlPayments,
      hasIndependentBankRec: staff.independentBankRec,
    },
    dualRelease,
    decisions: [],
    onboardingComplete: true,
    customProcesses: null,
    customPeople: null,
    mapLayout: {},
    savedProcessBlocks: [],
    mapHealthHistory: [],
    mapVersions: [],
    businessId: makeBusinessId(),
    auditLog: [],
    controlTests: [],
    riskAppetite: "balanced",
    planDone: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function loadProfile(): PracticeProfile {
  if (typeof window === "undefined") return defaultProfile();
  try {
    // migrate v1
    const raw =
      localStorage.getItem(STORAGE_KEY) ??
      localStorage.getItem("precog.practiceProfile.v1");
    if (!raw) return { ...defaultProfile(), onboardingComplete: false };
    const parsed = JSON.parse(raw) as Partial<PracticeProfile>;
    const industry = (parsed.industry as IndustryId) ?? "dental";
    const base = defaultProfile(industry);
    const staff = { ...base.staff, ...parsed.staff };
    const dualRelease = mergeDualReleasePolicy(
      parsed.dualRelease as DualReleasePolicy | undefined,
      staff,
    );
    // Keep dual release master switch in sync with staff flag if policy missing
    if (!parsed.dualRelease) {
      dualRelease.enabled = staff.dualControlPayments;
    } else {
      staff.dualControlPayments = dualRelease.enabled;
    }
    return {
      ...base,
      ...parsed,
      industry,
      staff,
      riskVariables: {
        ...base.riskVariables,
        ...parsed.riskVariables,
        hasDualControl: dualRelease.enabled,
        hasIndependentBankRec: staff.independentBankRec,
      },
      dualRelease,
      decisions: Array.isArray(parsed.decisions) ? parsed.decisions : [],
      onboardingComplete: parsed.onboardingComplete ?? true,
      customProcesses: Array.isArray(parsed.customProcesses) ? parsed.customProcesses : null,
      customPeople: Array.isArray(parsed.customPeople) ? parsed.customPeople : null,
      mapLayout:
        parsed.mapLayout && typeof parsed.mapLayout === "object" ? parsed.mapLayout : {},
      savedProcessBlocks: Array.isArray(parsed.savedProcessBlocks)
        ? parsed.savedProcessBlocks
        : [],
      mapHealthHistory: Array.isArray(parsed.mapHealthHistory) ? parsed.mapHealthHistory : [],
      mapVersions: Array.isArray(parsed.mapVersions) ? parsed.mapVersions : [],
      businessId: typeof parsed.businessId === "string" ? parsed.businessId : "biz_default",
      auditLog: Array.isArray(parsed.auditLog) ? parsed.auditLog : [],
      controlTests: Array.isArray(parsed.controlTests) ? parsed.controlTests : [],
      riskAppetite: parsed.riskAppetite ?? "balanced",
      planDone: Array.isArray(parsed.planDone) ? parsed.planDone : [],
      createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : parsed.updatedAt ?? new Date().toISOString(),
    };
  } catch {
    return defaultProfile();
  }
}

export function saveProfile(profile: PracticeProfile): void {
  if (typeof window === "undefined") return;
  const next = { ...profile, updatedAt: new Date().toISOString() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function makeDecisionId(): string {
  return `dec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export const DECISION_KIND_LABEL: Record<DecisionKind, string> = {
  accept_residual: "Accept residual",
  remediate: "Remediate",
  monitor: "Monitor",
  insure: "Transfer / insure",
};
