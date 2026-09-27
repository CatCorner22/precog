/**
 * The owner's risk variables: insurance terms, control-linked credits and the
 * physical and financial controls in place. The scenario engine, the cascade
 * and the variables panel all read this one shape.
 */
import type { InsuranceRecord } from "./insurance-record";

export interface RiskVariableState {
  /** Explicit policy provenance; absent legacy records are unverified, not uninsured. */
  insurance?: InsuranceRecord;
  /** Annual crime / employee dishonesty premium before discounts */
  basePremiumAnnual: number;
  /** Policy deductible (retained per claim) */
  deductible: number;
  /** Policy limit (max recovery) */
  policyLimit: number;
  /** Unreimbursed percentage above deductible (0–100) — simplified */
  coinsurancePct: number;
  /** Carrier discount % for security cameras (0–100) */
  discountCamerasPct: number;
  /** Carrier discount % for dual control / dual signature (0–100) */
  discountDualControlPct: number;
  /** Carrier discount % for independent bank rec / CPA review (0–100) */
  discountBankRecPct: number;
  /** Carrier discount % for alarm / access control (0–100) */
  discountAlarmPct: number;
  /** Carrier discount % for background checks / bonded staff (0–100) */
  discountBondedStaffPct: number;
  /** Max stackable discount cap (0–100) */
  maxDiscountPct: number;
  /** Whether practice has cameras covering cash/safe */
  hasSecurityCameras: boolean;
  /** Dual control on payments / deposits */
  hasDualControl: boolean;
  /** Independent bank reconciliation */
  hasIndependentBankRec: boolean;
  /** Alarm / access control on office */
  hasAlarmAccess: boolean;
  /** Staff bonded / background checks for cash handlers */
  hasBondedCashHandlers: boolean;
  /** Claims history load factor (1 = clean; >1 worse) */
  claimsLoadFactor: number;
  /** Revenue / cash intensity proxy (scales severity) */
  dailyCashExposure: number;
  /** Optional extra annual premium load from underwriting */
  underwritingLoadAnnual: number;
}

export const DEFAULT_RISK_VARIABLES: RiskVariableState = {
  basePremiumAnnual: 4200,
  deductible: 5000,
  policyLimit: 100000,
  coinsurancePct: 0,
  discountCamerasPct: 0,
  discountDualControlPct: 0,
  discountBankRecPct: 0,
  discountAlarmPct: 0,
  discountBondedStaffPct: 0,
  maxDiscountPct: 25,
  hasSecurityCameras: false,
  hasDualControl: false,
  hasIndependentBankRec: false,
  hasAlarmAccess: false,
  hasBondedCashHandlers: false,
  claimsLoadFactor: 1,
  dailyCashExposure: 3500,
  underwritingLoadAnnual: 0,
};

/** Sync boolean controls from staff composition (scenario runner staff). */
export function mergeStaffIntoVariables(
  v: RiskVariableState,
  staff: { dualControlPayments: boolean; independentBankRec: boolean },
): RiskVariableState {
  return {
    ...v,
    hasDualControl: staff.dualControlPayments,
    hasIndependentBankRec: staff.independentBankRec,
  };
}
