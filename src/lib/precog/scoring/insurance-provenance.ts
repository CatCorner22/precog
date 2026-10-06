/**
 * Which policy figures may count: a demonstration policy on the sample
 * business, only confirmed terms on an owner's own business, and recovery
 * only for scenarios the owner selected.
 */
import { joinWithAnd } from "../text";
import { CORE_POLICY_FIELDS, normalizeInsuranceRecord, type PolicyField } from "./insurance-record";
import { NOT_INSURED_LOSS } from "./insurance-transfer";
import type { RiskVariableState } from "./risk-variables";
import { scenarioFlags } from "./scenario-kind";

/** The label demonstration figures carry until explicitly confirmed. */
export const APP_DEFAULT_POLICY = "Precog default, enter your policy";

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

type InsuranceBasis = "entered" | "incomplete" | "unknown" | "none" | "app_default";

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

/** The note on a scenario that is not theft or fraud, whatever the policy answers. */
export const NOT_INSURED_FIGURE_NOTE = `${NOT_INSURED_LOSS}, so Precog models no recovery.`;

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
  // A crime policy pays only for theft and fraud, so no policy answer moves a
  // scenario that is neither: say so, as the scenario card and the engine do.
  if (scenarioId && !scenarioFlags(scenarioId).fraudRelated) return NOT_INSURED_FIGURE_NOTE;
  const basis = insuranceBasis(v, ownBusiness);
  if (basis === "unknown")
    return "Nobody has assessed insurance, so Precog models no recovery. This does not mean you are uninsured.";
  if (basis === "none")
    return "You reported no crime policy; the modeled loss stays with the business.";
  if (basis === "app_default") return APP_DEFAULT_POLICY;
  const record = normalizeInsuranceRecord(v.insurance)!;
  const left = CORE_POLICY_FIELDS.filter((key) => !record.confirmedFields.includes(key)).map(
    (key) => POLICY_FIELD_WORD[key],
  );
  if (left.length)
    return `You reported a policy; confirm ${joinWithAnd(left)}. Precog models no recovery until someone reviews the terms and this scenario.`;
  if (!scenarioId)
    return record.modeledScenarioIds.length
      ? "You confirmed the policy figures. Precog models a conditional recovery only for the scenarios you selected one by one; that recovery does not establish coverage."
      : "You confirmed the policy figures but selected no scenario recovery assumptions, so Precog models no recovery.";
  if (!record.modeledScenarioIds.includes(scenarioId))
    return "You confirmed the policy figures, but nobody has established coverage for this scenario, so Precog models no recovery.";
  return "Conditional recovery using your scenario assumption, not a coverage or claim determination. Check exclusions, sublimits, dates and aggregate limits with your broker.";
}
