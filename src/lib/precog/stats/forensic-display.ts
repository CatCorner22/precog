import type { DigitTest } from "./benford";
import type { ForensicReport, Severity } from "./forensic-suite";

/** What an owner should do with a finding, in place of the engine's severity code. */
export const SEVERITY_LABEL: Record<Severity, string> = {
  review: "Look into this",
  watch: "Worth a look",
  info: "For information",
};

/** Fit to Benford's law in plain words; the cutoffs are Nigrini's (2012). */
export const CONFORMITY_LABEL: Record<DigitTest["conformity"], string> = {
  close: "close",
  acceptable: "acceptable",
  marginal: "marginal",
  nonconformity: "poor",
};

interface BenfordRow {
  digit: number;
  observedPct: number;
  expectedPct: number;
  /** Bar widths in percent, all on one scale so rows compare with each other. */
  observedWidth: number;
  expectedWidth: number;
}

/** The first-digit chart: every bar is scaled to the largest share on the chart. */
export function benfordRows(test: DigitTest): BenfordRow[] {
  const max = Math.max(...test.observed, ...test.expected, 0.01);
  return test.digits.map((digit, index) => ({
    digit,
    observedPct: test.observed[index] * 100,
    expectedPct: test.expected[index] * 100,
    observedWidth: (test.observed[index] / max) * 100,
    expectedWidth: (test.expected[index] / max) * 100,
  }));
}

/**
 * The findings worth showing for the data on screen: none before anything is
 * loaded, and no repeated-transaction check on a bare list of pasted amounts,
 * whose placeholder dates would make every two equal prices a "repeat".
 */
export function screenFindings(
  report: ForensicReport,
  undated: boolean,
): ForensicReport["findings"] {
  if (report.n === 0) return [];
  return undated ? report.findings.filter((f) => f.id !== "duplicates") : report.findings;
}
