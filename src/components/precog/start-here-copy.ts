import type { GapBadge } from "@/lib/precog/coach/first-steps";
import type { SchemeKind } from "@/lib/precog/evidence";

export const BADGE_VARIANT: Record<GapBadge, "danger" | "warn" | "default" | "primary" | "ok"> = {
  "Fix first": "danger",
  "Fix soon": "warn",
  "Worth doing": "default",
  "Reduced, not closed": "primary",
  "Covered by dual release": "ok",
};

/** Plain wording for each scheme shape, in the order the chips appear. */
export const SCHEME_ORDER: SchemeKind[] = [
  "check-tampering",
  "billing-shell-vendor",
  "expense-reimbursement",
  "payroll",
  "receivables-diversion",
  "skimming",
  "cash-larceny",
  "refund-fraud",
  "inventory-theft",
  "data-theft",
  "data-destruction",
  "financial-statement",
  "corruption",
];

export const SCHEME_PHRASE: Record<SchemeKind, string> = {
  "check-tampering": "Forged, altered, or self-written payments",
  "billing-shell-vendor": "Fake suppliers and invoices",
  "expense-reimbursement": "Company card and expenses",
  payroll: "Payroll",
  "receivables-diversion": "Customer payments diverted",
  skimming: "Cash taken before it was recorded",
  "cash-larceny": "Cash taken after it was recorded",
  "financial-statement": "Doctored books and statements",
  corruption: "Kickbacks and conflicts of interest",
  "refund-fraud": "Refunds and voids with no sale behind them",
  "inventory-theft": "Stock, equipment, and drugs taken",
  "data-theft": "Customer and pricing data taken",
  "data-destruction": "Company data deleted or wiped by an insider",
};

/** Plain wording for each detection route, matching the case card. */
/** Years of service at which the departure model calls a person long-serving. */
export const LONG_SERVICE_YEARS = 5;

export const DETECTION_PHRASE: Record<string, string> = {
  tip: "Someone spoke up",
  "owner-review": "The owner looked",
  "external-audit": "An outside audit",
  "bank-or-insurer": "A bank or insurer flagged it",
  "law-enforcement": "Law enforcement",
  "by-accident": "By accident, when the money ran out",
  cover: "Someone else covered the desk and saw the records",
  reconciliation: "A reconciliation caught it",
};

/** The same routes as a clause in a sentence: "it was the owner looking". */
export const ROUTE_CLAUSE: Record<string, string> = {
  "owner-review": "the owner looking",
  "bank-or-insurer": "a bank or insurer noticing",
  "by-accident": "the money running out",
  cover: "someone else covering the desk",
  "law-enforcement": "law enforcement arriving",
};

export function joinClauses(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")}, or ${parts[parts.length - 1]}`;
}

export function effortPhrase(effort: string): string {
  return effort === "ongoing" ? "Ongoing" : `Takes ${effort}`;
}

/** Lower-cases an entitlement label for mid-sentence use, keeping acronyms. */
export function lower(label: string): string {
  return label.replace(/^([A-Z])(?=[a-z])/, (m) => m.toLowerCase());
}
