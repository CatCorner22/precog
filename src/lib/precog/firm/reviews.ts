import type { EntitlementId } from "../sod/conflict-rules";
import { ownersMarked, ownsBusiness } from "../sod/owner-role";
import { personDuties } from "../sod/assignments";
import { BANK_ACTIVITY_DUTIES } from "../sod/derive-staff";
import type { Person } from "../types";
import { formatDayNear, formatMonth, shiftDay, utcDateKey } from "../dates";

export type ReviewItemKey =
  | "bank_statement"
  | "cleared_checks"
  | "payroll_headcount"
  | "new_vendors"
  | "card_statement"
  | "deposits_match"
  | "duplicate_payments";

export type ReviewResult = "done" | "exception" | "skipped";

/**
 * The key of a problem the owner found that none of the month's checks
 * covers, for example a mailed donation check that never reached the bank.
 * It is not a check: it never counts toward a month's checks, stays on the
 * business (never in the monthly review log or the control evidence log),
 * and `isReviewItemKey` refuses it.
 */
export const OTHER_PROBLEM_KEY: OtherProblemKey = "other_problem";

/** The key of another problem; a named type, so an object holding it keeps the literal. */
export type OtherProblemKey = "other_problem";

/** What a saved monthly result is about: one of the checks, or another problem. */
export type ReviewRecordKey = ReviewItemKey | OtherProblemKey;

interface ReviewTask {
  key: ReviewItemKey;
  title: string;
  why: string;
  /** One plain line: what the check covers, and what it does not (`reviewCovers`). */
  covers: string;
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
  key: ReviewRecordKey;
  period: string;
  result: ReviewResult;
  ownerName: string;
  notes: string;
  recordedAt: string;
  /**
   * Another problem's Done only: the `recordedAt` of the problem it
   * resolves, since a month can hold more than one.
   */
  resolves?: string;
}

/**
 * The monthly checks. `checkedDuties` are the duties whose work each check
 * looks at. `since` is the first period a check applies to, so an earlier
 * month keeps the checks it had then. `covers` says in one plain line what
 * the check covers and what it does not; `coversFrom` replaces it from a
 * later month, when a newer check takes over part of what it sent elsewhere.
 */
export const REVIEW_ITEMS: readonly {
  key: ReviewItemKey;
  title: string;
  why: string;
  covers: string;
  coversFrom?: { since: string; covers: string };
  checkedDuties: readonly EntitlementId[];
  since?: string;
}[] = [
  {
    key: "bank_statement",
    title: "Open the bank statement",
    why: "The check works only if someone other than the person who pays the bills sees the real statement, not only the books.",
    covers:
      "The statement the bank sends for each business account. Payroll and suppliers have their own checks.",
    checkedDuties: ["bank_reconcile", ...BANK_ACTIVITY_DUTIES],
  },
  {
    key: "cleared_checks",
    title: "Read the cleared-check images",
    why: "A check coded as supplies can still be payable to a person. The image is the only place that shows.",
    covers:
      "Checks your business wrote that cleared the bank. A check you received, or a bill paid twice, belongs under Another problem.",
    coversFrom: {
      since: "2026-11",
      covers:
        "Checks your business wrote that cleared the bank. A check you received belongs under the deposit check, and a bill paid twice under its own check.",
    },
    checkedDuties: ["sign_checks", "release_payment", "initiate_ach", "prepare_deposit"],
  },
  {
    key: "payroll_headcount",
    title: "Compare the payroll register with who still works here, and with last run's rates",
    why: "A name on the payroll register who no longer works here, or a pay rate that changed since the last run without a reason, is one way money leaves through payroll.",
    covers:
      "The people paid this month and their pay rates. Bills and checks to suppliers are not part of it.",
    checkedDuties: ["approve_payroll", "enter_payroll", "edit_payroll_master"],
  },
  {
    key: "new_vendors",
    title: "Review vendors added or changed",
    why: "A new supplier, or a new bank account on an old one, is how shell-vendor payments start.",
    covers:
      "Suppliers added this month, and any change to a supplier's name, address or bank account. Payments to suppliers are not part of it.",
    checkedDuties: ["create_vendor", "approve_vendor"],
  },
  {
    key: "card_statement",
    title: "Read the company card statement line by line",
    why: "Personal charges and cash advances on a company card are among the commonest schemes in Precog's case library, and once someone codes a charge it reads as supplies.",
    covers: "Each charge on the company card. Checks and bank transfers are not part of it.",
    checkedDuties: ["hold_company_card", "review_card_statement", "approve_expenses"],
    since: "2026-10",
  },
  {
    key: "deposits_match",
    title: "Match each deposit to the takings, donations or payments recorded for that day",
    why: "Cash or a donation that was recorded but never reached the bank, or a cash drawer that came up short, shows only when someone sets each deposit beside what was taken in that day.",
    covers:
      "Money that came in: cash, checks you received, donations and card payments. Money you paid out is not part of it.",
    checkedDuties: ["collect_cash", "post_payments", "prepare_deposit"],
    since: "2026-11",
  },
  {
    key: "duplicate_payments",
    title: "Look for the same invoice paid twice",
    why: "An invoice paid twice, for example once by check and once online, or under a changed invoice number, is an easy way for the second payment to go somewhere else.",
    covers:
      "Bills you paid this month, by check, card or online. Money that came in is not part of it.",
    checkedDuties: [
      "enter_invoices",
      "approve_invoices",
      "release_payment",
      "sign_checks",
      "initiate_ach",
    ],
    since: "2026-11",
  },
];

/** Which record a reviewer relies on, said the same way on the Monthly review and the evidence log. */
export const EVIDENCE_RECORD_NOTE =
  "The control evidence log is the record a reviewer relies on. Process Done marks, Decisions log entries and procedure proofs stay on this business and do not enter it.";

/** What a check covers in `period` (YYYY-MM), and what it does not, in one plain line. */
export function reviewCovers(item: (typeof REVIEW_ITEMS)[number], period: string): string {
  return item.coversFrom && period >= item.coversFrom.since ? item.coversFrom.covers : item.covers;
}

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

/**
 * Most monthly results a business keeps: five checks a month for twenty years,
 * or seven a month (from November 2026) for over fourteen.
 */
export const MAX_REVIEW_RECORDS = 1200;

export function monthKey(day: string): string {
  return day.slice(0, 7);
}

/** The 10th of the following month, the day a monthly close is usually done. */
export function reviewDueOn(period: string): string {
  const [year, month] = period.split("-").map(Number);
  const due = new Date(Date.UTC(year, month, 10));
  return utcDateKey(due);
}

/** The month before `period`, YYYY-MM. */
export function previousPeriod(period: string): string {
  const [year, month] = period.split("-").map(Number);
  return utcDateKey(new Date(Date.UTC(year, month - 2, 1))).slice(0, 7);
}

/** The month after `period`, YYYY-MM. */
function nextPeriod(period: string): string {
  const [year, month] = period.split("-").map(Number);
  return utcDateKey(new Date(Date.UTC(year, month, 1))).slice(0, 7);
}

/**
 * The months an owner can record results for on `today` (YYYY-MM-DD), oldest
 * first: last month as well as this one until last month's due day (the
 * 10th), then this month alone.
 */
export function openPeriods(today: string): string[] {
  const current = monthKey(today);
  const previous = previousPeriod(current);
  return today <= reviewDueOn(previous) ? [previous, current] : [current];
}

/**
 * The month a report prints on `today`: the oldest month still open, so last
 * month until its due day, then this month.
 */
export function reportPeriod(today: string): string {
  return openPeriods(today)[0];
}

/**
 * The months the firm's client table can need for a viewer whose calendar is
 * within a day of `today` (the server's UTC day), oldest first: last month
 * and this month for each of those days.
 */
export function clientTablePeriods(today: string): string[] {
  const last = monthKey(shiftDay(today, 1));
  const out = [previousPeriod(monthKey(shiftDay(today, -1)))];
  while (out[out.length - 1] < last) out.push(nextPeriod(out[out.length - 1]));
  return out;
}

const MONTH_NAME = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" });
const DUE_DAY = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  timeZone: "UTC",
});

function periodStart(period: string): Date {
  const [year, month] = period.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1));
}

/** "September" for "2026-09". */
export function periodMonthName(period: string): string {
  return MONTH_NAME.format(periodStart(period));
}

/** "October 10" for "2026-09": the day the month's checks are due. */
export function reviewDueText(period: string): string {
  return DUE_DAY.format(new Date(`${reviewDueOn(period)}T00:00:00Z`));
}

/** "September 2026 (due October 10)". */
export function periodWithDue(period: string): string {
  return `${formatMonth(period)} (due ${reviewDueText(period)})`;
}

/** One month's monthly checks for one business, each check counted once by its latest result. */
export interface PeriodResults {
  period: string;
  done: number;
  exceptions: number;
  skipped: number;
}

/** Where one month's checks stand on a day. Only Done counts toward completion. */
export interface PeriodStanding extends PeriodResults {
  /** How many checks the month has. */
  total: number;
  /**
   * The month's due day has passed with a check that has no result. A check
   * recorded by then as Exception or Skipped is not overdue, though it is
   * not Done either.
   */
  overdue: boolean;
}

/** The standing of `period` on `today` (YYYY-MM-DD), from the counts the server returned. */
export function periodStanding(
  months: readonly PeriodResults[],
  period: string,
  today: string,
): PeriodStanding {
  const found = months.find((m) => m.period === period);
  const total = reviewItemsFor(period).length;
  const done = Math.min(found?.done ?? 0, total);
  const exceptions = found?.exceptions ?? 0;
  const skipped = found?.skipped ?? 0;
  // Each check counts once, by its latest result, so these are the checks with any result.
  const recorded = Math.min(done + exceptions + skipped, total);
  return {
    period,
    total,
    done,
    exceptions,
    skipped,
    overdue: recorded < total && today > reviewDueOn(period),
  };
}

/**
 * The day of the month from which the month's checks count as open. Before
 * it, the screens and the reminders stay quiet about them: the first days of
 * a month usually close the month before.
 */
export const MONTHLY_REVIEW_GRACE_DAY = 5;

/**
 * Whether the month's own checks count as open on `day` (YYYY-MM-DD): from
 * MONTHLY_REVIEW_GRACE_DAY of the month on.
 */
export function checksCountOn(day: string): boolean {
  return Number(day.slice(8, 10)) >= MONTHLY_REVIEW_GRACE_DAY;
}

/** One open month's checks that wait on the owner. */
export interface OpenMonthChecks {
  period: string;
  /** Checks with no result yet, or Skipped: not done. */
  notDone: number;
  /** Checks whose latest result is Exception: recorded, but not resolved. */
  exceptions: number;
}

/**
 * The open months (`openPeriods`) whose checks count on `day`: last month
 * through its due day, and this month from MONTHLY_REVIEW_GRACE_DAY.
 */
export function countedOpenPeriods(day: string): string[] {
  const current = monthKey(day);
  const counted = checksCountOn(day);
  return openPeriods(day).filter((period) => period !== current || counted);
}

/**
 * The checks that wait on the owner on `day` (YYYY-MM-DD), month by month,
 * oldest first. The months are the ones the owner can record (`openPeriods`):
 * last month through its due day, the 10th, and this month from
 * MONTHLY_REVIEW_GRACE_DAY. Only Done closes a check, as the firm's client
 * table counts it, each check by its latest result: a check with no result,
 * or Skipped, is not done, and one reported as Exception is recorded but not
 * resolved. A month with nothing waiting is left out. Another problem
 * (OTHER_PROBLEM_KEY) is not a check and is not counted here, as the table
 * does not count it; Needs attention lists each open one on its own.
 */
export function openMonthlyChecks(
  day: string,
  reviews: readonly ReviewRecord[],
): OpenMonthChecks[] {
  return countedOpenPeriods(day)
    .map((period) => {
      let notDone = 0;
      let exceptions = 0;
      for (const item of reviewItemsFor(period)) {
        const result = latestReview(reviews, item.key, period)?.result;
        if (result === "exception") exceptions += 1;
        else if (result !== "done") notDone += 1;
      }
      return { period, notDone, exceptions };
    })
    .filter((month) => month.notDone + month.exceptions > 0);
}

/**
 * The monthly checks for `period` (the month of `today` unless given), each with a suggested owner who does not hold the
 * duties it checks. Ownership never turns self-review into independent
 * review. Recorded separate duties rank before provisional title suggestions;
 * an overlapping fallback is explicitly marked. Actual permissions and
 * competence still need verification before relying on the suggested reviewer.
 */
export function monthlyReviewTasks(
  today: string,
  people: readonly Person[],
  roleDuties: Readonly<Record<string, readonly string[]>> = {},
  period: string = monthKey(today),
): ReviewTask[] {
  const dueOn = reviewDueOn(period);
  const team = people.filter((p) => p.active !== false);
  return reviewItemsFor(period).map((item) => {
    const reviewer = reviewerFor(team, item.checkedDuties, roleDuties);
    return {
      key: item.key,
      title: item.title,
      why: item.why,
      covers: reviewCovers(item, period),
      period,
      dueOn,
      suggestedOwner: reviewer.name,
      reviewerHoldsDuty: reviewer.holdsDuty,
      reviewerIndependence: reviewer.independence,
    };
  });
}

/**
 * The stored results, newest first, each checked field by field and within
 * MAX_REVIEW_RECORDS (see `trimReviewRecords`).
 */
export function normalizeReviewRecords(value: unknown): ReviewRecord[] {
  if (!Array.isArray(value)) return [];
  const out: ReviewRecord[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const raw = entry as Record<string, unknown>;
    const other = raw.key === OTHER_PROBLEM_KEY;
    if (!other && !isReviewItemKey(raw.key)) continue;
    if (!isReviewPeriod(raw.period)) continue;
    if (!isReviewResult(raw.result)) continue;
    if (typeof raw.recordedAt !== "string" || !raw.recordedAt) continue;
    const record: ReviewRecord = {
      key: raw.key as ReviewRecordKey,
      period: raw.period,
      result: raw.result as ReviewResult,
      ownerName: typeof raw.ownerName === "string" ? raw.ownerName.trim().slice(0, 80) : "",
      notes: typeof raw.notes === "string" ? raw.notes.trim().slice(0, 500) : "",
      recordedAt: raw.recordedAt.slice(0, 40),
    };
    if (other && raw.result === "done" && typeof raw.resolves === "string" && raw.resolves) {
      record.resolves = raw.resolves.slice(0, 40);
    }
    out.push(record);
  }
  return trimReviewRecords(out).records;
}

/** What trimming took out: in all, and how many of those a later result replaced. */
export interface ReviewTrim {
  removed: number;
  /** Results a later one replaced for the same check and month; the rest came from the oldest months. */
  replaced: number;
}

/**
 * Keeps at most MAX_REVIEW_RECORDS results, newest first. Past the cap it
 * first removes results a later one replaced for the same check and month,
 * oldest first, so every month keeps its latest result; only then does it
 * remove the oldest months. Another problem is never replaced: each one, and
 * each Done that resolves one, is its own. `removed` counts what it took out, and
 * `replaced` how many of those a later result replaced (which can be from a
 * recent month).
 */
export function trimReviewRecords(
  records: readonly ReviewRecord[],
): { records: ReviewRecord[] } & ReviewTrim {
  if (records.length <= MAX_REVIEW_RECORDS) {
    return { records: [...records], removed: 0, replaced: 0 };
  }
  const latest = new Set<string>();
  const superseded: number[] = [];
  records.forEach((record, index) => {
    const slot =
      record.key === OTHER_PROBLEM_KEY
        ? `${record.key}\u0000${record.period}\u0000${record.recordedAt}`
        : `${record.key}\u0000${record.period}`;
    if (latest.has(slot)) superseded.push(index);
    else latest.add(slot);
  });
  const drop = new Set(superseded.slice(-(records.length - MAX_REVIEW_RECORDS)));
  const kept = records.filter((_, index) => !drop.has(index)).slice(0, MAX_REVIEW_RECORDS);
  return { records: kept, removed: records.length - kept.length, replaced: drop.size };
}

/**
 * What the Monthly review says when saving a result removed some past the
 * cap: the results a later one replaced and those from the oldest months,
 * each counted, since a replaced result can be a recent one.
 */
export function reviewTrimNotice({ removed, replaced }: ReviewTrim): string {
  const older = removed - replaced;
  const parts = [
    replaced > 0
      ? `${results(replaced, "earlier result")} that a later one replaced for the same check and month`
      : "",
    older > 0 ? `${results(older, "result")} from the oldest months` : "",
  ].filter(Boolean);
  return `Precog keeps up to ${MAX_REVIEW_RECORDS.toLocaleString("en-US")} monthly results, so it removed ${parts.join(", and ")}.`;
}

/** "1 earlier result", "1,200 earlier results". */
function results(n: number, singular: string): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? singular : `${singular}s`}`;
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

/**
 * Why Precog cannot save a result yet, or null when it can: someone has to be
 * named as the person who did the check, and an Exception needs a note that
 * says what was found.
 */
export function reviewSaveProblem(
  input: Pick<ReviewRecord, "result" | "ownerName" | "notes">,
): string | null {
  if (!input.ownerName.trim()) return "Choose who did this check.";
  if (input.result === "exception" && !input.notes.trim()) return "Say what you found.";
  return null;
}

/**
 * "Saved: Done by Dana on Oct 7 — note": the latest saved result, as the
 * Monthly review shows it under the check. The day carries its year when it
 * is not in the year of `today` (YYYY-MM-DD).
 */
export function savedResultLine(
  record: Pick<ReviewRecord, "result" | "ownerName" | "notes" | "recordedAt">,
  today: string,
): string {
  const owner = record.ownerName.trim();
  const notes = record.notes.trim();
  return `Saved: ${RESULT_LABEL[record.result]}${owner ? ` by ${owner}` : ""} on ${formatDayNear(record.recordedAt, today)}${notes ? ` — ${notes}` : ""}`;
}

/**
 * The note "Mark resolved" saves with its Done: what the person typed, or the
 * Exception's own note when they typed nothing.
 */
export function resolvedNote(typed: string, exceptionNote: string): string {
  const said = typed.trim() || exceptionNote.trim();
  return said ? `Resolved: ${said}` : "Resolved";
}

/** Latest record for one item in one month, if any. */
export function latestReview(
  records: readonly ReviewRecord[],
  key: ReviewItemKey,
  period: string,
): ReviewRecord | undefined {
  return records.find((r) => r.key === key && r.period === period);
}

/** Another problem of one month, and the Done that resolved it, if any. */
export interface OtherProblem {
  problem: ReviewRecord;
  resolved: ReviewRecord | null;
}

/** Another problem's records of `period`, each with what resolved it, oldest first. */
export function otherProblems(records: readonly ReviewRecord[], period: string): OtherProblem[] {
  const mine = records.filter((r) => r.key === OTHER_PROBLEM_KEY && r.period === period);
  return mine
    .filter((r) => r.result === "exception")
    .reverse()
    .map((problem) => ({
      problem,
      resolved: mine.find((r) => r.result === "done" && r.resolves === problem.recordedAt) ?? null,
    }));
}

/**
 * Another problem's key among the month's items, for example
 * "other_problem-20261002150000000", from the day and time it was recorded:
 * the Monthly review's id for it (`checkItemId`) and Needs attention's.
 */
export function otherProblemItemKey(recordedAt: string): string {
  return `${OTHER_PROBLEM_KEY}-${recordedAt.replace(/\D/g, "")}`;
}

/**
 * Why Precog cannot save another problem yet, or null when it can: someone
 * has to be named as the person who found it, and the note says what it is.
 */
export function otherProblemSaveProblem(
  input: Pick<ReviewRecord, "ownerName" | "notes">,
): string | null {
  if (!input.ownerName.trim()) return "Choose who found it.";
  if (!input.notes.trim()) return "Say what the problem is.";
  return null;
}

/**
 * "Another problem: Invoice 88 paid twice — found by Marco on Oct 3", as the
 * Monthly review lists it. The day carries its year outside `today`'s year.
 */
export function otherProblemLine(
  problem: Pick<ReviewRecord, "ownerName" | "notes" | "recordedAt">,
  today: string,
): string {
  const owner = problem.ownerName.trim();
  return `Another problem: ${problem.notes.trim()}${owner ? ` — found by ${owner}` : ""} on ${formatDayNear(problem.recordedAt, today)}`;
}

/**
 * "Another problem: Exception — Marco: Invoice 88 paid twice", as the report
 * prints it (layout 6 on): its latest result, as a check's line reads.
 */
export function otherProblemReportLine({ problem, resolved }: OtherProblem): string {
  return `Another problem: ${reviewResultLine(resolved ?? problem)}`;
}

/**
 * Append a result. The previous result for that item and month stays in the
 * list until the list passes MAX_REVIEW_RECORDS (see `trimReviewRecords`).
 */
export function recordReview(
  records: readonly ReviewRecord[],
  input: Omit<ReviewRecord, "recordedAt"> & { recordedAt?: string },
): ReviewRecord[] {
  return appendReview(records, input).records;
}

/** `recordReview`, with how many older results the cap removed. */
export function appendReview(
  records: readonly ReviewRecord[],
  input: Omit<ReviewRecord, "recordedAt"> & { recordedAt?: string },
): { records: ReviewRecord[] } & ReviewTrim {
  const next: ReviewRecord = {
    key: input.key,
    period: input.period,
    result: input.result,
    ownerName: input.ownerName.trim().slice(0, 80),
    notes: input.notes.trim().slice(0, 500),
    recordedAt: input.recordedAt ?? new Date().toISOString(),
  };
  if (input.resolves) next.resolves = input.resolves;
  return trimReviewRecords([next, ...records]);
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
