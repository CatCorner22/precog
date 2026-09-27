import { describe, expect, it } from "vitest";
import { demoTransactions } from "./demo-transactions";
import { describeTransaction, runForensicSuite, type Transaction } from "./forensic-suite";

describe("runForensicSuite", () => {
  it("finds what the demo plants and nothing that its structure alone produces", () => {
    const report = runForensicSuite(demoTransactions());
    const byId = new Map(report.findings.map((finding) => [finding.id, finding]));

    expect(byId.get("deposit_gaps")?.severity).toMatch(/watch|review/);
    expect(byId.get("deposit_gaps")?.examples).toEqual(["2025-02-27", "2025-02-28"]);
    expect(byId.get("adjustment_concentration")?.severity).toBe("review");
    expect(byId.get("duplicates")?.summary).toBe("3 repeated groups covering 6 transactions.");
    expect(byId.get("duplicates")?.examples.every((e) => e.endsWith("(refund)"))).toBe(true);
    expect(byId.get("mad_outliers")?.examples).toEqual(["2025-02-07 · -$2,400.00 (adjustment)"]);
    expect(byId.get("benford_first")?.severity).toBe("info");
    expect(byId.get("benford_second")?.severity).toBe("info");
  });

  it("pairs each demo charge with the payment of the same visit", () => {
    const txns = demoTransactions();
    const charge = txns.find((txn) => txn.id === "tx-charge-0")!;
    const payment = txns.find((txn) => txn.id === "tx-payment-0");
    if (payment) expect(payment.amount).toBe(charge.amount);
    expect(txns.some((txn) => /dental/i.test(txn.memo ?? ""))).toBe(false);
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
    expect(finding?.examples).toEqual([
      "2025-01-01 · $10.00 (charge)",
      "2025-01-01 · $10.00 (charge)",
      "2025-01-02 · $20.00 (charge)",
      "2025-01-02 · $20.00 (charge)",
    ]);
  });

  it("does not count a charge and its matching payment as a repeat", () => {
    const finding = runForensicSuite([
      { id: "c", date: "2025-01-01", amount: 80, kind: "charge", personId: "p-1" },
      { id: "p", date: "2025-01-01", amount: 80, kind: "payment", personId: "p-1" },
    ]).findings.find((item) => item.id === "duplicates");
    expect(finding?.summary).toBe("0 repeated groups covering 0 transactions.");
  });

  it("compares deposits only with deposits when looking for outliers", () => {
    const txns: Transaction[] = [];
    for (let day = 1; day <= 20; day++) {
      const date = `2025-01-${String(day).padStart(2, "0")}`;
      let total = 0;
      for (let i = 0; i < 8; i++) {
        const amount = 40 + ((day * 7 + i * 13) % 60);
        total += amount;
        txns.push({ id: `p-${day}-${i}`, date, amount, kind: "payment" });
      }
      txns.push({ id: `d-${day}`, date, amount: total, kind: "deposit" });
    }
    const finding = runForensicSuite(txns).findings.find((item) => item.id === "mad_outliers");
    expect(finding?.summary).toBe("0 amounts exceed the modified-z threshold for their kind.");
    txns.push({ id: "big", row: 200, date: "2025-01-21", amount: 9000, kind: "payment" });
    const flagged = runForensicSuite(txns).findings.find((item) => item.id === "mad_outliers");
    expect(flagged?.examples).toEqual(["row 200 · 2025-01-21 · $9,000.00 (payment)"]);
  });

  it("rates round amounts on the amounts it counted, never on zero amounts", () => {
    const charges: Transaction[] = Array.from({ length: 60 }, (_, i) => ({
      id: `c-${i}`,
      date: "2025-01-01",
      amount: 100,
      kind: "charge",
    }));
    const payments: Transaction[] = Array.from({ length: 10 }, (_, i) => ({
      id: `p-${i}`,
      date: "2025-01-01",
      amount: i < 2 ? 50 : 41.5 + i,
      kind: "payment",
    }));
    const few = runForensicSuite([...charges, ...payments]).findings.find(
      (item) => item.id === "round_amounts",
    );
    expect(few?.severity).not.toBe("review");
    const zeros: Transaction[] = Array.from({ length: 12 }, (_, i) => ({
      id: `z-${i}`,
      date: "2025-01-01",
      amount: 0,
      kind: "adjustment",
    }));
    const withZeros = runForensicSuite([...payments, ...zeros]).findings.find(
      (item) => item.id === "round_amounts",
    );
    expect(withZeros?.summary).toMatch(/^2 of 10 amounts/);
  });

  it("asks for a second reviewer, not a review, when one person posts every adjustment", () => {
    const txns: Transaction[] = Array.from({ length: 12 }, (_, i) => ({
      id: `a-${i}`,
      date: "2025-01-02",
      amount: -5 - i,
      kind: "adjustment",
      personId: "p-bookkeeper",
    }));
    const one = runForensicSuite(txns).findings.find(
      (item) => item.id === "adjustment_concentration",
    );
    expect(one?.severity).toBe("watch");
    expect(one?.summary).toContain("make sure someone else reviews them");
    txns.push({ ...txns[0], id: "other", personId: "p-owner" });
    const two = runForensicSuite(txns).findings.find(
      (item) => item.id === "adjustment_concentration",
    );
    expect(two?.severity).toBe("review");
  });

  it("describes a record by row, day, amount and kind", () => {
    expect(
      describeTransaction({
        id: "txn-12",
        row: 13,
        date: "2025-01-04",
        amount: 1234.56,
        kind: "payment",
      }),
    ).toBe("row 13 · 2025-01-04 · $1,234.56 (payment)");
    expect(describeTransaction({ id: "pasted-1", date: "2025-01-04", amount: -5 })).toBe(
      "2025-01-04 · -$5.00",
    );
  });

  it("does not flag same-day deposits that cover cumulative payments", () => {
    const report = runForensicSuite([
      { id: "payment", date: "2025-01-02", amount: 100, kind: "payment" },
      { id: "deposit", date: "2025-01-02", amount: 100, kind: "deposit" },
    ]);

    const finding = report.findings.find((item) => item.id === "deposit_gaps");
    expect(finding?.severity).toBe("info");
    expect(finding?.summary).toBe("Deposits keep pace with payments within two business days.");
  });
});
