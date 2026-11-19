import { describe, expect, it } from "vitest";
import { defaultProfile } from "@/lib/precog/practice-profile";
import { getIndustryTemplate } from "@/lib/precog/templates";
import { importBankCsv, importBooksCsv, MAX_ROWS } from "@/lib/precog/money-checks/import";
import { withMoneyRun } from "@/lib/precog/money-checks/profile-state";
import {
  addClose,
  closedMonths,
  noteProblem,
  runScreenChecks,
  skippedReason,
} from "./money-checks.logic";

const profile = defaultProfile("dental");
const base = {
  today: "2026-11-19",
  template: getIndustryTemplate("dental"),
  policy: profile.dualRelease,
  decisions: [],
  signoffs: [],
};
describe("money-check screen logic", () => {
  it("keeps a closed-period finding open when the next run has no loaded closes", () => {
    const books = importBooksCsv(
      "date,entry_date,amount,type\n2026-10-31,2026-11-02,10,adjustment",
    );
    const input = { ...base, bank: importBankCsv("date,amount,description"), books };
    const closes = ["2026-10-31"];
    const first = runScreenChecks({ ...input, closes });
    const previous = withMoneyRun(profile, first, base.today);
    const finding = previous.moneyChecks!.ledger.find((r) => r.check === "closed_period_entry")!;
    expect(finding.status).toBe("open");
    const noCloses: string[] = [];
    const next = runScreenChecks({ ...input, closes: noCloses.length ? noCloses : undefined });
    expect(next.skipped).toContainEqual({ check: "closed_period_entry", missingColumn: "closes" });
    expect(
      withMoneyRun(previous, next, base.today).moneyChecks!.ledger.find((r) => r.id === finding.id),
    ).toEqual(finding);
  });
  it("lists exactly three closed months over year and leap-day boundaries", () => {
    expect(closedMonths("2027-01-01")).toEqual(["2026-12", "2026-11", "2026-10"]);
    expect(closedMonths("2024-03-31")).toEqual(["2024-02", "2024-01", "2023-12"]);
  });
  it("adds, sorts and deduplicates closes, rejecting empty and impossible dates", () => {
    const dates = ["2026-10-31"];
    expect(addClose(dates, "2026-09-30")).toEqual(["2026-09-30", "2026-10-31"]);
    expect(addClose(dates, "2026-10-31")).toEqual(dates);
    expect(() => addClose(dates, "")).toThrow();
    expect(() => addClose(dates, "2026-02-30")).toThrow();
    expect(dates).toEqual(["2026-10-31"]);
  });
  it("validates trimmed notes at 9/10 characters and describes skipped columns plainly", () => {
    expect(noteProblem(" 123456789 ")).toContain("10 characters");
    expect(noteProblem(" 1234567890 ")).toBe("");
    expect(noteProblem("")).toContain("10 characters");
    expect(skippedReason({ check: "backdated_entry", missingColumn: "entry_date" })).toBe(
      "The entry date column is missing.",
    );
    expect(
      skippedReason({
        check: "backdated_entry",
        missingColumn: "entry_date",
        reason: "No entry date",
        sourceRow: 2,
      }),
    ).toBe("Row 2: No entry date");
  });
  it("runs profile checks without uploads, while preserving existing file findings", () => {
    const bank = importBankCsv("date,amount,description\n2026-11-01,10,Test receipt");
    const books = importBooksCsv("date,amount,type\n2026-11-01,20,deposit");
    const first = runScreenChecks({ ...base, bank, books });
    expect(first.findings.some((f) => f.check === "unmatched_bank_line")).toBe(true);
    const previous = withMoneyRun(profile, first, base.today);
    const next = runScreenChecks({ ...base, bank: null, books: null });
    expect(next.findings.some((f) => f.check === "weak_reconciliation")).toBe(true);
    expect(next.skipped.filter((s) => s.missingColumn.includes("file"))).toHaveLength(6);
    expect(
      withMoneyRun(previous, next, base.today).moneyChecks?.ledger.find(
        (r) => r.check === "unmatched_bank_line",
      )?.status,
    ).toBe("open");
  });
  it("distinguishes a missing file from an uploaded empty file and propagates import metadata", () => {
    const bank = importBankCsv("date,amount,description");
    const books = importBooksCsv("date,amount,type");
    const result = runScreenChecks({ ...base, bank, books });
    expect(result.skipped.some((s) => s.missingColumn.includes("file"))).toBe(false);
    expect(result.skipped.some((s) => s.missingColumn === "entry_date")).toBe(true);
    expect(
      runScreenChecks({ ...base, bank: null, books }).skipped.find(
        (s) => s.check === "unmatched_bank_line",
      )?.reason,
    ).toContain("Bank file");
    expect(() => runScreenChecks({ ...base, today: "bad", bank, books })).toThrow();
    expect(
      runScreenChecks({ ...base, bank: importBankCsv("bad header"), books }).skipped.find(
        (s) => s.check === "unmatched_bank_line",
      )?.reason,
    ).toBe("The bank file had rejected rows; fix them and upload again.");
  });
  it("keeps findings open for mixed valid/rejected bank and books rows, and for truncation", () => {
    const bank = importBankCsv("date,amount,description\n2026-11-01,10,Receipt");
    const books = importBooksCsv("date,amount,type\n2026-11-01,20,deposit");
    const first = runScreenChecks({ ...base, bank, books });
    const previous = withMoneyRun(profile, first, base.today);
    const old = previous.moneyChecks!.ledger.find((r) => r.check === "unmatched_bank_line")!;
    expect(old.status).toBe("open");
    const badBank = importBankCsv(
      "date,amount,description\n2026-11-01,20,Receipt\ninvalid,10,Rejected",
    );
    const badBooks = importBooksCsv("date,amount,type\n2026-11-01,10,deposit\ninvalid,10,deposit");
    const truncatedBank = importBankCsv(
      "date,amount,description\n" +
        Array.from({ length: MAX_ROWS + 1 }, () => "2026-11-01,20,Receipt").join("\n"),
    );
    const truncatedBooks = importBooksCsv(
      "date,amount,type\n" +
        Array.from({ length: MAX_ROWS + 1 }, () => "2026-11-01,10,deposit").join("\n"),
    );
    for (const [file, bad] of [
      ["bank", badBank],
      ["books", badBooks],
      ["bank", truncatedBank],
      ["books", truncatedBooks],
    ] as const) {
      expect(bad.rows.length).toBeGreaterThan(0);
      expect(bad.issues.length).toBeGreaterThan(0);
      const next = runScreenChecks({ ...base, bank, books, [file]: bad });
      const skips = next.skipped.filter(
        (s) => s.reason === `The ${file} file had rejected rows; fix them and upload again.`,
      );
      expect(skips.map((s) => s.check)).toEqual(
        file === "bank"
          ? ["unmatched_bank_line", "deposit_not_banked"]
          : [
              "unmatched_bank_line",
              "deposit_not_banked",
              "duplicate_payment",
              "backdated_entry",
              "closed_period_entry",
              "money_out_without_second",
            ],
      );
      expect(
        withMoneyRun(previous, next, base.today).moneyChecks!.ledger.find((r) => r.id === old.id),
      ).toEqual(old);
      expect(skips.map(skippedReason)).toContain(
        `The ${file} file had rejected rows; fix them and upload again.`,
      );
    }
  });
});
