import { describe, expect, it } from "vitest";
import { shiftDay } from "../dates";
import { importBankCsv, importBooksCsv } from "./import";
import { runChecks } from "./detect";

const today = "2026-11-19";
const day = (age: number) => shiftDay(today, -age);
const bankFile = (rows: string[] = []) =>
  importBankCsv("Date,Amount,Description,Reference\n" + rows.join("\n"));
const booksFile = (
  rows: string[] = [],
  columns = "Entry date,Effective date,Amount,Type,Account,Reference,Reverses",
) => importBooksCsv(columns + "\n" + rows.join("\n"));
const entry = (
  effective: string,
  type = "deposit",
  reference = "B1",
  entered = effective,
  reverses = "",
) => `${entered},${effective},10,${type},A,${reference},${reverses}`;
const check = (key: string, bank = bankFile(), books = booksFile(), closes?: string[]) =>
  runChecks({ bank, books, today, closes }).findings.filter((f) => f.check === key);

describe("money checks 1 to 5", () => {
  it.each([
    [1, null],
    [2, "info"],
    [6, "info"],
    [7, "watch"],
    [30, "watch"],
    [31, "review"],
    [46, "review"],
  ] as const)("ages bank lines at day %i", (age, level) => {
    expect(
      check("unmatched_bank_line", bankFile([`${day(age)},10,Test,R1`])).map((f) => f.level),
    ).toEqual(level ? [level] : []);
  });
  it.each([
    [4, null],
    [5, "watch"],
    [14, "watch"],
    [15, "review"],
    [45, "review"],
    [46, null],
  ] as const)("ages deposits at day %i", (age, level) => {
    expect(
      check("deposit_not_banked", bankFile(), booksFile([entry(day(age))])).map((f) => f.level),
    ).toEqual(level ? [level] : []);
  });
  it.each([-4, -3, 0, 3, 4])("matches at offset %i", (offset) => {
    const bank = bankFile([`${day(10)},10,Test,R1`]);
    const books = booksFile([entry(shiftDay(day(10), offset))]);
    const result = runChecks({ bank, books, today }).findings;
    expect(
      result.filter((f) => ["unmatched_bank_line", "deposit_not_banked"].includes(f.check)),
    ).toHaveLength(Math.abs(offset) <= 3 ? 0 : 2);
  });
  it("matches one to one, closest date first, with stable ties", () => {
    const bank = bankFile([`${day(10)},10,Test,R1`]);
    const books = booksFile([entry(day(12), "deposit", "far"), entry(day(10), "deposit", "near")]);
    expect(check("deposit_not_banked", bank, books)[0].sourceRows.books).toEqual([1]);
    const twoBank = bankFile([`${day(10)},10,Test,R1`, `${day(9)},10,Test,R2`]);
    expect(check("unmatched_bank_line", twoBank, booksFile([entry(day(10))]))).toHaveLength(1);
    expect(
      check(
        "deposit_not_banked",
        bank,
        booksFile([entry(day(10), "deposit", "Z"), entry(day(10), "deposit", "A")]),
      )[0].sourceRows.books,
    ).toEqual([1]);
  });
  it("never matches opposite signs", () => {
    expect(
      check(
        "unmatched_bank_line",
        bankFile([`${day(10)},-10,Test,R1`]),
        booksFile([entry(day(10))]),
      ),
    ).toHaveLength(1);
  });
  it("flags only later duplicate payments, unless any member was reversed", () => {
    const rows = [
      entry(day(10), "payment_received", "P1"),
      entry(day(10), "payment_received", "P2"),
    ];
    const found = check("duplicate_payment", bankFile(), booksFile(rows));
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ level: "info", sourceRows: { books: [1, 2] } });
    expect(
      check(
        "duplicate_payment",
        bankFile(),
        booksFile([...rows, entry(day(1), "reversal", "REV", day(1), "P1")]),
      ),
    ).toEqual([]);
    expect(
      check("duplicate_payment", bankFile(), booksFile(rows.map((r) => r.replace(",A,", ",B,")))),
    ).toHaveLength(1);
    expect(
      check("duplicate_payment", bankFile(), booksFile([rows[0], rows[1].replace(",A,", ",B,")])),
    ).toEqual([]);
    expect(
      check(
        "duplicate_payment",
        bankFile(),
        booksFile([
          entry(day(46), "payment_received", "P1"),
          entry(day(46), "payment_received", "P2"),
        ]),
      ),
    ).toEqual([]);
  });
  it.each([
    [7, null],
    [8, "watch"],
    [30, "watch"],
    [31, "review"],
  ] as const)("backdating at %i days", (lag, level) => {
    for (const type of ["adjustment", "write_off", "refund", "reversal"]) {
      expect(
        check(
          "backdated_entry",
          bankFile(),
          booksFile([entry(day(lag + 1), type, "B1", day(1))]),
        ).map((f) => f.level),
      ).toEqual(level ? [level] : []);
    }
    expect(
      check(
        "backdated_entry",
        bankFile(),
        booksFile([entry(day(lag + 1), "deposit", "B1", day(1))]),
      ),
    ).toEqual([]);
  });
  it("windows backdated entries by entry date, not effective date", () => {
    expect(
      check("backdated_entry", bankFile(), booksFile([entry(day(90), "adjustment", "A", day(45))])),
    ).toHaveLength(1);
    expect(
      check("backdated_entry", bankFile(), booksFile([entry(day(90), "adjustment", "A", day(46))])),
    ).toEqual([]);
  });
  it("checks closed-through boundaries, corrections and repeated entries", () => {
    const close = day(10);
    const first = entry(close, "adjustment", "A", day(9));
    expect(check("closed_period_entry", bankFile(), booksFile([first]), [close])[0].level).toBe(
      "watch",
    );
    const repeated = check(
      "closed_period_entry",
      bankFile(),
      booksFile([first, entry(day(11), "deposit", "B", day(8))]),
      [close],
    );
    expect(repeated.map((f) => f.level)).toEqual(["review", "review"]);
    expect(
      check(
        "closed_period_entry",
        bankFile(),
        booksFile([
          entry(close, "deposit", "A", close),
          entry(day(9), "deposit", "B", day(8)),
          entry(close, "reversal", "C", day(9), "A"),
        ]),
        [close],
      ),
    ).toEqual([]);
    expect(
      check("closed_period_entry", bankFile(), booksFile([first]), [day(5), close]),
    ).toHaveLength(1);
  });
  it("reports unavailable columns and leaves other checks running", () => {
    const books = booksFile([`${day(10)},10,deposit`], "Effective date,Amount,Type");
    const result = runChecks({ bank: bankFile(), books, today });
    expect(result.skipped).toEqual(
      expect.arrayContaining([
        { check: "duplicate_payment", missingColumn: "account" },
        { check: "backdated_entry", missingColumn: "entry_date" },
        { check: "closed_period_entry", missingColumn: "entry_date" },
        { check: "closed_period_entry", missingColumn: "closes" },
      ]),
    );
    expect(result.findings.map((f) => f.check)).toContain("deposit_not_banked");
  });
  it("windows closed-period entries by entry date and uses the latest crossed close", () => {
    const books = booksFile([
      entry(day(90), "deposit", "A", day(45)),
      entry(day(80), "deposit", "B", day(44)),
      entry(day(90), "deposit", "C", day(46)),
    ]);
    const findings = check("closed_period_entry", bankFile(), books, [day(60), day(50)]);
    expect(findings).toHaveLength(2);
    expect(findings.map((f) => [f.level, f.dates.close])).toEqual([
      ["review", day(50)],
      ["review", day(50)],
    ]);
  });
  it("replays shuffled inputs, emits no memo or person names, and keeps ids after row renumbering", () => {
    const bank = bankFile([`${day(10)},10,Private memo,R1`, `${day(11)},20,Private memo,R2`]);
    const books = booksFile([
      entry(day(12), "adjustment", "A", day(1)),
      entry(day(12), "adjustment", "B", day(1)),
    ]);
    const input = { bank, books, today, closes: [day(5), day(10)] };
    const result = runChecks(input);
    expect(runChecks(input)).toEqual(result);
    expect(
      runChecks({
        ...input,
        bank: { ...bank, rows: [...bank.rows].reverse() },
        books: { ...books, rows: [...books.rows].reverse() },
        closes: [...input.closes].reverse(),
      }),
    ).toEqual(result);
    expect(JSON.stringify(result)).not.toContain("Private memo");
    expect(
      runChecks({
        ...input,
        bank: {
          ...bank,
          rows: bank.rows.map((row) => ({ ...row, sourceRow: row.sourceRow + 10 })),
        },
      }).findings.map((f) => f.id),
    ).toEqual(result.findings.map((f) => f.id));
  });
  it("handles empty input, future rows, leap days and invalid run dates", () => {
    expect(runChecks({ bank: bankFile(), books: booksFile(), today, closes: [] }).findings).toEqual(
      [],
    );
    expect(check("unmatched_bank_line", bankFile([`${day(-1)},10,Test,R1`]))).toEqual([]);
    expect(
      runChecks({
        bank: bankFile(["2024-02-29,10,Test,R1"]),
        books: booksFile(),
        today: "2024-03-02",
      }).findings[0].level,
    ).toBe("info");
    expect(() => runChecks({ bank: bankFile(), books: booksFile(), today: "bad" })).toThrow();
    expect(() =>
      runChecks({ bank: bankFile(), books: booksFile(), today, closes: ["bad"] }),
    ).toThrow();
  });
});
