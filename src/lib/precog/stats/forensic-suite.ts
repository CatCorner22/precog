import {
  BENFORD_MIN_SAMPLE,
  BENFORD_SECOND_MIN_SAMPLE,
  type DigitTest,
  benfordFirstDigit,
  benfordSecondDigit,
} from "./benford";

export interface Transaction {
  id: string;
  date: string;
  amount: number;
  kind?: "charge" | "payment" | "deposit" | "adjustment" | "refund";
  memo?: string;
  personId?: string;
}

export type Severity = "info" | "watch" | "review";

export interface ForensicFinding {
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

const BENFORD_KINDS = new Set(["charge", "payment", "deposit"]);

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
  return result.toISOString().slice(0, 10);
}

function businessDaysBetween(start: string, end: string): number {
  const result = dateValue(start);
  const finish = dateValue(end);
  let count = 0;
  while (result < finish) {
    result.setUTCDate(result.getUTCDate() + 1);
    const weekday = result.getUTCDay();
    if (weekday !== 0 && weekday !== 6) count++;
  }
  return count;
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
    ],
    examples: [],
  };
}

export function runForensicSuite(txns: Transaction[]): ForensicReport {
  const findings: ForensicFinding[] = [];
  const eligible = txns.filter((txn) => txn.kind !== undefined && BENFORD_KINDS.has(txn.kind));
  const eligibleAmounts = absoluteAmounts(eligible);

  const first = benfordFirstDigit(eligibleAmounts);
  if (first.n >= BENFORD_MIN_SAMPLE) {
    findings.push(benfordFinding("benford_first", first));
  }
  const second = benfordSecondDigit(eligibleAmounts);
  if (second.n >= BENFORD_SECOND_MIN_SAMPLE) {
    findings.push(benfordFinding("benford_second", second));
  }

  const threshold = txns.every((txn) => Math.abs(txn.amount) < 1000) ? 10 : 100;
  const roundCount = txns.filter((txn) => Math.abs(txn.amount) % threshold === 0).length;
  const roundShare = txns.length === 0 ? 0 : roundCount / txns.length;
  findings.push({
    id: "round_amounts",
    title: "Round-amount concentration",
    severity:
      roundShare > 0.15 && txns.length >= 50 ? "review" : roundShare > 0.1 ? "watch" : "info",
    summary: `${roundCount} of ${txns.length} amounts (${(roundShare * 100).toFixed(1)}%) are exact multiples of ${threshold}.`,
    detail: ["Round values can be useful prompts to review how amounts are entered and approved."],
    examples: txns
      .filter((txn) => Math.abs(txn.amount) % threshold === 0)
      .slice(0, 8)
      .map((txn) => txn.id),
  });

  const values = absoluteAmounts(txns);
  const outlierExamples: string[] = [];
  let outlierCount = 0;
  if (values.length > 0) {
    const center = median(values);
    const mad = median(values.map((value) => Math.abs(value - center)));
    if (mad > 0) {
      values.forEach((value, index) => {
        const modifiedZ = (0.6745 * (value - center)) / mad;
        if (Math.abs(modifiedZ) > 3.5) {
          outlierCount++;
          if (outlierExamples.length < 8) outlierExamples.push(txns[index].id);
        }
      });
    }
  }
  findings.push({
    id: "mad_outliers",
    title: "Magnitude outliers",
    severity:
      outlierCount > 0 && outlierCount / Math.max(txns.length, 1) > 0.02
        ? "review"
        : outlierCount > 0
          ? "watch"
          : "info",
    summary: `${outlierCount} amount${outlierCount === 1 ? "" : "s"} exceed the modified-z threshold.`,
    detail: [
      "The modified z-score uses the median and median absolute deviation, which are less influenced by unusually large values.",
    ],
    examples: outlierExamples,
  });

  const duplicateGroups = new Map<string, Transaction[]>();
  for (const txn of txns) {
    const key = `${txn.date}|${txn.amount}|${txn.personId ?? ""}`;
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
    ],
    examples: duplicates
      .flatMap((group) => group)
      .slice(0, 8)
      .map((txn) => txn.id),
  });

  const paymentDates = new Set(txns.filter((txn) => txn.kind === "payment").map((txn) => txn.date));
  const depositDates = new Set(txns.filter((txn) => txn.kind === "deposit").map((txn) => txn.date));
  if (paymentDates.size > 0 && depositDates.size > 0) {
    const latestDate = txns.reduce((latest, txn) => (txn.date > latest ? txn.date : latest), "");
    const gaps = [...paymentDates].filter(
      (date) => ![1, 2].some((days) => depositDates.has(addBusinessDays(date, days))),
    );
    const longGap = gaps.some((date) => businessDaysBetween(date, latestDate) > 5);
    findings.push({
      id: "deposit_gaps",
      title: "Payment-to-deposit timing",
      severity: longGap ? "review" : gaps.length > 0 ? "watch" : "info",
      summary:
        gaps.length > 0
          ? `${gaps.length} payment date${gaps.length === 1 ? "" : "s"} lack a deposit within two business days.`
          : "Each payment date has a deposit within two business days.",
      detail: [
        "This timing screen checks whether recorded deposits follow payment activity within a short business window.",
      ],
      examples: gaps.slice(0, 8),
    });
  }

  const adjustments = txns.filter(
    (txn) => (txn.kind === "adjustment" || txn.kind === "refund") && txn.personId,
  );
  if (adjustments.length > 0) {
    const byPerson = new Map<string, number>();
    for (const txn of adjustments) {
      byPerson.set(txn.personId!, (byPerson.get(txn.personId!) ?? 0) + 1);
    }
    const [personId, count] = [...byPerson.entries()].sort((a, b) => b[1] - a[1])[0];
    const share = count / adjustments.length;
    if (adjustments.length >= 10) {
      findings.push({
        id: "adjustment_concentration",
        title: "Adjustment/refund concentration",
        severity: share > 0.8 ? "review" : share > 0.6 ? "watch" : "info",
        summary: `${(share * 100).toFixed(1)}% of adjustments/refunds are associated with one person record.`,
        detail: [
          `The largest share is ${count} of ${adjustments.length} records for ${personId}.`,
          "Concentration can prompt a conversation about training, access, and review coverage.",
        ],
        examples: adjustments
          .filter((txn) => txn.personId === personId)
          .slice(0, 8)
          .map((txn) => txn.id),
      });
    }
  }

  return {
    n: txns.length,
    benfordFirst: first.n >= BENFORD_MIN_SAMPLE ? first : undefined,
    benfordSecond: second.n >= BENFORD_SECOND_MIN_SAMPLE ? second : undefined,
    findings,
    disclaimer: FORENSIC_DISCLAIMER,
  };
}
