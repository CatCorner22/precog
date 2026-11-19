import { describe, expect, it } from "vitest";
import { runForensicSuite, type Transaction } from "./forensic-suite";
import { oddTransactions, type OddTransactionOptions } from "./odd-transactions";
import { parseTransactionsCsv } from "./transactions-csv";

const txn = (
  id: string,
  date: string,
  amount: number,
  extra: Partial<Transaction> = {},
): Transaction => ({ id, date, amount, ...extra });
const options: OddTransactionOptions = { today: "2025-04-02", limits: { check: 100 } };
const finding = (rows: Transaction[], id: string, opts = options) =>
  oddTransactions(rows, opts).findings.find((f) => f.id === id);
const split = (day: string, amounts: number[]) =>
  amounts.map((amount, i) =>
    txn(String(i), i ? day : "2025-01-01", amount, { payee: "Supplier", channel: "check" }),
  );

describe("additional forensic checks", () => {
  it("splits at 7, not 8 days, strictly under and together strictly over a limit", () => {
    expect(finding(split("2025-01-08", [-50, -51]), "split_limit")?.severity).toBe("review");
    for (const rows of [
      split("2025-01-09", [-50, -51]),
      split("2025-01-08", [-50, -50]),
      split("2025-01-08", [-100, -1]),
      split("2025-01-08", [-101]),
      split("2025-01-08", [60, 60]),
    ])
      expect(finding(rows, "split_limit")?.severity).toBe("info");
    const mixed = split("2025-01-08", [-60, -60]);
    expect(finding([mixed[0], { ...mixed[1], payee: "Other" }], "split_limit")?.severity).toBe(
      "info",
    );
    expect(finding([mixed[0], { ...mixed[1], channel: "ach" }], "split_limit")?.severity).toBe(
      "info",
    );
    expect(
      finding(split("2025-01-08", [-0.1, -0.2]), "split_limit", { limits: { check: 0.3 } })
        ?.severity,
    ).toBe("info");
  });
  it("counts gaps and repeats within each numbered series, without enumerating gaps", () => {
    const rows = ["INV-001", "INV-002", "INV-004", "INV-004", "CHK-006"].map((number, i) =>
      txn(String(i), "2025-01-01", 1, { number }),
    );
    expect(finding(rows, "number_sequence")?.summary).toBe(
      "1 missing numbers and 1 repeated numbers within numbered series.",
    );
    expect(finding(rows.slice(0, 2), "number_sequence")?.severity).toBe("info");
    expect(
      finding(
        [
          txn("a", "2025-01-01", 1, { number: "1" }),
          txn("b", "2025-01-01", 1, { number: "99999999999999999" }),
        ],
        "number_sequence",
      )?.summary,
    ).toContain("99999999999999997");
  });
  it("keeps invoices in each supplier's series and checks account-wide", () => {
    const invoices = parseTransactionsCsv(
      "date,amount,payee,invoice number,account\n2025-01-01,10,Acme,INV-001,bank\n2025-01-02,10,Other,INV-001,bank",
    ).transactions;
    expect(invoices[0]).toMatchObject({ number: "INV-001", numberType: "invoice" });
    expect(finding(invoices, "number_sequence")?.summary).toBe(
      "0 missing numbers and 0 repeated numbers within numbered series.",
    );
    const checks = parseTransactionsCsv(
      "date,amount,payee,check number,account\n2025-01-01,-10,Acme,001,bank\n2025-01-02,-10,Other,002,bank\n2025-01-03,-10,Acme,003,bank",
    ).transactions;
    expect(checks[0]).toMatchObject({ number: "001", numberType: "check" });
    expect(finding(checks, "number_sequence")?.summary).toBe(
      "0 missing numbers and 0 repeated numbers within numbered series.",
    );
    expect(
      finding([{ ...checks[0], number: "002" }, checks[1]], "number_sequence")?.summary,
    ).toContain("1 repeated numbers");
    expect(finding(invoices, "number_sequence")).toEqual(
      finding([...invoices].reverse(), "number_sequence"),
    );
  });
  it("does not guess an invoice series without a supplier or infer a generic number's type", () => {
    const invoices = parseTransactionsCsv(
      "date,amount,invoice number\n2025-01-01,10,INV-001\n2025-01-02,10,INV-001",
    ).transactions;
    const result = oddTransactions(invoices, options);
    expect(result.findings.find((f) => f.id === "number_sequence")).toBeUndefined();
    expect(result.skipped).toContainEqual({
      id: "number_sequence",
      reason: "Invoice numbers need a payee to identify their series.",
    });
    expect(
      parseTransactionsCsv("date,amount,number\n2025-01-01,10,001").transactions[0],
    ).not.toHaveProperty("numberType");
  });
  it("gates weekend checks on times/hours and tests late-night clock boundaries", () => {
    for (const [time, severity] of [
      ["05:59", "watch"],
      ["06:00", "info"],
      ["21:59", "info"],
      ["22:00", "watch"],
    ] as const)
      expect(finding([txn("a", "2025-01-06", 1, { time })], "outside_hours")?.severity).toBe(
        severity,
      );
    expect(finding([txn("a", "2025-01-04", 1)], "outside_hours")).toBeUndefined();
    expect(finding([txn("a", "2025-01-04", 1, { time: "12:00" })], "outside_hours")?.severity).toBe(
      "watch",
    );
    const businessHours = { days: [1, 2, 3, 4, 5], start: "09:00", end: "17:00" };
    for (const [time, severity] of [
      ["08:59", "watch"],
      ["09:00", "info"],
      ["16:59", "info"],
      ["17:00", "watch"],
    ] as const)
      expect(
        finding([txn("a", "2025-01-06", 1, { time })], "outside_hours", { businessHours })
          ?.severity,
      ).toBe(severity);
    expect(finding([txn("a", "2025-01-04", 1)], "outside_hours", { businessHours })?.severity).toBe(
      "watch",
    );
  });
  it("pairs equal opposite amounts one-to-one within 3 calendar days, including leap day", () => {
    const rows = [
      txn("in", "2024-02-28", 10),
      txn("out", "2024-03-02", -10),
      txn("again", "2024-03-02", -10),
    ];
    expect(finding(rows, "money_in_out")?.summary).toBe(
      "1 equal-amount in/out pairs within 3 days.",
    );
    expect(finding([rows[0], { ...rows[1], date: "2024-03-03" }], "money_in_out")?.severity).toBe(
      "info",
    );
    expect(finding([rows[0], { ...rows[1], amount: -10.01 }], "money_in_out")?.severity).toBe(
      "info",
    );
  });
  it("flags only nonzero suspense/clearing net balances untouched beyond day 90", () => {
    const row = txn("a", "2025-01-01", 10, { account: "Suspense" });
    expect(finding([row], "stale_suspense", { today: "2025-04-01" })?.severity).toBe("info");
    expect(finding([row], "stale_suspense")?.severity).toBe("watch");
    expect(finding([row, { ...row, id: "b", amount: -10 }], "stale_suspense")?.severity).toBe(
      "info",
    );
    expect(
      finding([row, { ...row, id: "b", date: "2025-04-01" }], "stale_suspense")?.severity,
    ).toBe("info");
    expect(finding([{ ...row, account: "Sales" }], "stale_suspense")?.severity).toBe("info");
  });
  it("states missing inputs, handles empty/invalid values, and never guesses pasted dates", () => {
    expect(oddTransactions([], {}).skipped.map((s) => s.id)).toEqual([
      "split_limit",
      "number_sequence",
      "outside_hours",
      "money_in_out",
      "stale_suspense",
    ]);
    const bad = txn("bad", "not-a-day", Number.NaN, { number: "text", time: "25:00" });
    expect(() => oddTransactions([bad], { today: "bad" })).not.toThrow();
    expect(
      oddTransactions(split("2025-01-08", [-60, -60]), { ...options, datesKnown: false }).findings,
    ).toEqual([]);
  });
  it("is deterministic under shuffle, and appends rather than changes legacy findings", () => {
    const rows = split("2025-01-08", [-60, -60]);
    expect(oddTransactions(rows, options)).toEqual(oddTransactions([...rows].reverse(), options));
    const report = runForensicSuite(rows, options);
    const plain = rows.map(({ id, date, amount }) => ({ id, date, amount }));
    const oldIds = ["round_amounts", "mad_outliers", "duplicates"];
    expect(report.findings.filter((f) => oldIds.includes(f.id))).toEqual(
      runForensicSuite(plain).findings.filter((f) => oldIds.includes(f.id)),
    );
    expect(report.n).toBe(rows.length);
  });
  it("imports optional aliases without changing old rows or dropping invalid optional data", () => {
    const imported = parseTransactionsCsv(
      "date,amount,vendor,invoice number,entry time,ledger account,method\n2025-01-01,-60,Acme,INV-1,22:00,clearing,check",
    );
    expect(imported.transactions[0]).toMatchObject({
      payee: "Acme",
      number: "INV-1",
      time: "22:00",
      account: "clearing",
      channel: "check",
    });
    const invalid = parseTransactionsCsv("date,amount,time\n2025-01-01,10,25:00");
    expect(invalid.transactions).toHaveLength(1);
    expect(invalid.transactions[0].time).toBeUndefined();
    expect(invalid.issues.join()).toContain("time");
  });
});
