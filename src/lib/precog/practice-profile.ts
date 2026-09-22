import type { StaffComposition } from "./types";
import {
  DEFAULT_RISK_VARIABLES,
  VARIABLE_CATALOG,
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

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function boundedNumber(value: unknown, fallback: number, minimum: number, maximum: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : fallback;
}

function normalizeStaff(value: unknown, base: StaffComposition): StaffComposition {
  const input = record(value);
  return {
    teamSize: Math.round(boundedNumber(input.teamSize, base.teamSize, 1, 500)),
    soleOwnerKnowledgeCount: Math.round(
      boundedNumber(input.soleOwnerKnowledgeCount, base.soleOwnerKnowledgeCount, 0, 10_000),
    ),
    avgTenureYears: boundedNumber(input.avgTenureYears, base.avgTenureYears, 0, 100),
    segregationScore: boundedNumber(input.segregationScore, base.segregationScore, 0, 100),
    dualControlPayments:
      typeof input.dualControlPayments === "boolean"
        ? input.dualControlPayments
        : base.dualControlPayments,
    independentBankRec:
      typeof input.independentBankRec === "boolean"
        ? input.independentBankRec
        : base.independentBankRec,
  };
}

function normalizeRiskVariables(value: unknown, base: RiskVariableState): RiskVariableState {
  const input = record(value);
  const normalized = { ...base } as Record<keyof RiskVariableState, number | boolean>;
  for (const definition of VARIABLE_CATALOG) {
    const key = definition.id as keyof RiskVariableState;
    const fallback = base[key];
    const candidate = input[key];
    if (typeof fallback === "boolean") {
      normalized[key] = typeof candidate === "boolean" ? candidate : fallback;
    } else {
      normalized[key] = boundedNumber(
        candidate,
        fallback,
        definition.min ?? 0,
        definition.max ?? 1_000_000_000,
      );
    }
  }
  return normalized as RiskVariableState;
}

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
  const staff = normalizeStaff(parsed.staff, base.staff);
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
    practiceName:
      typeof parsed.practiceName === "string"
        ? parsed.practiceName.trim().slice(0, 80) || base.practiceName
        : base.practiceName,
    staff,
    riskVariables: {
      ...normalizeRiskVariables(parsed.riskVariables, base.riskVariables),
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
