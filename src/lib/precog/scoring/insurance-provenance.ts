/**
 * Which policy figures may count: a demonstration policy on the sample
 * business, only confirmed terms on an owner's own business, and recovery
 * only for scenarios the owner selected.
 */
import { joinWithAnd } from "../text";
import { CORE_POLICY_FIELDS, normalizeInsuranceRecord, type PolicyField } from "./insurance-record";
import type { RiskVariableState } from "./risk-variables";

/** The label demonstration figures carry until explicitly confirmed. */
export const APP_DEFAULT_POLICY = "app default, enter your policy";

export function policyFieldIsDefault(v: RiskVariableState, key: PolicyField): boolean {
  const record = normalizeInsuranceRecord(v.insurance);
  return record?.status !== "reported" || !record.confirmedFields.includes(key);
}

/** Policy presence is an explicit assertion, not a comparison with sample values. */
export function policyEntered(v: RiskVariableState): boolean {
  return normalizeInsuranceRecord(v.insurance)?.status === "reported";
}

export function policyDefaultsInForce(v: RiskVariableState): boolean {
  const record = normalizeInsuranceRecord(v.insurance);
  return (
    record?.status !== "reported" ||
    CORE_POLICY_FIELDS.some((key) => !record.confirmedFields.includes(key))
  );
}

export type InsuranceBasis = "entered" | "incomplete" | "unknown" | "none" | "app_default";

export function insuranceBasis(v: RiskVariableState, ownBusiness: boolean): InsuranceBasis {
  const record = normalizeInsuranceRecord(v.insurance);
  if (!record) return ownBusiness ? "unknown" : "app_default";
  if (record.status === "none") return "none";
  if (record.status === "unknown") return "unknown";
  return policyDefaultsInForce(v) ? "incomplete" : "entered";
}

/** A no-transfer calculation, not proof that the business is uninsured. */
export function withoutPolicy(v: RiskVariableState): RiskVariableState {
  return {
    ...v,
    basePremiumAnnual: 0,
    deductible: 0,
    policyLimit: 0,
    coinsurancePct: 0,
    underwritingLoadAnnual: 0,
    discountCamerasPct: 0,
    discountDualControlPct: 0,
    discountBankRecPct: 0,
    discountAlarmPct: 0,
    discountBondedStaffPct: 0,
  };
}

/** Only confirmed terms and an explicit scenario assumption can transfer a loss. */
export function effectiveRiskVariables(
  v: RiskVariableState,
  ownBusiness: boolean,
  scenarioId?: string,
): RiskVariableState {
  const basis = insuranceBasis(v, ownBusiness);
  if (basis === "app_default") return v;
  const record = normalizeInsuranceRecord(v.insurance);
  const none = withoutPolicy(v);
  if (record?.status !== "reported")
    return {
      ...none,
      insurance: record ?? { status: "unknown", confirmedFields: [], modeledScenarioIds: [] },
    };
  const confirmed = (key: PolicyField) => record.confirmedFields.includes(key);
  const recovery =
    basis === "entered" && Boolean(scenarioId && record.modeledScenarioIds.includes(scenarioId));
  return {
    ...none,
    basePremiumAnnual: confirmed("basePremiumAnnual") ? v.basePremiumAnnual : 0,
    underwritingLoadAnnual: confirmed("underwritingLoadAnnual") ? v.underwritingLoadAnnual : 0,
    claimsLoadFactor: confirmed("claimsLoadFactor") ? v.claimsLoadFactor : 1,
    maxDiscountPct: confirmed("maxDiscountPct") ? v.maxDiscountPct : 0,
    discountCamerasPct: confirmed("discountCamerasPct") ? v.discountCamerasPct : 0,
    discountDualControlPct: confirmed("discountDualControlPct") ? v.discountDualControlPct : 0,
    discountBankRecPct: confirmed("discountBankRecPct") ? v.discountBankRecPct : 0,
    discountAlarmPct: confirmed("discountAlarmPct") ? v.discountAlarmPct : 0,
    discountBondedStaffPct: confirmed("discountBondedStaffPct") ? v.discountBondedStaffPct : 0,
    ...(recovery
      ? { deductible: v.deductible, policyLimit: v.policyLimit, coinsurancePct: v.coinsurancePct }
      : {}),
  };
}

/** How the note names each core policy field the owner has not confirmed. */
const POLICY_FIELD_WORD = {
  basePremiumAnnual: "premium",
  deductible: "deductible",
  policyLimit: "limit",
  coinsurancePct: "unreimbursed share",
};

export function insuranceFigureNote(
  v: RiskVariableState,
  ownBusiness: boolean,
  scenarioId?: string,
): string | null {
  const basis = insuranceBasis(v, ownBusiness);
  if (basis === "unknown")
    return "Insurance not assessed; no recovery modeled. This does not mean you are uninsured.";
  if (basis === "none")
    return "You reported no crime policy; the modeled loss stays with the business.";
  if (basis === "app_default") return APP_DEFAULT_POLICY;
  const record = normalizeInsuranceRecord(v.insurance)!;
  const left = CORE_POLICY_FIELDS.filter((key) => !record.confirmedFields.includes(key)).map(
    (key) => POLICY_FIELD_WORD[key],
  );
  if (left.length)
    return `Policy reported; confirm ${joinWithAnd(left)}. No recovery modeled until terms and this scenario are reviewed.`;
  if (!scenarioId)
    return record.modeledScenarioIds.length
      ? "Policy figures confirmed. Recovery is conditional and modeled only for individually selected scenarios, not established coverage."
      : "Policy figures confirmed; no scenario recovery assumptions selected. No recovery modeled.";
  if (!record.modeledScenarioIds.includes(scenarioId))
    return "Policy figures confirmed; this scenario's coverage is not established. No recovery modeled.";
  return "Conditional recovery using your scenario assumption, not a coverage or claim determination. Check exclusions, sublimits, dates and aggregate limits with your broker.";
}
