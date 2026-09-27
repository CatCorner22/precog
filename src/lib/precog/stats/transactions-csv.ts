import { parseRows, normalizeHeader } from "../import/csv";
import type { Transaction } from "./forensic-suite";
import { isCalendarDate } from "../dates";

/** The date formats a transactions file may use, as the import help states them. */
const ACCEPTED_DATE_FORMATS = "YYYY-MM-DD, MM/DD/YYYY or M/D/YY";

/** At most this many issue lines are listed; the rest are counted in one line. */
const MAX_LISTED_ISSUES = 20;

/**
 * Transactions from a CSV with date and amount columns and optional kind,
 * memo and person columns. Every row is read: a bad row is skipped and listed,
 * and a bad row never stops the rows after it from loading.
 */
export function parseTransactionsCsv(text: string): {
  transactions: Transaction[];
  issues: string[];
} {
  const rows = parseRows(text);
  const issues: string[] = [];
  const transactions: Transaction[] = [];
  const header = rows[0] ?? [];
  const columns = new Map<string, number>();
  header.forEach((cell, index) => columns.set(normalizeHeader(cell), index));
  const dateColumn = columns.get("date");
  const amountColumn = columns.get("amount");
  if (dateColumn === undefined || amountColumn === undefined) {
    return { transactions: [], issues: ["Missing required date or amount column"] };
  }
  const cell = (cells: string[], name: string) => {
    const index = columns.get(name);
    return index === undefined ? undefined : (cells[index] ?? "").trim();
  };

  rows.slice(1).forEach((cells, index) => {
    const row = index + 2;
    const dateText = (cells[dateColumn] ?? "").trim();
    const date = parseTransactionDate(dateText);
    const amount = parseAmount(cells[amountColumn] ?? "");
    const kindValue = cell(cells, "kind")?.toLowerCase();
    if (!date) {
      issues.push(`Row ${row}: date "${dateText}" not recognized; use ${ACCEPTED_DATE_FORMATS}`);
      return;
    }
    if (amount === null) {
      issues.push(`Row ${row}: invalid amount`);
      return;
    }
    if (kindValue && !KINDS.has(kindValue)) {
      issues.push(`Row ${row}: unknown kind`);
      return;
    }
    const memo = cell(cells, "memo");
    const personId = cell(cells, "person");
    transactions.push({
      id: `txn-${row - 1}`,
      row,
      date,
      amount,
      ...(kindValue ? { kind: kindValue as Transaction["kind"] } : {}),
      ...(memo !== undefined ? { memo } : {}),
      ...(personId !== undefined ? { personId } : {}),
    });
  });

  return { transactions, issues: capIssues(issues) };
}

/** A money amount: "$1,234.56", "-12" or "(12.00)" for a negative; null when unreadable. */
export function parseAmount(value: string): number | null {
  const trimmed = value.trim();
  const negative = trimmed.startsWith("(") && trimmed.endsWith(")");
  const source = (negative ? trimmed.slice(1, -1) : trimmed)
    .replaceAll("$", "")
    .replaceAll(",", "")
    .trim();
  if (!source) return null;
  const amount = Number(source);
  return Number.isFinite(amount) ? (negative ? -Math.abs(amount) : amount) : null;
}

/**
 * A calendar day as YYYY-MM-DD from an ISO day or a US day (MM/DD/YYYY,
 * M/D/YYYY or M/D/YY, as QuickBooks, Excel and US bank exports write it);
 * null when the text is not a real day. A two-digit year is 20YY.
 */
export function parseTransactionDate(value: string): string | null {
  const text = value.trim();
  if (isCalendarDate(text)) return text;
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(text);
  if (!us) return null;
  const [, month, day, year] = us;
  const iso = `${year.length === 2 ? `20${year}` : year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  return isCalendarDate(iso) ? iso : null;
}

function capIssues(issues: string[]): string[] {
  if (issues.length <= MAX_LISTED_ISSUES) return issues;
  const more = issues.length - MAX_LISTED_ISSUES;
  return [
    ...issues.slice(0, MAX_LISTED_ISSUES),
    `and ${more} more row${more === 1 ? "" : "s"} had issues`,
  ];
}

const KINDS = new Set(["charge", "payment", "deposit", "adjustment", "refund"]);
