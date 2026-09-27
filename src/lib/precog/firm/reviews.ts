import type { EntitlementId } from "../sod/conflict-rules";
import { ownersMarked, ownsBusiness, soleOwnerId } from "../sod/owner-role";
import { ROLE_TEMPLATES } from "../sod/role-templates";
import type { Person } from "../types";
import { utcDateKey } from "../dates";

export type ReviewItemKey =
  "bank_statement" | "cleared_checks" | "payroll_headcount" | "new_vendors";

export type ReviewResult = "done" | "exception" | "skipped";

interface ReviewTask {
  key: ReviewItemKey;
  title: string;
  why: string;
  /** Calendar month the work covers, YYYY-MM. */
  period: string;
  /** Who should do the check: someone who does not hold the duties it checks. */
  suggestedOwner: string;
  /**
   * True when everyone on the team holds one of the checked duties, so the
   * suggested owner checks their own work. The screen should say so.
   */
  reviewerHoldsDuty: boolean;
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

/** The four checks. `checkedDuties` are the duties whose work each check looks at. */
export const REVIEW_ITEMS: readonly {
  key: ReviewItemKey;
  title: string;
  why: string;
  checkedDuties: readonly EntitlementId[];
}[] = [
  {
    key: "bank_statement",
    title: "Open the bank statement",
    why: "Someone other than the person who pays the bills should see the real statement, not only the books.",
    checkedDuties: ["bank_reconcile", "release_payment", "sign_checks"],
  },
  {
    key: "cleared_checks",
    title: "Read the cleared-check images",
    why: "A check coded as supplies can still be payable to a person. The image is the only place that shows.",
    checkedDuties: ["sign_checks", "release_payment", "prepare_deposit"],
  },
  {
    key: "payroll_headcount",
    title: "Compare payroll to who still works here",
    why: "A name on the payroll register who is not on the team is the usual payroll scheme.",
    checkedDuties: ["approve_payroll", "enter_payroll"],
  },
  {
    key: "new_vendors",
    title: "Review vendors added or changed",
    why: "A new supplier, or a new bank account on an old one, is how shell-vendor payments start.",
    checkedDuties: ["create_vendor", "approve_vendor"],
  },
];

const KEYS = new Set<string>(REVIEW_ITEMS.map((item) => item.key));
const RESULTS = new Set<string>(["done", "exception", "skipped"]);
const PERIOD = /^\d{4}-\d{2}$/;

export function isReviewItemKey(value: unknown): value is ReviewItemKey {
  return typeof value === "string" && KEYS.has(value);
}

export function isReviewResult(value: unknown): value is ReviewResult {
  return typeof value === "string" && RESULTS.has(value);
}

/** "YYYY-MM". */
export function isReviewPeriod(value: unknown): value is string {
  return typeof value === "string" && PERIOD.test(value);
}

const MAX_REVIEW_RECORDS = 240;

export function monthKey(day: string): string {
  return day.slice(0, 7);
}

/** The 10th of the following month, the day a monthly close is usually done. */
export function reviewDueOn(period: string): string {
  const [year, month] = period.split("-").map(Number);
  const due = new Date(Date.UTC(year, month, 10));
  return utcDateKey(due);
}

/**
 * The four monthly checks, each with a suggested owner who does not hold the
 * duties it checks. A sole owner is always suggested: they cannot steal from
 * themselves, the same rule the conflict engine applies. Otherwise the first
 * active person free of the checked duties takes it, owners first. A person's
 * duties are their own entitlements, else `roleDuties` for their title (the
 * business's template), else the shared role templates.
 */
export function monthlyReviewTasks(
  today: string,
  people: readonly Person[],
  roleDuties: Readonly<Record<string, readonly string[]>> = {},
): ReviewTask[] {
  const period = monthKey(today);
  const dueOn = reviewDueOn(period);
  const team = people.filter((p) => p.active !== false);
  return REVIEW_ITEMS.map((item) => {
    const reviewer = reviewerFor(team, item.checkedDuties, roleDuties);
    return {
      key: item.key,
      title: item.title,
      why: item.why,
      period,
      dueOn,
      suggestedOwner: reviewer.name,
      reviewerHoldsDuty: reviewer.holdsDuty,
    };
  });
}

export function normalizeReviewRecords(value: unknown): ReviewRecord[] {
  if (!Array.isArray(value)) return [];
  const out: ReviewRecord[] = [];
  for (const entry of value.slice(0, MAX_REVIEW_RECORDS)) {
    if (!entry || typeof entry !== "object") continue;
    const raw = entry as Record<string, unknown>;
    if (!isReviewItemKey(raw.key)) continue;
    if (!isReviewPeriod(raw.period)) continue;
    if (!isReviewResult(raw.result)) continue;
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

function reviewerFor(
  team: readonly Person[],
  checked: readonly EntitlementId[],
  roleDuties: Readonly<Record<string, readonly string[]>>,
): { name: string; holdsDuty: boolean } {
  const soleOwner = soleOwnerId(team);
  const sole = team.find((p) => p.id === soleOwner);
  if (sole) return { name: sole.name, holdsDuty: false };
  const marked = ownersMarked(team);
  const ranked = [
    ...team.filter((p) => ownsBusiness(p, marked)),
    ...team.filter((p) => !ownsBusiness(p, marked)),
  ];
  const holds = (p: Person) => {
    const duties = p.entitlements?.length
      ? p.entitlements
      : (roleDuties[p.role] ?? ROLE_TEMPLATES[p.role] ?? []);
    return checked.some((d) => duties.includes(d));
  };
  const free = ranked.find((p) => !holds(p));
  if (free) return { name: free.name, holdsDuty: false };
  const fallback = ranked[0];
  return fallback ? { name: fallback.name, holdsDuty: true } : { name: "Owner", holdsDuty: false };
}
