import { daysBetween, isCalendarDate } from "../dates";
import type { BankRow, BooksRow, MoneyImport } from "./import";
import type { Cents } from "./parse";
import { formatCents } from "./parse";

export const LOOKBACK_DAYS = 45;
export const MATCH_DAYS = 3;
export const BANK_DUE_DAYS = 2;
export const DEPOSIT_DUE_DAYS = 5;
export const BACKDATE_DAYS = 7;
export const BANK_WATCH_DAYS = 7;
export const BANK_REVIEW_AFTER_DAYS = 30;
export const DEPOSIT_REVIEW_AFTER_DAYS = 14;
export const BACKDATE_REVIEW_AFTER_DAYS = 30;
export type CheckKey =
  | "unmatched_bank_line"
  | "deposit_not_banked"
  | "duplicate_payment"
  | "backdated_entry"
  | "closed_period_entry"
  | "money_out_without_second"
  | "sole_money_duty_holder"
  | "decision_overdue"
  | "weak_reconciliation";
export interface SkippedCheck {
  check: CheckKey;
  missingColumn: string;
  reason?: string;
  sourceRow?: number;
}
export interface MoneyFinding {
  id: string;
  check: CheckKey;
  level: "info" | "watch" | "review";
  sentence: string;
  amountCents: Cents;
  dates: { effective: string; entry?: string; close?: string };
  sourceRows: { bank: number[]; books: number[] };
}
type Row = BankRow | BooksRow;
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
export const sourceKey = (r: Row) =>
  JSON.stringify([
    r.date,
    r.amountCents,
    r.reference ?? "",
    "type" in r ? [r.type, r.account ?? "", r.entryDate, r.reverses ?? ""] : [],
  ]);
export const sourceOrder = (a: Row, b: Row) =>
  compare(a.date, b.date) ||
  a.amountCents - b.amountCents ||
  compare(sourceKey(a), sourceKey(b)) ||
  a.sourceRow - b.sourceRow;

export function runChecks({
  bank,
  books,
  today,
  closes,
}: {
  bank: MoneyImport<BankRow>;
  books: MoneyImport<BooksRow>;
  today: string;
  closes?: readonly string[];
}): { findings: MoneyFinding[]; skipped: SkippedCheck[] } {
  if (!isCalendarDate(today) || closes?.some((date) => !isCalendarDate(date)))
    throw new Error("Use valid calendar dates for today and closes");
  const findings: MoneyFinding[] = [];
  const skipped: SkippedCheck[] = [];
  const ages = new Map<string, number>();
  const age = (date: string) => {
    if (!ages.has(date)) ages.set(date, daysBetween(date, today)!);
    return ages.get(date)!;
  };
  const recent = (date: string) => age(date) >= 0 && age(date) <= LOOKBACK_DAYS;
  const bankRows = [...bank.rows].filter((r) => age(r.date) >= 0).sort(sourceOrder);
  const bookRows = [...books.rows]
    .filter((r) => age(r.date) >= 0 && age(r.entryDate) >= 0)
    .sort(sourceOrder);
  const identities = new Map<Row, string>();
  for (const rows of [bankRows, bookRows]) {
    const counts = new Map<string, number>();
    for (const row of rows) {
      const source = sourceKey(row);
      const occurrence = (counts.get(source) ?? 0) + 1;
      counts.set(source, occurrence);
      identities.set(row, `${source}:${occurrence}`);
    }
  }
  const add = (
    check: CheckKey,
    row: Row,
    level: MoneyFinding["level"],
    sentence: string,
    related: number[] = [],
    close?: string,
  ) => {
    const isBooks = "type" in row;
    findings.push({
      id: `${check}:${identities.get(row)}`,
      check,
      level,
      sentence,
      amountCents: row.amountCents,
      dates: {
        effective: row.date,
        ...(isBooks ? { entry: row.entryDate } : {}),
        ...(close ? { close } : {}),
      },
      sourceRows: {
        bank: isBooks ? [] : [row.sourceRow],
        books: isBooks ? [...related, row.sourceRow] : [],
      },
    });
  };
  const available = (check: CheckKey, columns: string[]) => {
    const missing = columns.filter((column) =>
      column === "closes" ? closes === undefined : !books.optionalColumns.some((c) => c === column),
    );
    missing.forEach((missingColumn) => skipped.push({ check, missingColumn }));
    return !missing.length;
  };
  const matchedBank = new Set<BankRow>(),
    matchedBooks = new Set<BooksRow>();
  const byAmount = new Map<Cents, Map<number, { rows: BooksRow[]; next: number }>>();
  for (const row of bookRows) {
    const dates = byAmount.get(row.amountCents) ?? new Map();
    const date = age(row.date);
    const queue = dates.get(date) ?? { rows: [], next: 0 };
    queue.rows.push(row);
    dates.set(date, queue);
    byAmount.set(row.amountCents, dates);
  }
  for (let distance = 0; distance <= MATCH_DAYS; distance++) {
    for (const line of bankRows) {
      if (matchedBank.has(line)) continue;
      const dates = byAmount.get(line.amountCents);
      for (const offset of distance === 0 ? [0] : [distance, -distance]) {
        const queue = dates?.get(age(line.date) + offset);
        if (queue && queue.next < queue.rows.length) {
          matchedBank.add(line);
          matchedBooks.add(queue.rows[queue.next++]);
          break;
        }
      }
    }
  }
  for (const line of bankRows) {
    const days = age(line.date);
    if (days >= BANK_DUE_DAYS && !matchedBank.has(line))
      add(
        "unmatched_bank_line",
        line,
        days > BANK_REVIEW_AFTER_DAYS ? "review" : days >= BANK_WATCH_DAYS ? "watch" : "info",
        `A bank line dated ${line.date} for ${formatCents(line.amountCents)} has no matching books entry after ${days} days.`,
      );
  }
  for (const row of bookRows) {
    const days = age(row.date);
    if (
      row.type === "deposit" &&
      recent(row.date) &&
      days >= DEPOSIT_DUE_DAYS &&
      !matchedBooks.has(row)
    )
      add(
        "deposit_not_banked",
        row,
        days > DEPOSIT_REVIEW_AFTER_DAYS ? "review" : "watch",
        `A deposit dated ${row.date} for ${formatCents(row.amountCents)} has no matching bank line after ${days} days.`,
      );
  }
  if (available("duplicate_payment", ["account"])) {
    const reversed = new Set(
      bookRows.filter((r) => r.type === "reversal" && r.reverses).map((r) => r.reverses),
    );
    const groups = new Map<string, BooksRow[]>();
    for (const row of bookRows.filter(
      (r) => r.type === "payment_received" && recent(r.date) && r.account,
    )) {
      const groupKey = JSON.stringify([row.account, row.date, row.amountCents]);
      groups.set(groupKey, [...(groups.get(groupKey) ?? []), row]);
    }
    for (const group of groups.values()) {
      group.sort((a, b) => compare(a.entryDate, b.entryDate) || sourceOrder(a, b));
      if (group.some((r) => r.reference && reversed.has(r.reference))) continue;
      for (const row of group.slice(1))
        add(
          "duplicate_payment",
          row,
          "info",
          `Multiple payments received on ${row.date} for ${formatCents(row.amountCents)} share one account and effective date; this is a later entry.`,
          [group[0].sourceRow],
        );
    }
  }
  if (available("backdated_entry", ["entry_date"])) {
    for (const row of bookRows) {
      const lag = daysBetween(row.date, row.entryDate)!;
      if (
        recent(row.entryDate) &&
        ["adjustment", "write_off", "refund", "reversal"].includes(row.type) &&
        lag > BACKDATE_DAYS
      )
        add(
          "backdated_entry",
          row,
          lag > BACKDATE_REVIEW_AFTER_DAYS ? "review" : "watch",
          `An entry for ${formatCents(row.amountCents)} effective ${row.date} was entered on ${row.entryDate}, ${lag} days later.`,
        );
    }
  }
  if (available("closed_period_entry", ["entry_date", "closes"])) {
    const periods = [...new Set(closes)].filter((c) => c <= today).sort((a, b) => compare(b, a));
    const behind = new Map<string, BooksRow[]>();
    for (const row of bookRows.filter((r) => recent(r.entryDate) && !r.reverses)) {
      const close = periods.find((c) => row.date <= c && row.entryDate > c);
      if (close) behind.set(close, [...(behind.get(close) ?? []), row]);
    }
    for (const [close, rows] of behind)
      for (const row of rows)
        add(
          "closed_period_entry",
          row,
          rows.length > 1 ? "review" : "watch",
          `An entry for ${formatCents(row.amountCents)} effective ${row.date} was entered on ${row.entryDate}, after the period closed through ${close}.`,
          [],
          close,
        );
  }
  findings.sort((a, b) => compare(a.check, b.check) || compare(a.id, b.id));
  return { findings, skipped };
}
