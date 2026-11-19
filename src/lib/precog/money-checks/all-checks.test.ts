import { describe, expect, it } from "vitest";
import { getIndustryTemplate } from "../templates";
import { defaultDualReleasePolicy } from "../controls/dual-release-policy";
import { shiftDay } from "../dates";
import type { DecisionEntry } from "../practice-profile";
import { importBankCsv, importBooksCsv } from "./import";
import { runChecks } from "./detect";
import { runAllChecks, type AllChecksInput, type ReconciliationSignoff } from "./all-checks";

const today = "2026-11-19";
const template = getIndustryTemplate("dental");
const policy = defaultDualReleasePolicy(
  template,
  template.staffComposition,
  new Date("2026-11-19T00:00:00Z"),
);
const good = (month: string): ReconciliationSignoff => ({
  month,
  preparedBy: "p1",
  signedBy: "p2",
  signedOn: shiftDay(`${month}-01`, 35),
});
const input: AllChecksInput = {
  today,
  template,
  policy,
  decisions: [],
  signoffs: [good("2026-10"), good("2026-09"), good("2026-08")],
  bank: importBankCsv("Date,Amount,Description\n2026-11-01,12,Test"),
  books: importBooksCsv("Date,Amount,Type,Entered by,Approved by\n2026-11-02,10,deposit,Unknown,"),
};
const decision = (age: number, extra: Partial<DecisionEntry> = {}): DecisionEntry => ({
  id: `decision-${age}`,
  createdAt: "2026-01-01",
  subject: "Private decision subject",
  kind: "monitor",
  note: "Private note",
  reviewBy: shiftDay(today, -age),
  ...extra,
});
const findings = (key: string, extra: Partial<AllChecksInput> = {}) =>
  runAllChecks({ ...input, ...extra }).findings.filter((f) => f.check === key);

describe("all nine money checks", () => {
  it.each([
    [0, null],
    [1, "watch"],
    [30, "watch"],
    [31, "review"],
  ] as const)("grades decisions overdue by %i days", (age, level) => {
    const result = findings("decision_overdue", { decisions: [decision(age)] });
    expect(result.map((f) => f.level)).toEqual(level ? [level] : []);
  });
  it("uses the shared open-decision and disposition rules without copying private text", () => {
    expect(
      findings("decision_overdue", {
        decisions: [
          decision(31, { status: "closed" }),
          decision(31, { reviewBy: undefined }),
          decision(-1),
          decision(31, { disposition: { verdict: "not_valid", reason: "other", at: today } }),
        ],
      }),
    ).toEqual([]);
    const result = findings("decision_overdue", { decisions: [decision(31, { status: "open" })] });
    expect(result).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain("Private");
  });
  it.each([29, 30, 31])("checks reconciliation signing lag %i", (lag) => {
    const signoffs = input.signoffs.map((s) =>
      s.month === "2026-09" ? { ...s, signedOn: shiftDay("2026-09-30", lag) } : s,
    );
    expect(findings("weak_reconciliation", { signoffs }).map((f) => f.level)).toEqual(
      lag > 30 ? ["watch"] : [],
    );
  });
  it("flags missing, unsigned and same-hands months", () => {
    for (const bad of [
      undefined,
      { ...good("2026-10"), signedBy: "" },
      { ...good("2026-10"), signedOn: "" },
      { ...good("2026-10"), signedBy: "p1" },
    ]) {
      const signoffs = input.signoffs.filter((s) => s.month !== "2026-10");
      if (bad) signoffs.push(bad);
      expect(findings("weak_reconciliation", { signoffs }).map((f) => f.level)).toEqual(["watch"]);
    }
  });
  it("elevates consecutive weak months but not separated weak months", () => {
    expect(
      findings("weak_reconciliation", { signoffs: [good("2026-08")] }).map((f) => f.level),
    ).toEqual(["review", "review"]);
    expect(
      findings("weak_reconciliation", { signoffs: [good("2026-09")] }).map((f) => f.level),
    ).toEqual(["watch", "watch"]);
    expect(findings("weak_reconciliation", { signoffs: [] }).map((f) => f.level)).toEqual([
      "review",
      "review",
      "review",
    ]);
  });
  it("uses the last three closed months, including year and leap boundaries", () => {
    for (const [date, expected] of [
      ["2026-01-01", ["2025-10-31", "2025-11-30", "2025-12-31"]],
      ["2024-03-01", ["2023-12-31", "2024-01-31", "2024-02-29"]],
    ]) {
      expect(
        findings("weak_reconciliation", { today: date as string, signoffs: [] }).map(
          (f) => f.dates.effective,
        ),
      ).toEqual(expected);
    }
    expect(
      findings("weak_reconciliation", {
        signoffs: [...input.signoffs, good("2026-11"), good("2026-07")],
      }),
    ).toEqual([]);
  });
  it.each([-1, 0])("checks a sign-off %i days from month-end", (lag) => {
    const signoffs = input.signoffs.map((s) =>
      s.month === "2026-10" ? { ...s, signedOn: shiftDay("2026-10-31", lag) } : s,
    );
    expect(findings("weak_reconciliation", { signoffs }).map((f) => f.sentence)).toEqual(
      lag < 0 ? ["The bank reconciliation for 2026-10 was signed before the month ended."] : [],
    );
  });
  it("does not accept a future sign-off as completed evidence", () => {
    const signoffs = input.signoffs.map((s) =>
      s.month === "2026-10" ? { ...s, signedOn: "2026-11-20" } : s,
    );
    expect(findings("weak_reconciliation", { signoffs })).toHaveLength(1);
  });
  it("combines the original findings and skips, deterministically, without mutating inputs", () => {
    const original = structuredClone(input);
    const combined = runAllChecks(input);
    const base = runChecks(input);
    expect(combined.findings).toEqual(expect.arrayContaining(base.findings));
    expect(combined.skipped).toEqual(expect.arrayContaining(base.skipped));
    const decisions = [decision(30), decision(31)];
    const first = runAllChecks({ ...input, decisions });
    expect(
      runAllChecks({
        ...input,
        decisions: [...decisions].reverse(),
        signoffs: [...input.signoffs].reverse(),
        template: { ...template, people: [...template.people].reverse() },
        bank: { ...input.bank, rows: [...input.bank.rows].reverse() },
        books: { ...input.books, rows: [...input.books.rows].reverse() },
      }),
    ).toEqual(first);
    expect(input).toEqual(original);
  });
  it("rejects invalid dates and duplicate reconciliation months", () => {
    expect(() => runAllChecks({ ...input, today: "bad" })).toThrow();
    expect(() =>
      runAllChecks({ ...input, decisions: [decision(1, { reviewBy: "bad" })] }),
    ).toThrow();
    for (const signoffs of [
      [{ ...good("2026-10"), month: "2026-13" }],
      [{ ...good("2026-10"), signedOn: "2026-02-30" }],
      [good("2026-10"), good("2026-10")],
    ]) {
      expect(() => runAllChecks({ ...input, signoffs })).toThrow();
    }
  });
});
