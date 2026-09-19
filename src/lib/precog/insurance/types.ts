/**
 * Insurance readiness model — the facts an underwriter asks for that the process
 * map can't infer, plus the lines the business carries. Everything here is an
 * educational, indicative model: never a quote, binder, or policy interpretation.
 */

export type InsuranceLine = "crime" | "cyber" | "social_engineering";

export type RevenueBand = "under_500k" | "500k_1m" | "1m_3m" | "3m_10m" | "over_10m";

export const REVENUE_BANDS: { id: RevenueBand; label: string; midpoint: number }[] = [
  { id: "under_500k", label: "Under $500k", midpoint: 300_000 },
  { id: "500k_1m", label: "$500k – $1M", midpoint: 750_000 },
  { id: "1m_3m", label: "$1M – $3M", midpoint: 1_800_000 },
  { id: "3m_10m", label: "$3M – $10M", midpoint: 5_500_000 },
  { id: "over_10m", label: "Over $10M", midpoint: 15_000_000 },
];

/** Things the map cannot see — answered by the owner as attestations. */
export type AttestationId =
  | "wire_callback"
  | "vendor_bank_change_verify"
  | "positive_pay"
  | "mfa_email"
  | "mfa_banking"
  | "offline_backups"
  | "backup_tested"
  | "phishing_training"
  | "endpoint_protection"
  | "patching_30d"
  | "written_procedures"
  | "cpa_review_annual"
  | "card_receipts_reviewed"
  | "vacation_rotation"
  | "incident_response_plan";

export interface LineTerms {
  carry: boolean;
  limit: number;
  deductible: number;
}

export interface InsuranceProfile {
  revenueBand: RevenueBand;
  priorClaims3y: number;
  attestations: Partial<Record<AttestationId, boolean>>;
  /** Crime terms live on riskVariables (deductible / policyLimit / basePremiumAnnual); this is carry + rider flags. */
  crime: { carry: boolean };
  cyber: LineTerms;
  socialEngineering: { carry: boolean; sublimit: number };
  renewalMonth?: number;
  brokerNotes?: string;
}

export function defaultInsuranceProfile(): InsuranceProfile {
  return {
    revenueBand: "1m_3m",
    priorClaims3y: 0,
    attestations: {},
    crime: { carry: true },
    cyber: { carry: false, limit: 500_000, deductible: 5_000 },
    socialEngineering: { carry: false, sublimit: 100_000 },
  };
}

export function mergeInsuranceProfile(raw: Partial<InsuranceProfile> | undefined): InsuranceProfile {
  const d = defaultInsuranceProfile();
  if (!raw) return d;
  return {
    revenueBand: REVENUE_BANDS.some((b) => b.id === raw.revenueBand) ? (raw.revenueBand as RevenueBand) : d.revenueBand,
    priorClaims3y: Number.isFinite(raw.priorClaims3y) ? Math.max(0, Math.min(10, Number(raw.priorClaims3y))) : 0,
    attestations: raw.attestations && typeof raw.attestations === "object" ? raw.attestations : {},
    crime: { carry: raw.crime?.carry ?? true },
    cyber: { ...d.cyber, ...(raw.cyber ?? {}) },
    socialEngineering: { ...d.socialEngineering, ...(raw.socialEngineering ?? {}) },
    renewalMonth: raw.renewalMonth,
    brokerNotes: raw.brokerNotes,
  };
}
