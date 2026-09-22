import { describe, expect, it } from "vitest";
import { parseTransactionsCsv } from "./transactions-csv";

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
        date: "2025-01-01",
        amount: 1234.56,
        kind: "charge",
        memo: "Office, visit",
        personId: "p-front-desk",
      },
      {
        id: "txn-2",
        date: "2025-01-02",
        amount: -12,
        kind: "refund",
        memo: "Correction",
        personId: "p-front-desk",
      },
    ]);
    expect(result.issues).toEqual(["Row 4: invalid date", "Row 5: unknown kind"]);
  });

  it("requires date and amount columns", () => {
    expect(parseTransactionsCsv("memo,value\nhello,1").issues).toEqual([
      "Missing required date or amount column",
    ]);
  });
});
