import { isCalendarDate } from "../dates";
import type { CheckKey, MoneyFinding, runChecks } from "./detect";

export const LEDGER_LIMIT = 500;
export const CLOSED_REASON = "no longer found in the latest run";
export interface LedgerRow {
  id: string;
  check: CheckKey;
  level: MoneyFinding["level"];
  sentence: string;
  firstSeen: string;
  lastSeen: string;
  status: "open" | "closed";
  closedOn?: string;
  closeReason?: string;
  reopenCount: number;
  explained?: { note: string; on: string };
}
const order = (a: LedgerRow, b: LedgerRow) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
export function trimLedger(ledger: readonly LedgerRow[]): LedgerRow[] {
  // Oldest closed first also prioritizes every row older than 13 months.
  const closed = ledger
    .filter((r) => r.status === "closed")
    .sort((a, b) => (a.closedOn! < b.closedOn! ? -1 : a.closedOn! > b.closedOn! ? 1 : order(a, b)));
  const drop = new Set(closed.slice(0, Math.max(0, ledger.length - LEDGER_LIMIT)).map((r) => r.id));
  return ledger.filter((r) => !drop.has(r.id)).sort(order);
}
function validDay(today: string) {
  if (!isCalendarDate(today)) throw new Error("Use a valid calendar date");
}
export function applyRun(
  ledger: readonly LedgerRow[],
  runResult: ReturnType<typeof runChecks>,
  today: string,
): LedgerRow[] {
  validDay(today);
  const next = new Map(ledger.map((row) => [row.id, row]));
  const present = new Set(runResult.findings.map((f) => f.id));
  const skipped = new Set(runResult.skipped.map((s) => s.check));
  for (const row of ledger) {
    if (row.status === "open" && !present.has(row.id) && !skipped.has(row.check))
      next.set(row.id, { ...row, status: "closed", closedOn: today, closeReason: CLOSED_REASON });
  }
  for (const finding of runResult.findings) {
    const previous = next.get(finding.id);
    next.set(finding.id, {
      id: finding.id,
      check: finding.check,
      level: finding.level,
      sentence: finding.sentence,
      firstSeen: previous?.firstSeen ?? today,
      lastSeen: today,
      status: "open",
      reopenCount: (previous?.reopenCount ?? 0) + (previous?.status === "closed" ? 1 : 0),
      ...(previous?.explained ? { explained: previous.explained } : {}),
    });
  }
  return trimLedger([...next.values()]);
}
export function explainFinding(
  ledger: readonly LedgerRow[],
  id: string,
  note: string,
  today: string,
): LedgerRow[] {
  validDay(today);
  const trimmed = note.trim();
  if (trimmed.length < 10) throw new Error("An explanation needs at least 10 characters");
  if (!ledger.some((row) => row.id === id)) throw new Error("Finding not found");
  return ledger
    .map((row) => (row.id === id ? { ...row, explained: { note: trimmed, on: today } } : row))
    .sort(order);
}
