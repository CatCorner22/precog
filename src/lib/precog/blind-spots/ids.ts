/**
 * The blind-spot ids on their own, so the profile normalizer can check an
 * answer's id without loading the library text. `library.ts` types each
 * entry's id against this list.
 */
export const BLIND_SPOT_IDS = [
  "payroll-trust-fund",
  "retirement-deposits",
  "personal-guarantees",
  "cash-reporting",
  "sales-tax-responsible-person",
  "bank-statement-window",
  "instant-payments-final",
  "deposit-insurance",
  "mailed-checks",
  "insurance-fine-print",
  "auto-renew-contracts",
  "subcontractor-certificates",
  "digital-keys",
  "owner-incapacity",
  "annual-report",
  "dea-renewal",
  "nonprofit-filings",
  "headcount-thresholds",
  "tipped-reporting",
  "worker-classification",
  "i9-retention",
  "final-pay",
  "breach-notice",
  "unclaimed-property",
  "property-schedule",
] as const;

export type BlindSpotId = (typeof BLIND_SPOT_IDS)[number];

export function isBlindSpotId(value: unknown): value is BlindSpotId {
  return typeof value === "string" && (BLIND_SPOT_IDS as readonly string[]).includes(value);
}
