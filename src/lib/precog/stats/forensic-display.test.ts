import { describe, expect, it } from "vitest";
import { benfordFirstDigit } from "./benford";
import { demoTransactions } from "./demo-transactions";
import { benfordRows, screenFindings } from "./forensic-display";
import { runForensicSuite } from "./forensic-suite";
import { parsePastedAmounts } from "./pasted-amounts";

describe("screenFindings", () => {
  it("shows no findings before anything is loaded", () => {
    expect(runForensicSuite([]).findings.length).toBeGreaterThan(0);
    expect(screenFindings(runForensicSuite([]), false)).toEqual([]);
  });

  it("does not call equal pasted prices a repeated transaction group", () => {
    const pasted = parsePastedAmounts(
      [
        125, 125, 80.5, 80.5, 40, 52.3, 77, 19, 63, 210, 33, 91, 18, 47, 66, 120, 14, 29, 38, 59,
      ].join("\n"),
    );
    const report = runForensicSuite(pasted.transactions);
    expect(report.findings.some((f) => f.id === "duplicates" && f.severity === "review")).toBe(
      true,
    );
    expect(screenFindings(report, pasted.undated).some((f) => f.id === "duplicates")).toBe(false);
  });

  it("keeps the repeated-transaction check for dated records", () => {
    const report = runForensicSuite(demoTransactions());
    expect(screenFindings(report, false).some((f) => f.id === "duplicates")).toBe(true);
  });
});

describe("benfordRows", () => {
  it("draws every bar on one scale, so digit 1's expected bar is wider than digit 9's", () => {
    const amounts = demoTransactions()
      .filter((t) => t.kind === "payment" || t.kind === "deposit")
      .map((t) => Math.abs(t.amount));
    const rows = benfordRows(benfordFirstDigit(amounts));
    const widest = Math.max(...rows.flatMap((r) => [r.observedWidth, r.expectedWidth]));
    expect(widest).toBeCloseTo(100);
    expect(rows[0].expectedWidth).toBeGreaterThan(rows[8].expectedWidth * 5);
    expect(rows[0].expectedPct).toBeCloseTo(30.1, 1);
  });
});
