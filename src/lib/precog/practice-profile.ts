import type { StaffComposition } from "./types";
import {
  DEFAULT_RISK_VARIABLES,
  type RiskVariableState,
} from "./scoring/dynamic-variables";
import {
  defaultDualReleasePolicy,
  mergeDualReleasePolicy,
  type DualReleasePolicy,
} from "./controls/dual-release";
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
  dualRelease: DualReleasePolicy;
  decisions: DecisionEntry[];
  updatedAt: string;
}

const STORAGE_KEY = "precog.practiceProfile.v2";

export function defaultProfile(): PracticeProfile {
  const staff = { ...demoStaff };
  const dualRelease = defaultDualReleasePolicy(staff);
  return {
    practiceName: PRACTICE_NAME,
    staff,
    riskVariables: {
      ...DEFAULT_RISK_VARIABLES,
      hasDualControl: staff.dualControlPayments,
      hasIndependentBankRec: staff.independentBankRec,
    },
    dualRelease,
    decisions: [],
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
    if (!raw) return defaultProfile();
    const parsed = JSON.parse(raw) as Partial<PracticeProfile>;
    const base = defaultProfile();
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
      staff,
      riskVariables: {
        ...base.riskVariables,
        ...parsed.riskVariables,
        hasDualControl: dualRelease.enabled,
        hasIndependentBankRec: staff.independentBankRec,
      },
      dualRelease,
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
