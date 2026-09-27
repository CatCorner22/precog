import { describe, expect, it } from "vitest";
import { parseTransactionDate, parseTransactionsCsv } from "./transactions-csv";

describe("parseTransactionsCsv", () => {
  it("parses currency, parentheses negatives, optional fields, and bad-row issues", () => {
    const result = parseTransactionsCsv(
      "DATE,Amount,Kind,Memo,Person\r\n" +
        '2025-01-01,"$1,234.56",charge,"Office, visit",p-front-desk\r\n' +
        "2025-01-02,(12.00),refund,Correction,p-front-desk\r\n" +
        "not-a-date,wat,charge,Bad,\r\n" +
        "2025-01-04,5,unknown,Unsupported,\r\n",
    );

    expect(result.transactions).toEqual([
      {
        id: "txn-1",
        row: 2,
        date: "2025-01-01",
        amount: 1234.56,
        kind: "charge",
        memo: "Office, visit",
        personId: "p-front-desk",
      },
      {
        id: "txn-2",
        row: 3,
        date: "2025-01-02",
        amount: -12,
        kind: "refund",
        memo: "Correction",
        personId: "p-front-desk",
      },
    ]);
    expect(result.issues).toEqual([
      'Row 4: date "not-a-date" not recognized; use YYYY-MM-DD, MM/DD/YYYY or M/D/YY',
      "Row 5: unknown kind",
    ]);
  });

  it("requires date and amount columns", () => {
    expect(parseTransactionsCsv("memo,value\nhello,1").issues).toEqual([
      "Missing required date or amount column",
    ]);
  });

  it("keeps reading after twenty bad rows and counts the issues it does not list", () => {
    const bad = Array.from({ length: 25 }, () => "2025-01-01,wat").join("\n");
    const good = Array.from({ length: 100 }, (_, i) => `2025-01-02,${i + 1}`).join("\n");
    const result = parseTransactionsCsv(`date,amount\n${bad}\n${good}`);
    expect(result.transactions).toHaveLength(100);
    expect(result.issues).toHaveLength(21);
    expect(result.issues[20]).toBe("and 5 more rows had issues");
  });

  it("reads US dates as QuickBooks, Excel and bank exports write them", () => {
    expect(parseTransactionDate("01/04/2025")).toBe("2025-01-04");
    expect(parseTransactionDate("1/4/2025")).toBe("2025-01-04");
    expect(parseTransactionDate("1/4/25")).toBe("2025-01-04");
    expect(parseTransactionDate("2025-01-04")).toBe("2025-01-04");
    expect(parseTransactionDate("13/45/2025")).toBeNull();
    expect(parseTransactionDate("02/30/2025")).toBeNull();
    const result = parseTransactionsCsv("Date,Amount\n01/04/2025,12.50\n");
    expect(result.transactions[0]).toMatchObject({ date: "2025-01-04", amount: 12.5, row: 2 });
  });
});
