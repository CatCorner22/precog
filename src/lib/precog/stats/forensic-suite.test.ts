import { describe, expect, it } from "vitest";
import { demoTransactions } from "./demo-transactions";
import { runForensicSuite, type Transaction } from "./forensic-suite";

describe("runForensicSuite", () => {
  it("surfaces deposit timing and adjustment concentration in the demo", () => {
    const report = runForensicSuite(demoTransactions());
    const byId = new Map(report.findings.map((finding) => [finding.id, finding]));

    expect(byId.get("deposit_gaps")?.severity).toMatch(/watch|review/);
    expect(byId.get("adjustment_concentration")?.severity).toMatch(/watch|review/);
  });

  it("does not run Benford tests below their sample thresholds", () => {
    const txns: Transaction[] = Array.from({ length: 50 }, (_, index) => ({
      id: `tx-${index}`,
      date: "2025-01-01",
      amount: index + 1,
      kind: "charge",
    }));

    const report = runForensicSuite(txns);
    expect(report.benfordFirst).toBeUndefined();
    expect(report.benfordSecond).toBeUndefined();
    expect(report.findings.some((finding) => finding.id === "benford_first")).toBe(false);
  });

  it("groups repeated amount-and-date transactions", () => {
    const txns: Transaction[] = [
      { id: "a", date: "2025-01-01", amount: 10, kind: "charge" },
      { id: "b", date: "2025-01-01", amount: 10, kind: "charge" },
      { id: "c", date: "2025-01-02", amount: 20, kind: "charge", personId: "p-1" },
      { id: "d", date: "2025-01-02", amount: 20, kind: "charge", personId: "p-1" },
      { id: "e", date: "2025-01-02", amount: 20, kind: "charge", personId: "p-2" },
    ];

    const finding = runForensicSuite(txns).findings.find((item) => item.id === "duplicates");
    expect(finding?.summary).toContain("2 repeated groups");
    expect(finding?.examples).toEqual(["a", "b", "c", "d"]);
  });
});
