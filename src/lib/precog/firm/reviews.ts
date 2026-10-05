import type { EntitlementId } from "../sod/conflict-rules";
import { ownersMarked, ownsBusiness } from "../sod/owner-role";
import { personDuties } from "../sod/assignments";
import { BANK_ACTIVITY_DUTIES } from "../sod/derive-staff";
import type { Person } from "../types";
import { utcDateKey } from "../dates";

export type ReviewItemKey =
  "bank_statement" | "cleared_checks" | "payroll_headcount" | "new_vendors" | "card_statement";

export type ReviewResult = "done" | "exception" | "skipped";

interface ReviewTask {
  key: ReviewItemKey;
  title: string;
  why: string;
  /** Calendar month the work covers, YYYY-MM. */
  period: string;
  /** Who Precog suggests for the check: someone who does not hold the duties it checks. */
  suggestedOwner: string;
  /**
   * True when everyone on the team holds one of the checked duties, so the
   * suggested owner checks their own work. The screen says so.
   */
  reviewerHoldsDuty: boolean;
  /** A check of recorded responsibilities, not proof of actual access or performance. */
  reviewerIndependence: "separate_duties" | "self_review" | "not_established";
  /** Calendar day the result is due, YYYY-MM-DD. */
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

/**
 * The monthly checks. `checkedDuties` are the duties whose work each check
 * looks at. `since` is the first period a check applies to, so an earlier
 * month keeps the checks it had then.
 */
export const REVIEW_ITEMS: readonly {
  key: ReviewItemKey;
  title: string;
  why: string;
  checkedDuties: readonly EntitlementId[];
  since?: string;
}[] = [
  {
    key: "bank_statement",
    title: "Open the bank statement",
    why: "The check works only if someone other than the person who pays the bills sees the real statement, not only the books.",
    checkedDuties: ["bank_reconcile", ...BANK_ACTIVITY_DUTIES],
  },
  {
    key: "cleared_checks",
    title: "Read the cleared-check images",
    why: "A check coded as supplies can still be payable to a person. The image is the only place that shows.",
    checkedDuties: ["sign_checks", "release_payment", "initiate_ach", "prepare_deposit"],
  },
  {
    key: "payroll_headcount",
    title: "Compare the payroll register with who still works here, and with last run's rates",
    why: "A name on the payroll register who no longer works here, or a pay rate that changed since the last run without a reason, is one way money leaves through payroll.",
    checkedDuties: ["approve_payroll", "enter_payroll", "edit_payroll_master"],
  },
  {
    key: "new_vendors",
    title: "Review vendors added or changed",
    why: "A new supplier, or a new bank account on an old one, is how shell-vendor payments start.",
    checkedDuties: ["create_vendor", "approve_vendor"],
  },
  {
    key: "card_statement",
    title: "Read the company card statement line by line",
    why: "Personal charges and cash advances on a company card are among the commonest schemes in Precog's case library, and once someone codes a charge it reads as supplies.",
    checkedDuties: ["hold_company_card", "review_card_statement", "approve_expenses"],
    since: "2026-10",
  },
];

/** Which record a reviewer relies on, said the same way on the Monthly review and the evidence log. */
export const EVIDENCE_RECORD_NOTE =
  "The control evidence log is the record a reviewer relies on. Process Done marks, Decisions log entries and procedure proofs stay on this business and do not enter it.";

/** The checks that apply to one period, YYYY-MM. */
export function reviewItemsFor(period: string): typeof REVIEW_ITEMS {
  return REVIEW_ITEMS.filter((item) => !item.since || period >= item.since);
}

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
 * The day of the month from which the month's checks count as open. Before
 * it, the screens and the reminders stay quiet about them: the first days of
 * a month usually close the month before.
 */
export const MONTHLY_REVIEW_GRACE_DAY = 5;

/**
 * How many of this month's checks have no result yet, counted from
 * MONTHLY_REVIEW_GRACE_DAY; 0 before it. `day` is YYYY-MM-DD.
 */
export function openMonthlyChecks(
  day: string,
  people: readonly Person[],
  roleDuties: Readonly<Record<string, readonly string[]>>,
  reviews: readonly ReviewRecord[],
): number {
  if (Number(day.slice(8, 10)) < MONTHLY_REVIEW_GRACE_DAY) return 0;
  const period = monthKey(day);
  return monthlyReviewTasks(day, people, roleDuties).filter(
    (task) => !latestReview(reviews, task.key, period),
  ).length;
}

/**
 * The monthly checks for the period, each with a suggested owner who does not hold the
 * duties it checks. Ownership never turns self-review into independent
 * review. Recorded separate duties rank before provisional title suggestions;
 * an overlapping fallback is explicitly marked. Actual permissions and
 * competence still need verification before relying on the suggested reviewer.
 */
export function monthlyReviewTasks(
  today: string,
  people: readonly Person[],
  roleDuties: Readonly<Record<string, readonly string[]>> = {},
): ReviewTask[] {
  const period = monthKey(today);
  const dueOn = reviewDueOn(period);
  const team = people.filter((p) => p.active !== false);
  return reviewItemsFor(period).map((item) => {
    const reviewer = reviewerFor(team, item.checkedDuties, roleDuties);
    return {
      key: item.key,
      title: item.title,
      why: item.why,
      period,
      dueOn,
      suggestedOwner: reviewer.name,
      reviewerHoldsDuty: reviewer.holdsDuty,
      reviewerIndependence: reviewer.independence,
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

/** A result as the screen and the printed report name it. */
export const RESULT_LABEL: Record<ReviewResult, string> = {
  done: "Done",
  exception: "Exception",
  skipped: "Skipped",
};

/** "Exception — Dana: Check 1043 payable to cash": the result, who reported it and their note. */
export function reviewResultLine(record: Pick<ReviewRecord, "result" | "ownerName" | "notes">) {
  const owner = record.ownerName.trim();
  const notes = record.notes.trim();
  return `${RESULT_LABEL[record.result]}${owner ? ` — ${owner}` : ""}${notes ? `: ${notes}` : ""}`;
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
): { name: string; holdsDuty: boolean; independence: ReviewTask["reviewerIndependence"] } {
  const marked = ownersMarked(team);
  const ranked = [
    ...team.filter((p) => ownsBusiness(p, marked)),
    ...team.filter((p) => !ownsBusiness(p, marked)),
  ];
  const candidates = ranked.map((p) => {
    const holdsDuty = personDuties(p, roleDuties).some((d) => checked.includes(d));
    const recorded = Boolean(p.entitlements?.length) && !p.dutiesFromTitle;
    const independence: ReviewTask["reviewerIndependence"] = holdsDuty
      ? "self_review"
      : recorded
        ? "separate_duties"
        : "not_established";
    return { name: p.name, holdsDuty, independence };
  });
  return (
    candidates.find((c) => c.independence === "separate_duties") ??
    candidates.find((c) => !c.holdsDuty) ??
    candidates[0] ?? {
      name: "Reviewer not assigned",
      holdsDuty: false,
      independence: "not_established",
    }
  );
}

export function reviewIndependenceMessage(status: ReviewTask["reviewerIndependence"]): string {
  switch (status) {
    case "self_review":
      return "Self-review risk: this person's duties overlap the work being checked. Arrange a separate reviewer; ownership alone does not make the review independent.";
    case "separate_duties":
      return "No overlap in recorded duties. Confirm actual permissions and ability before relying on this reviewer.";
    case "not_established":
      return "Independent review is not established. Confirm who performs the work and who can check it separately.";
  }
}
