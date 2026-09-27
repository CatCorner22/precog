import { isCalendarDate } from "../dates";
import type { RiskVariableState } from "./dynamic-variables";

export const POLICY_FIELDS = [
  "basePremiumAnnual",
  "deductible",
  "policyLimit",
  "coinsurancePct",
  "maxDiscountPct",
  "claimsLoadFactor",
  "underwritingLoadAnnual",
  "discountCamerasPct",
  "discountDualControlPct",
  "discountBankRecPct",
  "discountAlarmPct",
  "discountBondedStaffPct",
] as const;
export type PolicyField = (typeof POLICY_FIELDS)[number];
export const CORE_POLICY_FIELDS = [
  "basePremiumAnnual",
  "deductible",
  "policyLimit",
  "coinsurancePct",
] as const;

/** User assertions and modeling assumptions, never a carrier coverage determination. */
export interface InsuranceRecord {
  status: "unknown" | "none" | "reported";
  confirmedFields: PolicyField[];
  /** Only these scenarios may use a conditional recovery estimate. */
  modeledScenarioIds: string[];
  source?: string;
  reviewedOn?: string;
}

export function normalizeInsuranceRecord(value: unknown): InsuranceRecord | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const input = value as Record<string, unknown>;
  const status = input.status === "reported" || input.status === "none" ? input.status : "unknown";
  const fields = Array.isArray(input.confirmedFields) ? input.confirmedFields : [];
  const scenarios = Array.isArray(input.modeledScenarioIds) ? input.modeledScenarioIds : [];
  return {
    status,
    confirmedFields:
      status === "reported" ? POLICY_FIELDS.filter((field) => fields.includes(field)) : [],
    modeledScenarioIds:
      status === "reported"
        ? [
            ...new Set(
              scenarios.filter(
                (id): id is string => typeof id === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(id),
              ),
            ),
          ]
            .slice(0, 500)
            .sort()
        : [],
    ...(typeof input.source === "string" && input.source.trim()
      ? { source: input.source.trim().slice(0, 240) }
      : {}),
    ...(typeof input.reviewedOn === "string" && isCalendarDate(input.reviewedOn)
      ? { reviewedOn: input.reviewedOn }
      : {}),
  };
}

/**
 * The next variable state after an edit, with the insurance record kept true.
 *
 * A policy figure that changed is no longer one the owner confirmed, and any
 * scenario recovery modelled on the old figures is cleared. The record itself
 * (status, source, review date) is carried over from the current state, so
 * replacing every figure, as "Reset figures to app defaults" does, never
 * deletes what the owner entered about their policy. Every writer of policy
 * figures goes through here.
 */
export function withPolicyEdit(
  current: RiskVariableState,
  next: RiskVariableState,
): RiskVariableState {
  const insurance = normalizeInsuranceRecord(current.insurance);
  if (!insurance) return next;
  const changed = POLICY_FIELDS.filter((field) => current[field] !== next[field]);
  if (changed.length === 0) return { ...next, insurance };
  return {
    ...next,
    insurance: {
      ...insurance,
      confirmedFields: insurance.confirmedFields.filter((field) => !changed.includes(field)),
      modeledScenarioIds: [],
    },
  };
}
