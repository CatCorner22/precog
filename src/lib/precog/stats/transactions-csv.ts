import { parseRows } from "../import/csv";
import type { Transaction } from "./forensic-suite";

const KINDS = new Set(["charge", "payment", "deposit", "adjustment", "refund"]);

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function parseAmount(value: string): number | null {
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

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return date.toISOString().slice(0, 10) === value;
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
  header.forEach((cell, index) => columns.set(normalize(cell), index));
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
    if (!validDate(date)) {
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
