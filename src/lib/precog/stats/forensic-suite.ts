import {
  BENFORD_MIN_SAMPLE,
  BENFORD_SECOND_MIN_SAMPLE,
  type DigitTest,
  benfordFirstDigit,
  benfordSecondDigit,
} from "./benford";
import { utcDateKey } from "../dates";
import { formatPct } from "../../utils";

export interface Transaction {
  id: string;
  /** The spreadsheet row the transaction came from, when it came from a file. */
  row?: number;
  date: string;
  amount: number;
  kind?: "charge" | "payment" | "deposit" | "adjustment" | "refund";
  memo?: string;
  personId?: string;
}

export type Severity = "info" | "watch" | "review";

interface ForensicFinding {
  id: string;
  title: string;
  severity: Severity;
  summary: string;
  detail: string[];
  examples: string[];
}

export interface ForensicReport {
  n: number;
  benfordFirst?: DigitTest;
  benfordSecond?: DigitTest;
  findings: ForensicFinding[];
  disclaimer: string;
}

export const FORENSIC_DISCLAIMER =
  "Educational screening only — not proof of fraud or error. Patterns here are prompts for a conversation about process, never a basis to accuse anyone.";

/**
 * Digit tests apply to amounts that arise from many independent transactions:
 * payments received and deposits made. Charges are set prices from a fee
 * schedule, adjustments and refunds are chosen by a person, and Benford's
 * expectation does not hold for either, so they are excluded. An amount with
 * no kind (pasted by the owner, or a CSV without a kind column) is treated as
 * a money movement, which is what the paste instructions ask for.
 */
const DIGIT_TEST_KINDS = new Set<Transaction["kind"]>(["payment", "deposit", undefined]);
const SET_PRICE_KINDS = new Set<Transaction["kind"]>(["charge"]);

export function runForensicSuite(txns: Transaction[]): ForensicReport {
  const findings: ForensicFinding[] = [];
  const eligible = txns.filter((txn) => DIGIT_TEST_KINDS.has(txn.kind));
  const eligibleAmounts = absoluteAmounts(eligible);

  const first = benfordFirstDigit(eligibleAmounts);
  if (first.n >= BENFORD_MIN_SAMPLE) {
    findings.push(benfordFinding("benford_first", first));
  }
  const second = benfordSecondDigit(eligibleAmounts);
  if (second.n >= BENFORD_SECOND_MIN_SAMPLE) {
    findings.push(benfordFinding("benford_second", second));
  }

  // Fee-schedule prices are round by design, so they are left out here too, and
  // a zero amount is no amount at all.
  const priced = txns.filter((txn) => !SET_PRICE_KINDS.has(txn.kind) && txn.amount !== 0);
  const threshold = priced.every((txn) => Math.abs(txn.amount) < 1000) ? 10 : 100;
  const round = priced.filter((txn) => Math.abs(txn.amount) % threshold === 0);
  const roundShare = priced.length === 0 ? 0 : round.length / priced.length;
  findings.push({
    id: "round_amounts",
    title: "Round-amount concentration",
    severity:
      roundShare > 0.15 && priced.length >= 50 ? "review" : roundShare > 0.1 ? "watch" : "info",
    summary: `${round.length} of ${priced.length} amounts (${formatPct(roundShare, 1)}) are exact multiples of ${threshold}.`,
    detail: [
      "Round values can be useful prompts to review how amounts are entered and approved.",
      "Charges are excluded: fee-schedule prices are round by design. Zero amounts are left out.",
    ],
    examples: round.slice(0, 8).map(describeTransaction),
  });

  // A deposit is the sum of a day's payments, so each kind is compared only
  // with its own kind, and on a log scale because amounts are skewed: a
  // modified z-score over raw amounts flags the ordinary long tail.
  const outliers = magnitudeOutliers(txns);
  findings.push({
    id: "mad_outliers",
    title: "Magnitude outliers",
    severity:
      outliers.length > 0 && outliers.length / Math.max(txns.length, 1) > 0.02
        ? "review"
        : outliers.length > 0
          ? "watch"
          : "info",
    summary: `${outliers.length} amount${outliers.length === 1 ? "" : "s"} exceed the modified-z threshold for their kind.`,
    detail: [
      "The modified z-score uses the median and median absolute deviation, which are less influenced by unusually large values.",
      "Each kind (charges, payments, deposits, adjustments, refunds) is compared only with amounts of the same kind, on a logarithmic scale.",
    ],
    examples: outliers.slice(0, 8).map(describeTransaction),
  });

  // A charge and the payment that settles it share date, amount and person;
  // only entries of the same kind count as a repeat.
  const duplicateGroups = new Map<string, Transaction[]>();
  for (const txn of txns) {
    const key = `${txn.kind ?? ""}|${txn.date}|${txn.amount}|${txn.personId ?? ""}`;
    const group = duplicateGroups.get(key) ?? [];
    group.push(txn);
    duplicateGroups.set(key, group);
  }
  const duplicates = [...duplicateGroups.values()].filter((group) => group.length >= 2);
  const duplicateTransactions = duplicates.reduce((sum, group) => sum + group.length, 0);
  findings.push({
    id: "duplicates",
    title: "Repeated transaction patterns",
    severity:
      duplicateTransactions / Math.max(txns.length, 1) > 0.05
        ? "review"
        : duplicates.length >= 3
          ? "watch"
          : "info",
    summary: `${duplicates.length} repeated group${duplicates.length === 1 ? "" : "s"} covering ${duplicateTransactions} transaction${duplicateTransactions === 1 ? "" : "s"}.`,
    detail: [
      "Repeated amount-and-date combinations can prompt a review of source records and workflow timing.",
      "A charge and the payment that settles it are not a repeat: only entries of the same kind are grouped.",
    ],
    examples: duplicates
      .flatMap((group) => group)
      .slice(0, 8)
      .map(describeTransaction),
  });

  const payments = txns.filter((txn) => txn.kind === "payment");
  const deposits = txns.filter((txn) => txn.kind === "deposit");
  const paymentDates = [...new Set(payments.map((txn) => txn.date))].sort();
  if (paymentDates.length > 0 && deposits.length > 0) {
    const totalPayments = payments.reduce((sum, txn) => sum + txn.amount, 0);
    const gaps = paymentDates.flatMap((date) => {
      const paidThrough = payments
        .filter((txn) => txn.date <= date)
        .reduce((sum, txn) => sum + txn.amount, 0);
      const depositedThrough = deposits
        .filter((txn) => txn.date <= addBusinessDays(date, 2))
        .reduce((sum, txn) => sum + txn.amount, 0);
      const shortfall = paidThrough - depositedThrough;
      return depositedThrough < paidThrough * 0.99 ? [{ date, shortfall }] : [];
    });
    let consecutiveGaps = 0;
    let longestGapRun = 0;
    const gapDates = new Set(gaps.map((gap) => gap.date));
    for (const date of paymentDates) {
      consecutiveGaps = gapDates.has(date) ? consecutiveGaps + 1 : 0;
      longestGapRun = Math.max(longestGapRun, consecutiveGaps);
    }
    const largestShortfall = Math.max(...gaps.map((gap) => gap.shortfall), 0);
    const review = gaps.some((gap) => gap.shortfall > totalPayments * 0.05) || longestGapRun >= 3;
    findings.push({
      id: "deposit_gaps",
      title: "Payment-to-deposit timing",
      severity: review ? "review" : gaps.length > 0 ? "watch" : "info",
      summary:
        gaps.length > 0
          ? `${gaps.length} payment date${gaps.length === 1 ? "" : "s"} where cumulative deposits trail cumulative payments by more than 1% within two business days (largest shortfall ${CENTS.format(largestShortfall)}).`
          : "Deposits keep pace with payments within two business days.",
      detail: ["This cumulative check allows timing lags of a day or two without flagging them."],
      examples: gaps.slice(0, 8).map((gap) => gap.date),
    });
  }

  const adjustments = txns.filter(
    (txn) => (txn.kind === "adjustment" || txn.kind === "refund") && txn.personId,
  );
  if (adjustments.length >= 10) {
    const byPerson = new Map<string, number>();
    for (const txn of adjustments) {
      byPerson.set(txn.personId!, (byPerson.get(txn.personId!) ?? 0) + 1);
    }
    const [personId, count] = [...byPerson.entries()].sort((a, b) => b[1] - a[1])[0];
    const share = count / adjustments.length;
    // In a small office one bookkeeper often posts every adjustment; that is a
    // prompt to have someone else review them, not a pattern among posters.
    const onePoster = byPerson.size === 1;
    findings.push({
      id: "adjustment_concentration",
      title: "Adjustment/refund concentration",
      severity: onePoster ? "watch" : share > 0.8 ? "review" : share > 0.6 ? "watch" : "info",
      summary: onePoster
        ? `One person posts every adjustment and refund (${adjustments.length}); make sure someone else reviews them.`
        : `${formatPct(share, 1)} of adjustments/refunds are associated with one person record.`,
      detail: [
        `The largest share is ${count} of ${adjustments.length} records for ${personId}.`,
        "Concentration can prompt a conversation about training, access, and review coverage.",
      ],
      examples: adjustments
        .filter((txn) => txn.personId === personId)
        .slice(0, 8)
        .map(describeTransaction),
    });
  }

  return {
    n: txns.length,
    benfordFirst: first.n >= BENFORD_MIN_SAMPLE ? first : undefined,
    benfordSecond: second.n >= BENFORD_SECOND_MIN_SAMPLE ? second : undefined,
    findings,
    disclaimer: FORENSIC_DISCLAIMER,
  };
}

function absoluteAmounts(txns: Transaction[]): number[] {
  return txns.map((txn) => Math.abs(txn.amount));
}

function benfordSeverity(test: DigitTest): Severity {
  return test.conformity === "nonconformity"
    ? "review"
    : test.conformity === "marginal"
      ? "watch"
      : "info";
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function dateValue(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function addBusinessDays(date: string, days: number): string {
  const result = dateValue(date);
  let remaining = days;
  while (remaining > 0) {
    result.setUTCDate(result.getUTCDate() + 1);
    const weekday = result.getUTCDay();
    if (weekday !== 0 && weekday !== 6) remaining--;
  }
  return utcDateKey(result);
}

function benfordFinding(id: "benford_first" | "benford_second", test: DigitTest): ForensicFinding {
  const label = id === "benford_first" ? "first-digit" : "second-digit";
  return {
    id,
    title: `Benford ${label} fit`,
    severity: benfordSeverity(test),
    summary: `${test.n} eligible amounts show ${test.conformity} conformity (MAD ${test.mad.toFixed(4)}).`,
    detail: [
      `Chi-square ${test.chiSquare.toFixed(2)} with ${test.df} degrees of freedom (${test.pValueBand}).`,
      "This screen compares the distribution of leading digits with a mathematical reference pattern.",
      "Only payments and deposits are tested. Charges are set prices, and adjustments and refunds are chosen amounts, so the reference pattern does not apply to them.",
    ],
    examples: [],
  };
}

/**
 * Amounts whose modified z-score on log10 of the amount exceeds 3.5 within
 * their own kind, in input order. Zero amounts are left out.
 */
function magnitudeOutliers(txns: Transaction[]): Transaction[] {
  const byKind = new Map<Transaction["kind"], Transaction[]>();
  for (const txn of txns) {
    if (txn.amount === 0) continue;
    byKind.set(txn.kind, [...(byKind.get(txn.kind) ?? []), txn]);
  }
  const flagged = new Set<Transaction>();
  for (const group of byKind.values()) {
    const logs = group.map((txn) => Math.log10(Math.abs(txn.amount)));
    const center = median(logs);
    const mad = median(logs.map((value) => Math.abs(value - center)));
    if (mad === 0) continue;
    group.forEach((txn, index) => {
      if (Math.abs((0.6745 * (logs[index] - center)) / mad) > 3.5) flagged.add(txn);
    });
  }
  return txns.filter((txn) => flagged.has(txn));
}

/** "row 13 · 2025-01-04 · $1,234.56 (payment)": a record the owner can find in their file. */
export function describeTransaction(txn: Transaction): string {
  const where = txn.row === undefined ? "" : `row ${txn.row} · `;
  const kind = txn.kind ? ` (${txn.kind})` : "";
  return `${where}${txn.date} · ${CENTS.format(txn.amount)}${kind}`;
}

const CENTS = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
