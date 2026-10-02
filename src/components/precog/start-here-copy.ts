import type { GapBadge } from "@/lib/precog/coach/first-steps";
import type { SchemeKind } from "@/lib/precog/evidence";
import { CRITICALITY_WEIGHT } from "@/lib/precog/continuity/coverage";
import { count, verb } from "@/lib/precog/text";

export const BADGE_VARIANT: Record<GapBadge, "danger" | "warn" | "default" | "primary" | "ok"> = {
  Critical: "danger",
  High: "warn",
  Medium: "default",
  "Related duties": "default",
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
  skimming: "Cash taken before anyone recorded it",
  "cash-larceny": "Cash taken after someone recorded it",
  "financial-statement": "Doctored books and statements",
  corruption: "Kickbacks and conflicts of interest",
  "refund-fraud": "Refunds and voids with no sale behind them",
  "inventory-theft": "Stock, equipment, or supplies taken",
  "data-theft": "Customer and pricing data taken",
  "data-destruction": "Company data deleted or wiped by an insider",
};

/** Detection routes as a clause in a sentence: "it was the owner looking". */
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

/** How the register percentages are weighted, said once wherever one is shown. */
export const WEIGHTED_SHARE_NOTE = `The shares use weights: a critical item counts ${times(CRITICALITY_WEIGHT.critical)} as much as a nice-to-have, an important one ${times(CRITICALITY_WEIGHT.important)}. Must-do work means the critical and important items.`;

/**
 * The line under someone out today when nothing on the register stops, or
 * null when something does. While nobody is marked on the register the app
 * cannot tell, so it says so instead of reassuring.
 */
export function outStopsNote(stops: number, waiting: number, assessed: boolean): string | null {
  if (stops > 0) return null;
  if (!assessed) return "Not assessed yet: mark who can do each item on Who knows what.";
  if (waiting > 0) {
    return `Nothing more stops, but ${count(waiting, "entry", "entries")} nobody can run alone already ${verb(waiting, "waits", "wait")}.`;
  }
  return "Everything they run, someone else can run alone.";
}

/** Whether the case median sits above or below the study's median; null when either is missing or they are equal. */
export function caseMedianComparison(
  caseMedian: number | undefined,
  studyMedian: number | undefined,
): "higher" | "lower" | null {
  if (caseMedian === undefined || studyMedian === undefined || caseMedian === studyMedian) {
    return null;
  }
  return caseMedian > studyMedian ? "higher" : "lower";
}

function times(n: number): string {
  return n === 1 ? "the same" : n === 2 ? "twice" : `${n} times`;
}
