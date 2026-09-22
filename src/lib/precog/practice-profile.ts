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
    return normalizeProfile(JSON.parse(raw) as Partial<PracticeProfile>);
  } catch {
    return defaultProfile();
  }
}

/** Merge stored/imported profiles with current defaults as the model evolves. */
export function normalizeProfile(parsed: Partial<PracticeProfile>): PracticeProfile {
  const base = defaultProfile();
  const staff = { ...base.staff, ...parsed.staff };
  const dualRelease = mergeDualReleasePolicy(
    parsed.dualRelease as DualReleasePolicy | undefined,
    staff,
  );
  if (!parsed.dualRelease) dualRelease.enabled = staff.dualControlPayments;
  else staff.dualControlPayments = dualRelease.enabled;
  const validKinds = new Set<DecisionKind>(["accept_residual", "remediate", "monitor", "insure"]);
  const decisions = Array.isArray(parsed.decisions)
    ? parsed.decisions.slice(0, 100).flatMap((entry) => {
        if (!entry || typeof entry !== "object" || !validKinds.has(entry.kind)) return [];
        return [{
          id: String(entry.id ?? "").slice(0, 80),
          createdAt: String(entry.createdAt ?? "").slice(0, 40),
          subject: String(entry.subject ?? "").slice(0, 200),
          kind: entry.kind,
          note: String(entry.note ?? "").slice(0, 2_000),
          reviewBy: entry.reviewBy ? String(entry.reviewBy).slice(0, 40) : undefined,
          residualAtDecision: Number.isFinite(entry.residualAtDecision) ? entry.residualAtDecision : undefined,
          linkedTab: entry.linkedTab ? String(entry.linkedTab).slice(0, 80) : undefined,
          linkedId: entry.linkedId ? String(entry.linkedId).slice(0, 80) : undefined,
        }];
      })
    : [];
  return {
    practiceName: String(parsed.practiceName ?? base.practiceName).slice(0, 80),
    staff,
    riskVariables: {
      ...base.riskVariables,
      ...parsed.riskVariables,
      hasDualControl: dualRelease.enabled,
      hasIndependentBankRec: staff.independentBankRec,
    },
    dualRelease,
    decisions,
    updatedAt: new Date().toISOString(),
  };
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
