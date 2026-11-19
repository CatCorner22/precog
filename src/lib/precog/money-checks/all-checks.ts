import { decisionsDue } from "../decisions/follow-through";
import { daysBetween, isCalendarDate, shiftDay } from "../dates";
import type { DecisionEntry } from "../practice-profile";
import { runControlChecks } from "./control-checks";
import { runChecks, type MoneyFinding } from "./detect";
import type { Cents } from "./parse";

export const RECONCILIATION_MONTHS = 3;
export const RECONCILIATION_LATE_DAYS = 30;
export const DECISION_REVIEW_AFTER_DAYS = 30;
export interface ReconciliationSignoff {
  month: string;
  preparedBy: string;
  signedBy: string;
  signedOn: string;
}
export type AllChecksInput = Parameters<typeof runChecks>[0] &
  Omit<Parameters<typeof runControlChecks>[0], "today" | "books"> & {
    decisions: readonly DecisionEntry[];
    signoffs: readonly ReconciliationSignoff[];
  };

export function runAllChecks(input: AllChecksInput): ReturnType<typeof runChecks> {
  const result = runChecks(input);
  const controls = runControlChecks(input);
  result.findings.push(...controls.findings);
  result.skipped.push(...controls.skipped);
  const { today, decisions, signoffs } = input;
  if (decisions.some((d) => d.reviewBy && !isCalendarDate(d.reviewBy)))
    throw new Error("Use valid decision review dates");
  // Decisions have no money tag or category, so all open decisions use the existing due-date filter.
  for (const decision of decisionsDue(decisions, today).overdue) {
    const overdue = daysBetween(decision.reviewBy!, today)!;
    result.findings.push({
      id: `decision_overdue:${decision.id}`,
      check: "decision_overdue",
      level: overdue > DECISION_REVIEW_AFTER_DAYS ? "review" : "watch",
      sentence: `An open control decision was due for review on ${decision.reviewBy} and is ${overdue} days overdue.`,
      amountCents: 0 as Cents,
      dates: { effective: decision.reviewBy! },
      sourceRows: { bank: [], books: [] },
    });
  }
  const byMonth = new Map<string, ReconciliationSignoff>();
  for (const signoff of signoffs) {
    if (
      !isCalendarDate(`${signoff.month}-01`) ||
      (signoff.signedOn && !isCalendarDate(signoff.signedOn))
    )
      throw new Error("Use valid reconciliation months and signing dates");
    if (byMonth.has(signoff.month)) throw new Error("Use one reconciliation sign-off per month");
    byMonth.set(signoff.month, signoff);
  }
  const months: { end: string; signoff?: ReconciliationSignoff; reason?: string }[] = [];
  let cursor = `${today.slice(0, 7)}-01`;
  for (let i = 0; i < RECONCILIATION_MONTHS; i++) {
    const end = shiftDay(cursor, -1);
    const month = end.slice(0, 7);
    const signoff = byMonth.get(month);
    const reason = !signoff
      ? "is missing"
      : !signoff.signedBy.trim() || !signoff.signedOn || signoff.signedOn > today
        ? "has no completed sign-off"
        : signoff.signedBy === signoff.preparedBy
          ? "has a same-hands sign-off"
          : signoff.signedOn < end
            ? "was signed before the month ended"
            : daysBetween(end, signoff.signedOn)! > RECONCILIATION_LATE_DAYS
              ? "was signed more than 30 days after month-end"
              : undefined;
    months.push({ end, signoff, reason });
    cursor = `${month}-01`;
  }
  months.forEach(({ end, signoff, reason }, i) => {
    if (!reason) return;
    const consecutive = Boolean(months[i - 1]?.reason || months[i + 1]?.reason);
    const finding: MoneyFinding = {
      id: `weak_reconciliation:${end.slice(0, 7)}`,
      check: "weak_reconciliation",
      level: consecutive ? "review" : "watch",
      sentence: `The bank reconciliation for ${end.slice(0, 7)} ${reason}.`,
      amountCents: 0 as Cents,
      dates: { effective: end, ...(signoff?.signedOn ? { entry: signoff.signedOn } : {}) },
      sourceRows: { bank: [], books: [] },
    };
    result.findings.push(finding);
  });
  result.findings.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return result;
}
