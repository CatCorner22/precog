import { describe, expect, it } from "vitest";
import { parsePastedAmounts } from "./pasted-amounts";

describe("parsePastedAmounts", () => {
  it("reads currency, commas and parenthesised negatives, one amount per line", () => {
    const result = parsePastedAmounts("125.00\n$1,200\n(40.00)\n\n", new Date(2026, 8, 26));
    expect(result.transactions.map((t) => t.amount)).toEqual([125, 1200, -40]);
    expect(result.transactions.every((t) => t.date === "2026-09-26")).toBe(true);
    expect(result.undated).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("rejects a line with no digits instead of reading it as zero", () => {
    const result = parsePastedAmounts("10\n$\n()\nabc");
    expect(result.transactions.map((t) => t.amount)).toEqual([10]);
    expect(result.issues).toEqual([
      "Line 2: invalid amount",
      "Line 3: invalid amount",
      "Line 4: invalid amount",
    ]);
  });

  it("hands a pasted CSV with date and amount columns to the CSV reader", () => {
    const result = parsePastedAmounts("Date,Amount\n2026-01-02,50\n2026-01-03,(5)");
    expect(result.undated).toBe(false);
    expect(result.transactions).toEqual([
      { id: "txn-1", date: "2026-01-02", amount: 50 },
      { id: "txn-2", date: "2026-01-03", amount: -5 },
    ]);
  });

  it("returns nothing for an empty paste", () => {
    expect(parsePastedAmounts("  \n ")).toEqual({ transactions: [], issues: [], undated: false });
  });
});
