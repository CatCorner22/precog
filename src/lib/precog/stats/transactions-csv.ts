import { parseRows, normalizeHeader } from "../import/csv";
import type { Transaction } from "./forensic-suite";
import { isCalendarDate } from "../dates";

const KINDS = new Set(["charge", "payment", "deposit", "adjustment", "refund"]);

/** "$1,200.50" → 1200.5, "(40.00)" → -40; null for an empty or non-numeric cell. */
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

  rows.slice(1).forEach((cells, index) => {
    if (issues.length >= 20) return;
    const row = index + 2;
    const date = (cells[dateColumn] ?? "").trim();
    const amountText = cells[amountColumn] ?? "";
    const amount = parseAmount(amountText);
    const kindValue = columns.has("kind")
      ? (cells[columns.get("kind")!] ?? "").trim().toLowerCase()
      : undefined;
    if (!isCalendarDate(date)) {
      issues.push(`Row ${row}: invalid date`);
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
    transactions.push({
      id: `txn-${row - 1}`,
      date,
      amount,
      ...(kindValue ? { kind: kindValue as Transaction["kind"] } : {}),
      ...(columns.has("memo") ? { memo: (cells[columns.get("memo")!] ?? "").trim() } : {}),
      ...(columns.has("person") ? { personId: (cells[columns.get("person")!] ?? "").trim() } : {}),
    });
  });

  return { transactions, issues };
}
