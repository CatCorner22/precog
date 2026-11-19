import { isCalendarDate, shiftDay } from "@/lib/precog/dates";
import {
  runAllChecks,
  RECONCILIATION_MONTHS,
  type AllChecksInput,
} from "@/lib/precog/money-checks/all-checks";
import type { CheckKey, SkippedCheck } from "@/lib/precog/money-checks/detect";
import type { BankRow, BooksRow, MoneyImport } from "@/lib/precog/money-checks/import";

export const CHECK_LABELS: Record<CheckKey, string> = {
  unmatched_bank_line: "Unmatched bank line",
  deposit_not_banked: "Deposit not banked",
  duplicate_payment: "Duplicate payment",
  backdated_entry: "Backdated entry",
  closed_period_entry: "Entry into a closed period",
  money_out_without_second: "Money out without second approval",
  sole_money_duty_holder: "One holder of a critical money duty",
  decision_overdue: "Decision past its review date",
  weak_reconciliation: "Weak reconciliation sign-off",
};
export const noteProblem = (note: string) =>
  note.trim().length < 10 ? "Enter a note of at least 10 characters." : "";
export function closedMonths(today: string): string[] {
  const months: string[] = [];
  let start = `${today.slice(0, 7)}-01`;
  for (let i = 0; i < RECONCILIATION_MONTHS; i++) {
    const month = shiftDay(start, -1).slice(0, 7);
    months.push(month);
    start = `${month}-01`;
  }
  return months;
}
export function addClose(dates: readonly string[], date: string): string[] {
  if (!isCalendarDate(date)) throw new Error("Choose a valid closed-through date.");
  return [...new Set([...dates, date])].sort();
}
export function skippedReason(skip: SkippedCheck): string {
  return `${skip.sourceRow ? `Row ${skip.sourceRow}: ` : ""}${skip.reason || `The ${skip.missingColumn.replaceAll("_", " ")} column is missing.`}`;
}
const empty = <T>(): MoneyImport<T> => ({ rows: [], issues: [], optionalColumns: [] });
export function runScreenChecks(
  input: Omit<AllChecksInput, "bank" | "books"> & {
    bank: MoneyImport<BankRow> | null;
    books: MoneyImport<BooksRow> | null;
  },
) {
  const bank =
    input.bank && !input.bank.rows.length && input.bank.issues.length ? null : input.bank;
  const books =
    input.books && !input.books.rows.length && input.books.issues.length ? null : input.books;
  const result = runAllChecks({
    ...input,
    bank: bank ?? empty(),
    books: books ?? empty(),
  });
  const unavailable = new Map<CheckKey, string>();
  if (!bank || !books) {
    const files = [!bank && "Bank file", !books && "Books file"].filter(Boolean).join(" and ");
    unavailable.set("unmatched_bank_line", files);
    unavailable.set("deposit_not_banked", files);
  }
  if (!books)
    for (const check of [
      "duplicate_payment",
      "backdated_entry",
      "closed_period_entry",
      "money_out_without_second",
    ] as const)
      unavailable.set(check, "Books file");
  return {
    findings: result.findings.filter((f) => !unavailable.has(f.check)),
    skipped: [
      ...result.skipped.filter((s) => !unavailable.has(s.check)),
      ...[...unavailable].map(([check, files]) => ({
        check,
        missingColumn: files,
        reason: `No ${files} loaded. Choose the file to run this check.`,
      })),
    ],
  };
}
