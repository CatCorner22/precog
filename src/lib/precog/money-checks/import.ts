import {
  normalizeHeader,
  parseRows,
  rowCapMessage,
  sniffDelimiter,
  type ImportIssue,
} from "../import/csv";
import { parseCents, parseMoneyDate, type Cents } from "./parse";

export const MAX_ROWS = 5000;
export const MAX_BYTES = 5_000_000;
const OPTIONAL = [
  "account",
  "reference",
  "entered_by",
  "approved_by",
  "reverses",
  "closed_period",
  "entry_date",
] as const;
type OptionalColumn = (typeof OPTIONAL)[number];
export const BOOKS_TYPES = [
  "payment_received",
  "deposit",
  "payment_out",
  "refund",
  "adjustment",
  "write_off",
  "reversal",
  "payroll",
] as const;
export type BooksType = (typeof BOOKS_TYPES)[number];
export interface BankRow {
  sourceRow: number;
  date: string;
  amountCents: Cents;
  description: string;
  reference?: string;
}
export interface BooksRow
  extends
    Omit<BankRow, "description">,
    Partial<Record<Exclude<OptionalColumn, "entry_date">, string>> {
  entryDate: string;
  type: BooksType;
}
export interface MoneyImport<T> {
  rows: T[];
  issues: ImportIssue[];
  optionalColumns: OptionalColumn[];
}
const ALIASES: Record<string, string[]> = {
  date: ["date", "posted date", "posting date", "transaction date", "effective date"],
  entry_date: ["entry date", "entered date", "entered on"],
  amount: ["amount", "signed amount", "transaction amount"],
  debit: ["debit", "debits", "withdrawal"],
  credit: ["credit", "credits"],
  direction: ["direction", "in out"],
  description: ["description", "memo", "details"],
  type: ["type", "entry type", "transaction type"],
  account: ["account", "customer", "account/customer", "account or customer"],
  reference: ["reference", "ref", "transaction id"],
  entered_by: ["entered by", "created by"],
  approved_by: ["approved by", "approver"],
  reverses: ["reverses", "reverses reference"],
  closed_period: ["closed period"],
};

export const importBankCsv = (text: string): MoneyImport<BankRow> =>
  read(text, false) as MoneyImport<BankRow>;
export const importBooksCsv = (text: string): MoneyImport<BooksRow> =>
  read(text, true) as MoneyImport<BooksRow>;

function read(text: string, books: boolean): MoneyImport<BankRow | BooksRow> {
  const result: MoneyImport<BankRow | BooksRow> = { rows: [], issues: [], optionalColumns: [] };
  const issue = (row: number, message: string) => result.issues.push({ row, message });
  if (new TextEncoder().encode(text).length > MAX_BYTES) {
    issue(0, "File exceeds 5 MB");
    return result;
  }
  if ((text.match(/"/g)?.length ?? 0) % 2) {
    issue(0, "Unclosed quoted CSV cell");
    return result;
  }
  const [header = [], ...data] = parseRows(text, sniffDelimiter(text));
  const columns = new Map<string, number>();
  header.forEach((cell, index) => {
    const normalized = normalizeHeader(cell.replaceAll("_", " "));
    const key = Object.keys(ALIASES).find((key) =>
      ALIASES[key].some((alias) => normalizeHeader(alias) === normalized),
    );
    if (!key) return;
    if (columns.has(key)) issue(0, `Repeated column: ${key}`);
    columns.set(key, index);
  });
  result.optionalColumns = OPTIONAL.filter(
    (key) => columns.has(key) && (books || key !== "entry_date"),
  );
  const required = books ? ["date", "type"] : ["date", "description"];
  for (const key of required) if (!columns.has(key)) issue(0, `Missing column: ${key}`);
  const split = columns.has("debit") && columns.has("credit");
  if (!columns.has("amount") && !split) issue(0, "Provide amount or both debit and credit columns");
  if (columns.has("amount") && (columns.has("debit") || columns.has("credit")))
    issue(0, "Choose amount or debit/credit, not both");
  if (split && columns.has("direction")) issue(0, "Choose direction or debit/credit, not both");
  if (result.issues.length) return result;
  if (data.length > MAX_ROWS) issue(MAX_ROWS + 1, rowCapMessage(MAX_ROWS, data.length - MAX_ROWS));
  data.slice(0, MAX_ROWS).forEach((cells, index) => {
    const row = index + 1;
    if (cells.length !== header.length) {
      issue(row, "Row has a different number of cells than the header");
      return;
    }
    const get = (key: string) => (cells[columns.get(key) ?? -1] ?? "").trim();
    const date = parseMoneyDate(get("date"));
    const entry = books && columns.has("entry_date") ? parseMoneyDate(get("entry_date")) : date;
    const debit = get("debit"),
      credit = get("credit");
    const amount = parseCents(split ? debit || credit : get("amount"));
    const type = get("type")
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
    const direction = get("direction").toLowerCase();
    if ("issue" in date || "issue" in entry || "issue" in amount) {
      issue(
        row,
        [date, entry, amount]
          .filter((part) => "issue" in part)
          .map((part) => ("issue" in part ? part.issue : ""))
          .join("; "),
      );
      return;
    }
    if (
      (split && ((!debit && !credit) || (debit && credit) || (!books && amount.value < 0))) ||
      (columns.has("direction") && !["in", "out", "credit", "debit"].includes(direction)) ||
      (books && !BOOKS_TYPES.includes(type as BooksType))
    ) {
      issue(row, "Invalid amount direction or books type");
      return;
    }
    const sign = split
      ? debit
        ? -1
        : 1
      : columns.has("direction")
        ? ["out", "debit"].includes(direction)
          ? -1
          : 1
        : null;
    if (!books && sign !== null && amount.value < 0 && sign > 0) {
      issue(row, "Signed amount contradicts direction");
      return;
    }
    let amountCents = (sign === null ? amount.value : Math.abs(amount.value) * sign) as Cents;
    if (books) {
      // Books types set cash direction; adjustments/reversals retain the file's direction, with debits negative.
      amountCents = (
        ["payment_received", "deposit"].includes(type)
          ? Math.abs(amount.value)
          : ["payment_out", "refund", "write_off", "payroll"].includes(type)
            ? -Math.abs(amount.value)
            : split
              ? debit
                ? -Math.abs(amount.value)
                : amount.value
              : amountCents
      ) as Cents;
    }
    const optional = Object.fromEntries(
      result.optionalColumns.filter((key) => key !== "entry_date").map((key) => [key, get(key)]),
    );
    const base = { sourceRow: row, date: date.value, amountCents, ...optional };
    result.rows.push(
      books
        ? { ...base, entryDate: entry.value, type: type as BooksType }
        : { ...base, description: get("description") },
    );
  });
  result.rows.sort(
    (a, b) =>
      a.date.localeCompare(b.date) || a.amountCents - b.amountCents || a.sourceRow - b.sourceRow,
  );
  return result;
}
