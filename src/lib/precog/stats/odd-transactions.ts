import { daysBetween, isCalendarDate, shiftDay } from "../dates";
import type { Transaction, ForensicFinding } from "./forensic-suite";

export const SPLIT_WINDOW_DAYS = 7;
export const SPLIT_MIN_PAYMENTS = 2;
export const NUMBER_STEP = 1n;
export const REPEAT_MIN_COUNT = 2;
export const LATE_START = "22:00";
export const EARLY_END = "06:00";
export const IN_OUT_WINDOW_DAYS = 3;
export const SUSPENSE_IDLE_DAYS = 90;
export const VALID_TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export interface OddTransactionOptions {
  today?: string;
  datesKnown?: boolean;
  limits?: Record<string, number>;
  businessHours?: { days: number[]; start: string; end: string };
}
export interface OddTransactionResult {
  findings: ForensicFinding[];
  skipped: { id: string; reason: string }[];
}
const key = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const cents = (amount: number): bigint | null => {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(amount));
  return match
    ? (match[1] ? -1n : 1n) * (BigInt(match[2]) * 100n + BigInt((match[3] ?? "").padEnd(2, "0")))
    : null;
};

export function oddTransactions(
  txns: Transaction[],
  options: OddTransactionOptions,
): OddTransactionResult {
  const findings: ForensicFinding[] = [],
    skipped: OddTransactionResult["skipped"] = [];
  const rows = txns
    .filter((t) => isCalendarDate(t.date) && cents(t.amount) !== null)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const dated = options.datesKnown !== false;
  const emit = (
    id: string,
    title: string,
    summary: string,
    matches: Transaction[],
    review = false,
    detail: string[] = [],
  ) => {
    findings.push({
      id,
      title,
      summary,
      severity: matches.length ? (review ? "review" : "watch") : "info",
      detail,
      examples: [...new Map(matches.map((t) => [t.id, t])).values()]
        .slice(0, 8)
        .map((t) => `${t.date} · record ${t.id}`),
    });
  };
  const skip = (id: string, reason: string) => skipped.push({ id, reason });

  const withLimit = rows.filter(
    (t) =>
      t.payee?.trim() &&
      t.channel?.trim() &&
      (cents(options.limits?.[key(t.channel)] ?? Number.NaN) ?? 0n) > 0n,
  );
  if (!dated || !withLimit.length)
    skip(
      "split_limit",
      "Needs dated negative payments, payee, channel and a positive enabled dual-release limit.",
    );
  else {
    const groups = new Map<string, Transaction[]>();
    for (const t of withLimit) {
      const group = JSON.stringify([key(t.payee!), key(t.channel!)]);
      const limit = cents(options.limits![key(t.channel!)])!;
      if (t.amount >= 0 || -cents(t.amount)! >= limit) continue;
      const entries = groups.get(group) ?? [];
      entries.push(t);
      groups.set(group, entries);
    }
    const matches: Transaction[] = [];
    for (const group of groups.values()) {
      let start = 0,
        total = 0n,
        recorded = 0;
      for (let end = 0; end < group.length; end++) {
        total -= cents(group[end].amount)!;
        while (daysBetween(group[start].date, group[end].date)! > SPLIT_WINDOW_DAYS)
          total += cents(group[start++].amount)!;
        if (
          end - start + 1 >= SPLIT_MIN_PAYMENTS &&
          total > cents(options.limits![key(group[end].channel!)])!
        ) {
          for (let i = Math.max(start, recorded); i <= end; i++) matches.push(group[i]);
          recorded = end + 1;
        }
      }
    }
    emit(
      "split_limit",
      "Payments split below a limit",
      `${new Set(matches.map((t) => t.id)).size} payments form groups exceeding a channel limit within ${SPLIT_WINDOW_DAYS} days.`,
      matches,
      true,
      [
        "Negative amounts are treated as money out. Each payment is below its channel's configured limit; this pattern is not proof of intent.",
      ],
    );
  }

  const numbered = rows.filter((t) => /\d+$/.test(t.number ?? ""));
  if (!numbered.length) skip("number_sequence", "Needs check or invoice numbers ending in digits.");
  else {
    const series = new Map<string, Map<bigint, Transaction[]>>();
    for (const t of numbered) {
      const [, prefix, digits] = /^(.*?)(\d+)$/.exec(t.number!)!;
      const id = JSON.stringify([
        key(prefix),
        key(t.account ?? ""),
        key(t.channel ?? t.kind ?? ""),
      ]);
      const group = series.get(id) ?? new Map<bigint, Transaction[]>();
      const n = BigInt(digits);
      const entries = group.get(n) ?? [];
      entries.push(t);
      group.set(n, entries);
      series.set(id, group);
    }
    let gaps = 0n,
      repeats = 0;
    const matches: Transaction[] = [];
    for (const group of series.values()) {
      const numbers = [...group.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      numbers.forEach((n, i) => {
        const entries = group.get(n)!;
        if (entries.length >= REPEAT_MIN_COUNT) {
          repeats += entries.length - 1;
          matches.push(...entries);
        }
        if (i && n - numbers[i - 1] > NUMBER_STEP) {
          gaps += n - numbers[i - 1] - NUMBER_STEP;
          matches.push(entries[0]);
        }
      });
    }
    emit(
      "number_sequence",
      "Number gaps and repeats",
      `${gaps} missing numbers and ${repeats} repeated numbers within numbered series.`,
      matches,
      false,
      [
        "Series are separated by prefix, account and channel or kind. Missing numbers may be outside the uploaded records.",
      ],
    );
  }

  const hours = options.businessHours;
  const timed = rows.filter((t) => VALID_TIME.test(t.time ?? ""));
  const validHours =
    hours &&
    VALID_TIME.test(hours.start) &&
    VALID_TIME.test(hours.end) &&
    hours.start < hours.end &&
    hours.days.length > 0 &&
    hours.days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  if (!dated || (!timed.length && !validHours))
    skip("outside_hours", "Needs entry times or configured business hours, and real dates.");
  else {
    const matches = rows.filter((t) => {
      const day = new Date(`${t.date}T00:00:00Z`).getUTCDay();
      if (validHours)
        return (
          !hours.days.includes(day) ||
          (VALID_TIME.test(t.time ?? "") && (t.time! < hours.start || t.time! >= hours.end))
        );
      return (
        VALID_TIME.test(t.time ?? "") &&
        (day === 0 || day === 6 || t.time! < EARLY_END || t.time! >= LATE_START)
      );
    });
    emit(
      "outside_hours",
      "Weekend or outside-hours entries",
      `${matches.length} entries fall outside the screened hours.`,
      matches,
      false,
      [
        validHours
          ? "Uses configured working days and opening-inclusive, closing-exclusive hours."
          : `With entry times present, screens weekends and times before ${EARLY_END} or from ${LATE_START}.`,
      ],
    );
  }

  if (!dated || !rows.length)
    skip("money_in_out", "Needs dated, signed amounts readable to whole cents.");
  else {
    const incoming = new Map<bigint, Transaction[]>(),
      matches: Transaction[] = [];
    for (const t of rows.filter((t) => t.amount > 0 && t.kind !== "charge")) {
      const amount = cents(t.amount)!;
      const group = incoming.get(amount) ?? [];
      group.push(t);
      incoming.set(amount, group);
    }
    const next = new Map<bigint, number>();
    for (const out of rows.filter((t) => t.amount < 0 && t.kind !== "charge")) {
      const amount = -cents(out.amount)!;
      const group = incoming.get(amount) ?? [];
      let index = next.get(amount) ?? 0;
      while (index < group.length && daysBetween(group[index].date, out.date)! > IN_OUT_WINDOW_DAYS)
        index++;
      const match = group[index];
      if (match && Math.abs(daysBetween(match.date, out.date)!) <= IN_OUT_WINDOW_DAYS) {
        index++;
        matches.push(match, out);
      }
      next.set(amount, index);
    }
    emit(
      "money_in_out",
      "Same money in and out",
      `${matches.length / 2} equal-amount in/out pairs within ${IN_OUT_WINDOW_DAYS} days.`,
      matches,
      false,
      [
        "Positive amounts are money in and negative amounts money out; charges are excluded. Each record is matched at most once.",
      ],
    );
  }

  if (!dated || !isCalendarDate(options.today ?? "") || !rows.some((t) => t.account?.trim()))
    skip("stale_suspense", "Needs account names and a valid as-of date.");
  else {
    const accounts = new Map<string, Transaction[]>();
    for (const t of rows.filter(
      (t) => t.date <= options.today! && /\b(suspense|clearing)\b/i.test(t.account ?? ""),
    )) {
      const name = key(t.account!);
      const group = accounts.get(name) ?? [];
      group.push(t);
      accounts.set(name, group);
    }
    const matches = [...accounts.values()]
      .filter(
        (group) =>
          group.reduce((sum, t) => sum + cents(t.amount)!, 0n) !== 0n &&
          group.at(-1)!.date < shiftDay(options.today!, -SUSPENSE_IDLE_DAYS),
      )
      .map((group) => group.at(-1)!);
    emit(
      "stale_suspense",
      "Untouched suspense or clearing amounts",
      `${matches.length} suspense or clearing accounts have a nonzero loaded net amount and no activity for more than ${SUSPENSE_IDLE_DAYS} days.`,
      matches,
      false,
      ["Net amounts use only the loaded rows, not a verified opening or current ledger balance."],
    );
  }
  return { findings, skipped };
}
