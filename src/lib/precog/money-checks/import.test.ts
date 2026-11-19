import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { formatCents, parseCents, parseMoneyDate, type Cents } from "./parse";
import { importBankCsv, importBooksCsv } from "./import";

describe("exact money inputs", () => {
  it.each([
    [123456, "$1,234.56"],
    [-500, "-$5.00"],
    [0, "$0.00"],
    [-0, "$0.00"],
    [1, "$0.01"],
    [-1, "-$0.01"],
    [99, "$0.99"],
    [-99, "-$0.99"],
    [Number.MAX_SAFE_INTEGER, "$90,071,992,547,409.91"],
    [Number.MIN_SAFE_INTEGER, "-$90,071,992,547,409.91"],
  ])("formats %s cents exactly", (cents, dollars) => {
    expect(formatCents(cents as Cents)).toBe(dollars);
  });
  it.each([NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "refuses invalid cents %s",
    (cents) => {
      expect(() => formatCents(cents as Cents)).toThrow(RangeError);
    },
  );
  it.each([
    ["1,240.00", 124000],
    ["-$12.5", -1250],
    ["(45.00)", -4500],
    ["45", 4500],
    ["0.01", 1],
    ["-0", 0],
    ["+45", 4500],
    [" $0.00 ", 0],
    ["90071992547409.91", Number.MAX_SAFE_INTEGER],
  ])("reads %s", (text, cents) => {
    expect(parseCents(String(text))).toEqual({ value: cents });
  });
  it.each([
    "",
    " ",
    "1.001",
    "1e2",
    "NaN",
    "Infinity",
    "12,40",
    "1,00,000",
    "--1",
    "$-12",
    "(-1)",
    ".5",
    "1.",
    "90071992547409.92",
  ])("refuses %s without rounding", (text) => {
    expect(parseCents(text)).toHaveProperty("issue");
  });
  it.each(["2024-02-29", "2/29/2024", "2/29/24"])("reads date %s", (text) =>
    expect(parseMoneyDate(text)).toEqual({ value: "2024-02-29" }),
  );
  it.each(["", "2023-02-29", "02/30/24", "13/1/24", "2024-2-01", "2024-01-01T00:00:00Z", "1/1/1"])(
    "refuses date %s",
    (text) => expect(parseMoneyDate(text)).toHaveProperty("issue"),
  );
});

describe("money file imports", () => {
  const bank = readFileSync(new URL("./bank.csv", import.meta.url), "utf8");
  const books = readFileSync(new URL("./books.csv", import.meta.url), "utf8");
  it("replays and preserves normalized data after shuffling", () => {
    for (const [parse, csv] of [
      [importBankCsv, bank],
      [importBooksCsv, books],
    ] as const) {
      const [header, ...rows] = csv.trim().split("\n");
      const first = parse(csv);
      expect(parse(csv)).toEqual(first);
      const values = (text: string) => parse(text).rows.map(({ sourceRow: _row, ...row }) => row);
      expect(values([header, ...rows.reverse()].join("\n"))).toEqual(values(csv));
      expect(first.issues).toEqual([]);
    }
  });
  it("independently re-reads fixture totals", () => {
    for (const [parse, csv, column] of [
      [importBankCsv, bank, 1],
      [importBooksCsv, books, 2],
    ] as const) {
      const total = csv
        .trim()
        .split("\n")
        .slice(1)
        .reduce((sum, row) => {
          const raw = row.split(",")[column];
          const [whole, decimals] = raw.replace("-", "").split(".");
          return sum + (raw.startsWith("-") ? -1 : 1) * (Number(whole) * 100 + Number(decimals));
        }, 0);
      expect(parse(csv).rows.reduce((sum, row) => sum + row.amountCents, 0)).toBe(total);
    }
  });
  it("accepts delimiters, aliases, direction and split amounts", () => {
    expect(
      importBankCsv("Posted date;Debit;Credit;Memo\n11/1/26;12.50;;Test").rows[0],
    ).toMatchObject({ date: "2026-11-01", amountCents: -1250 });
    expect(
      importBankCsv("Transaction date\tAmount\tDirection\tDescription\n11/1/26\t45\tout\tTest")
        .rows[0].amountCents,
    ).toBe(-4500);
    expect(
      importBankCsv('Date,Amount,Description\n2026-11-01,"1,240.00","Test, memo"').rows[0]
        .amountCents,
    ).toBe(124000);
    expect(importBooksCsv(books).optionalColumns).toEqual([
      "account",
      "reference",
      "entered_by",
      "approved_by",
      "reverses",
      "closed_period",
      "entry_date",
    ]);
  });
  it("normalizes every books type", () => {
    const types = [
      "payment received",
      "deposit",
      "payment out",
      "refund",
      "adjustment",
      "write-off",
      "reversal",
      "payroll",
    ];
    const result = importBooksCsv(
      "Entry date,Effective date,Amount,Type\n" +
        types.map((type) => `2026-11-01,2026-11-01,1,${type}`).join("\n"),
    );
    expect(result.rows.map((row) => row.type).sort()).toEqual(
      types.map((type) => type.replace(/[ -]/g, "_")).sort(),
    );
  });
  it("uses effective date only when the entry-date column is absent", () => {
    const absent = importBooksCsv("Effective date,Amount,Type\n11/1/26,1,deposit");
    expect(absent.issues).toEqual([]);
    expect(absent.rows[0].entryDate).toBe("2026-11-01");
    expect(absent.optionalColumns).not.toContain("entry_date");
    const present = importBooksCsv(
      "Entry date,Effective date,Amount,Type\n11/3/26,11/1/26,1,deposit",
    );
    expect(present.issues).toEqual([]);
    expect(present.rows[0].entryDate).toBe("2026-11-03");
    expect(present.optionalColumns).toContain("entry_date");
    expect(
      importBooksCsv("Entry date,Effective date,Amount,Type\n,11/1/26,1,deposit").issues,
    ).not.toHaveLength(0);
  });
  it.each([
    ["payment_received", 100],
    ["deposit", 100],
    ["payment_out", -100],
    ["refund", -100],
    ["write_off", -100],
    ["payroll", -100],
    ["adjustment", null],
    ["reversal", null],
  ] as const)("derives books signs for %s", (type, fixed) => {
    for (const [columns, cells, fileSign] of [
      ["Amount", "1", 100],
      ["Amount", "-1", -100],
      ["Debit,Credit", "1,", -100],
      ["Debit,Credit", ",1", 100],
      ["Debit,Credit", "-1,", -100],
      ["Debit,Credit", ",-1", -100],
    ] as const) {
      const result = importBooksCsv(`Effective date,${columns},Type\n11/1/26,${cells},${type}`);
      expect(result.issues).toEqual([]);
      expect(result.rows[0].amountCents).toBe(fixed ?? fileSign);
    }
  });
  it("reports empty, missing, ambiguous and invalid inputs", () => {
    expect(importBankCsv("").issues).not.toHaveLength(0);
    expect(importBooksCsv("Date,Amount\n2026-11-01,1").rows).toEqual([]);
    for (const line of ["2026-02-30,1,Test", "2026-11-01,1.001,Test"])
      expect(importBankCsv("Date,Amount,Description\n" + line).issues).toHaveLength(1);
    expect(importBankCsv("Date,Debit,Credit,Description\n2026-11-01,1,2,Test").issues).toHaveLength(
      1,
    );
    expect(
      importBankCsv("Date,Amount,Direction,Description\n2026-11-01,1,sideways,Test").issues,
    ).toHaveLength(1);
    expect(
      importBooksCsv("Entry date,Effective date,Amount,Type\n2026-11-01,2026-11-01,1,unknown")
        .issues,
    ).toHaveLength(1);
    expect(importBankCsv("Date,Posted date,Amount,Description").issues).not.toHaveLength(0);
  });
  it("caps rows and UTF-8 bytes", () => {
    const result = importBankCsv("Date,Amount,Description\n" + "2026-11-01,1,Test\n".repeat(5001));
    expect(result.rows).toHaveLength(5000);
    expect(result.issues[0].message).toContain("5000");
    expect(importBankCsv("é".repeat(2_500_001)).issues[0].message).toContain("5 MB");
  });
  it("keeps valid rows after errors and rejects damaged CSV", () => {
    const result = importBankCsv("Date,Amount,Description\n2026-11-01,no,Test\n2026-11-01,2,Test");
    expect(result.rows[0]).toMatchObject({ sourceRow: 2, amountCents: 200 });
    expect(result.issues[0].row).toBe(1);
    for (const line of ['2026-11-01,1,"unfinished', "2026-11-01,1,240,Test", "2026-11-01,1"])
      expect(importBankCsv("Date,Amount,Description\n" + line).rows).toEqual([]);
    expect(importBankCsv("Date,Amount,Description")).toEqual({
      rows: [],
      issues: [],
      optionalColumns: [],
    });
  });
  it("orders ties by cents then source row and reports missing optional data", () => {
    const result = importBankCsv(
      "Date,Amount,Description\n2026-11-02,1,A\n2026-11-01,2,B\n2026-11-01,1,C\n2026-11-01,1,D",
    );
    expect(result.rows.map((row) => row.sourceRow)).toEqual([3, 4, 2, 1]);
    expect(result.optionalColumns).toEqual([]);
  });
  it.each(["in", "out", "credit", "debit"])("reads direction %s", (direction) => {
    const result = importBankCsv(
      `Date,Amount,Direction,Description\n2026-11-01,1,${direction},Test`,
    );
    expect(result.rows[0].amountCents).toBe(["in", "credit"].includes(direction) ? 100 : -100);
  });
  it("reads split credits and refuses conflicting signs and column layouts", () => {
    expect(
      importBankCsv("Date,Debit,Credit,Description\n2026-11-01,,2,Test").rows[0].amountCents,
    ).toBe(200);
    for (const csv of [
      "Date,Amount,Direction,Description\n2026-11-01,-1,in,Test",
      "Date,Debit,Credit,Description\n2026-11-01,-1,,Test",
      "Date,Amount,Debit,Credit,Description",
      "Date,Debit,Credit,Direction,Description",
    ])
      expect(importBankCsv(csv).issues).not.toHaveLength(0);
  });
  it.each(["adjustment", "reversal"])("keeps the direction column for books %s", (type) => {
    for (const [direction, cents] of [
      ["out", -1200],
      ["in", 1200],
    ] as const)
      expect(
        importBooksCsv(`Effective date,Amount,Direction,Type\n11/1/26,12.00,${direction},${type}`)
          .rows[0].amountCents,
      ).toBe(cents);
  });
});
