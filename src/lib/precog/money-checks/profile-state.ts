import type { ReleaseChannel } from "../controls/dual-release-policy";
import { isCalendarDate } from "../dates";
import { isRecord } from "../profile-entries";
import type { PracticeProfile } from "../practice-profile";
import type { ReconciliationSignoff } from "./all-checks";
import type { CheckKey, runChecks } from "./detect";
import { applyRun, CLOSED_REASON, explainFinding, trimLedger, type LedgerRow } from "./ledger";

export interface ChannelSignoff {
  month: string;
  channel: ReleaseChannel;
  note: string;
  by: string;
  on: string;
}
export interface MoneyChecksState {
  lastRun?: string;
  ledger: LedgerRow[];
  reconciliationSignoffs: ReconciliationSignoff[];
  channelSignoffs: ChannelSignoff[];
}
const CHECKS: CheckKey[] = [
  "unmatched_bank_line",
  "deposit_not_banked",
  "duplicate_payment",
  "backdated_entry",
  "closed_period_entry",
  "money_out_without_second",
  "sole_money_duty_holder",
  "decision_overdue",
  "weak_reconciliation",
];
const CHANNELS: ReleaseChannel[] = ["ach", "check", "writeoff", "vendor_new", "deposit", "payroll"];
const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const day = (v: unknown): v is string => typeof v === "string" && isCalendarDate(v);
const month = (v: unknown): v is string => typeof v === "string" && isCalendarDate(`${v}-01`);
function entries<T>(value: unknown, parse: (v: Record<string, unknown>) => T | undefined): T[] {
  return Array.isArray(value) ? value.flatMap((v) => (isRecord(v) ? (parse(v) ?? []) : [])) : [];
}
function unique<T>(rows: T[], key: (r: T) => string): T[] {
  const seen = new Map<string, T>();
  for (const row of rows) if (!seen.has(key(row))) seen.set(key(row), row);
  return [...seen].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, row]) => row);
}
export function normalizeMoneyChecks(value: unknown): MoneyChecksState | undefined {
  if (!isRecord(value)) return undefined;
  const ledger = entries<LedgerRow>(value.ledger, (v) => {
    const check = CHECKS.find((c) => c === v.check);
    const level = (["info", "watch", "review"] as const).find((l) => l === v.level);
    const reopenCount = v.reopenCount ?? 0;
    if (
      !text(v.id) ||
      !check ||
      !level ||
      !text(v.sentence) ||
      !day(v.firstSeen) ||
      !day(v.lastSeen) ||
      v.firstSeen > v.lastSeen ||
      (v.status !== "open" && v.status !== "closed") ||
      typeof reopenCount !== "number" ||
      !Number.isSafeInteger(reopenCount) ||
      reopenCount < 0 ||
      (v.status === "closed" && (!day(v.closedOn) || v.closedOn < v.lastSeen))
    )
      return undefined;
    const explained =
      isRecord(v.explained) && text(v.explained.note).length >= 10 && day(v.explained.on)
        ? { note: text(v.explained.note), on: v.explained.on }
        : undefined;
    return {
      id: text(v.id),
      check,
      level,
      sentence: text(v.sentence),
      firstSeen: v.firstSeen,
      lastSeen: v.lastSeen,
      status: v.status,
      reopenCount,
      ...(v.status === "closed"
        ? { closedOn: v.closedOn as string, closeReason: text(v.closeReason) || CLOSED_REASON }
        : {}),
      ...(explained ? { explained } : {}),
    };
  });
  const reconciliationSignoffs = entries<ReconciliationSignoff>(
    value.reconciliationSignoffs,
    (v) =>
      month(v.month) &&
      text(v.preparedBy) &&
      typeof v.signedBy === "string" &&
      (v.signedOn === "" || day(v.signedOn))
        ? {
            month: v.month,
            preparedBy: text(v.preparedBy),
            signedBy: text(v.signedBy),
            signedOn: v.signedOn,
          }
        : undefined,
  );
  const channelSignoffs = entries<ChannelSignoff>(value.channelSignoffs, (v) => {
    const channel = CHANNELS.find((c) => c === v.channel);
    return month(v.month) && channel && text(v.note).length >= 10 && text(v.by) && day(v.on)
      ? { month: v.month, channel, note: text(v.note), by: text(v.by), on: v.on }
      : undefined;
  });
  return {
    ...(day(value.lastRun) ? { lastRun: value.lastRun } : {}),
    ledger: trimLedger(unique(ledger, (r) => r.id)),
    reconciliationSignoffs: unique(reconciliationSignoffs, (r) => r.month),
    channelSignoffs: unique(channelSignoffs, (r) => `${r.month}:${r.channel}`),
  };
}
const stateFor = (p: PracticeProfile): MoneyChecksState =>
  normalizeMoneyChecks(p.moneyChecks) ?? {
    ledger: [],
    reconciliationSignoffs: [],
    channelSignoffs: [],
  };
export function withMoneyRun(
  p: PracticeProfile,
  result: ReturnType<typeof runChecks>,
  today: string,
): PracticeProfile {
  const state = stateFor(p);
  return {
    ...p,
    moneyChecks: { ...state, lastRun: today, ledger: applyRun(state.ledger, result, today) },
  };
}
export function withFindingExplanation(
  p: PracticeProfile,
  id: string,
  note: string,
  today: string,
): PracticeProfile {
  const state = stateFor(p);
  return { ...p, moneyChecks: { ...state, ledger: explainFinding(state.ledger, id, note, today) } };
}
export function withReconciliationSignoff(
  p: PracticeProfile,
  signoff: ReconciliationSignoff,
): PracticeProfile {
  const checked = normalizeMoneyChecks({ reconciliationSignoffs: [signoff] })!
    .reconciliationSignoffs[0];
  if (!checked) throw new Error("Use a valid reconciliation sign-off");
  const state = stateFor(p);
  return {
    ...p,
    moneyChecks: {
      ...state,
      reconciliationSignoffs: unique([checked, ...state.reconciliationSignoffs], (r) => r.month),
    },
  };
}
export function withChannelSignoff(p: PracticeProfile, signoff: ChannelSignoff): PracticeProfile {
  const checked = normalizeMoneyChecks({ channelSignoffs: [signoff] })!.channelSignoffs[0];
  if (!checked)
    throw new Error(
      "A channel sign-off needs a valid month, date, author and note of at least 10 characters",
    );
  const state = stateFor(p);
  return {
    ...p,
    moneyChecks: {
      ...state,
      channelSignoffs: unique(
        [checked, ...state.channelSignoffs],
        (r) => `${r.month}:${r.channel}`,
      ),
    },
  };
}
