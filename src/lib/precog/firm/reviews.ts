import type { EntitlementId } from "../sod/conflict-rules";
import type { Person } from "../types";

export type ReviewItemKey =
  "bank_statement" | "cleared_checks" | "payroll_headcount" | "new_vendors";

export type ReviewResult = "done" | "exception" | "skipped";

export interface ReviewTask {
  key: ReviewItemKey;
  title: string;
  why: string;
  /** Calendar month the work covers, YYYY-MM. */
  period: string;
  suggestedOwner: string;
  /** Calendar day the result should be recorded by, YYYY-MM-DD. */
  dueOn: string;
}

export interface ReviewRecord {
  key: ReviewItemKey;
  period: string;
  result: ReviewResult;
  ownerName: string;
  notes: string;
  recordedAt: string;
}

export const REVIEW_ITEMS: readonly {
  key: ReviewItemKey;
  title: string;
  why: string;
  duties: readonly EntitlementId[];
}[] = [
  {
    key: "bank_statement",
    title: "Open the bank statement",
    why: "Someone other than the person who pays the bills should see the real statement, not only the books.",
    duties: ["bank_reconcile"],
  },
  {
    key: "cleared_checks",
    title: "Read the cleared-check images",
    why: "A check coded as supplies can still be payable to a person. The image is the only place that shows.",
    duties: ["sign_checks", "release_payment", "prepare_deposit"],
  },
  {
    key: "payroll_headcount",
    title: "Compare payroll to who still works here",
    why: "A name on the payroll register who is not on the team is the usual payroll scheme.",
    duties: ["approve_payroll", "enter_payroll"],
  },
  {
    key: "new_vendors",
    title: "Review vendors added or changed",
    why: "A new supplier, or a new bank account on an old one, is how shell-vendor payments start.",
    duties: ["create_vendor", "approve_vendor"],
  },
];

const KEYS = new Set<string>(REVIEW_ITEMS.map((item) => item.key));
const RESULTS = new Set<string>(["done", "exception", "skipped"]);
const PERIOD = /^\d{4}-\d{2}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const MAX_REVIEW_RECORDS = 240;

export function monthKey(day: string): string {
  return day.slice(0, 7);
}

/** The 10th of the following month, the day a monthly close is usually done. */
export function reviewDueOn(period: string): string {
  const [year, month] = period.split("-").map(Number);
  const due = new Date(Date.UTC(year, month, 10));
  return due.toISOString().slice(0, 10);
}

function holderName(people: readonly Person[], duties: readonly EntitlementId[]): string {
  const match = people.find(
    (p) => p.active !== false && duties.some((d) => p.entitlements?.includes(d)),
  );
  if (match) return match.name;
  const owner = people.find((p) => p.active !== false && p.owner);
  return owner?.name || "Owner";
}

/** The four monthly checks, with an owner taken from whoever holds the related duty. */
export function monthlyReviewTasks(today: string, people: readonly Person[]): ReviewTask[] {
  const period = monthKey(today);
  const dueOn = reviewDueOn(period);
  return REVIEW_ITEMS.map((item) => ({
    key: item.key,
    title: item.title,
    why: item.why,
    period,
    dueOn,
    suggestedOwner: holderName(people, item.duties),
  }));
}

export function normalizeReviewRecords(value: unknown): ReviewRecord[] {
  if (!Array.isArray(value)) return [];
  const out: ReviewRecord[] = [];
  for (const entry of value.slice(0, MAX_REVIEW_RECORDS)) {
    if (!entry || typeof entry !== "object") continue;
    const raw = entry as Record<string, unknown>;
    if (typeof raw.key !== "string" || !KEYS.has(raw.key)) continue;
    if (typeof raw.period !== "string" || !PERIOD.test(raw.period)) continue;
    if (typeof raw.result !== "string" || !RESULTS.has(raw.result)) continue;
    if (typeof raw.recordedAt !== "string" || !raw.recordedAt) continue;
    out.push({
      key: raw.key as ReviewItemKey,
      period: raw.period,
      result: raw.result as ReviewResult,
      ownerName: typeof raw.ownerName === "string" ? raw.ownerName.trim().slice(0, 80) : "",
      notes: typeof raw.notes === "string" ? raw.notes.trim().slice(0, 500) : "",
      recordedAt: raw.recordedAt.slice(0, 40),
    });
  }
  return out;
}

/** Latest record for one item in one month, if any. */
export function latestReview(
  records: readonly ReviewRecord[],
  key: ReviewItemKey,
  period: string,
): ReviewRecord | undefined {
  return records.find((r) => r.key === key && r.period === period);
}

/** Append a result. The previous result for that item and month stays in the list. */
export function recordReview(
  records: readonly ReviewRecord[],
  input: Omit<ReviewRecord, "recordedAt"> & { recordedAt?: string },
): ReviewRecord[] {
  const next: ReviewRecord = {
    key: input.key,
    period: input.period,
    result: input.result,
    ownerName: input.ownerName.trim().slice(0, 80),
    notes: input.notes.trim().slice(0, 500),
    recordedAt: input.recordedAt ?? new Date().toISOString(),
  };
  return [next, ...records].slice(0, MAX_REVIEW_RECORDS);
}

export function isReviewDay(value: string): boolean {
  return DAY.test(value);
}
