import type { StaffComposition } from "./types";
import {
  DEFAULT_RISK_VARIABLES,
  type RiskVariableState,
} from "./scoring/dynamic-variables";
import { PRACTICE_NAME, staffComposition as demoStaff } from "./demo-data";

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
  staff: StaffComposition;
  riskVariables: RiskVariableState;
  decisions: DecisionEntry[];
  updatedAt: string;
}

const STORAGE_KEY = "precog.practiceProfile.v1";

export function defaultProfile(): PracticeProfile {
  return {
    practiceName: PRACTICE_NAME,
    staff: { ...demoStaff },
    riskVariables: {
      ...DEFAULT_RISK_VARIABLES,
      hasDualControl: demoStaff.dualControlPayments,
      hasIndependentBankRec: demoStaff.independentBankRec,
    },
    decisions: [],
    updatedAt: new Date().toISOString(),
  };
}

export function loadProfile(): PracticeProfile {
  if (typeof window === "undefined") return defaultProfile();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultProfile();
    const parsed = JSON.parse(raw) as PracticeProfile;
    return {
      ...defaultProfile(),
      ...parsed,
      staff: { ...defaultProfile().staff, ...parsed.staff },
      riskVariables: {
        ...defaultProfile().riskVariables,
        ...parsed.riskVariables,
      },
      decisions: Array.isArray(parsed.decisions) ? parsed.decisions : [],
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
