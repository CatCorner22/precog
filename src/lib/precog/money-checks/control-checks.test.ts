import { describe, expect, it } from "vitest";
import { getIndustryTemplate } from "../templates";
import { teamTemplate } from "@/test/fixtures";
import { defaultDualReleasePolicy, type ThresholdException } from "../controls/dual-release-policy";
import { detectSodConflicts } from "../sod/detect";
import { coverageReport } from "../continuity/coverage";
import { portfolioSummary } from "../scoring/residual-engine";
import { importBooksCsv } from "./import";
import { runControlChecks } from "./control-checks";

const today = "2026-11-19";
const template = teamTemplate(getIndustryTemplate("dental"), [
  {
    name: "First Signer",
    role: "Clerk",
    duties: [
      "initiate_ach",
      "approve_payroll",
      "enter_payroll",
      "approve_writeoffs",
      "sign_checks",
    ],
  },
  { name: "Second Signer", role: "Owner", duties: ["release_payment"] },
]);
const policy = {
  ...defaultDualReleasePolicy(
    template,
    { ...template.staffComposition, dualControlPayments: true },
    new Date("2026-11-19T00:00:00Z"),
  ),
  exceptions: [],
};
policy.rules = policy.rules.map((r) => ({ ...r, enabled: true, thresholdUsd: 10 }));
const books = (
  amount = "10.01",
  approved = "",
  type = "payment_out",
  channel = "",
  entered = "First Signer",
) =>
  importBooksCsv(
    `Effective date,Amount,Type,Entered by,Approved by,Method,Account,Reference\n2026-11-01,${amount},${type},${entered},${approved},${channel},Supplier,R1`,
  );
const run = (file = books(), overrides: Partial<Parameters<typeof runControlChecks>[0]> = {}) =>
  runControlChecks({ books: file, template, policy, today, ...overrides });
const payments = (result: ReturnType<typeof run>) =>
  result.findings.filter((f) => f.check === "money_out_without_second");
const exception = (extra: Partial<ThresholdException> = {}): ThresholdException => ({
  id: "E1",
  label: "Test exception",
  enabled: true,
  channels: ["ach"],
  action: "waive_dual",
  reason: "Test policy",
  createdAt: "2026-01-01",
  ...extra,
});

describe("money controls checks 6 and 7", () => {
  it.each([
    ["9.99", 0],
    ["10", 0],
    ["10.01", 1],
  ] as const)("uses the strict threshold at %s dollars", (amount, count) => {
    expect(payments(run(books(amount)))).toHaveLength(count);
  });
  it("normalizes names, flags self approval, and accepts a distinct known approval", () => {
    expect(payments(run(books("10.01", " fIrSt   sIgNeR ")))[0].level).toBe("review");
    expect(payments(run(books("10.01", "Second Signer")))).toEqual([]);
    expect(payments(run(books("10.01", "", "payment_out", "", " FIRST signer ")))).toHaveLength(1);
  });
  it.each(["entered_by", "approved_by"] as const)(
    "reports unknown %s without guessing",
    (column) => {
      const file =
        column === "entered_by"
          ? books("10.01", "", "payment_out", "", "Unknown")
          : books("10.01", "Unknown");
      expect(run(file).skipped).toContainEqual(
        expect.objectContaining({
          missingColumn: column,
          reason: "Unknown or ambiguous team name.",
        }),
      );
      expect(payments(run(file))).toEqual([]);
    },
  );
  it("does not resolve an ambiguous or inactive team name", () => {
    for (const people of [
      [...template.people, { ...template.people[0], id: "duplicate" }],
      template.people.map((p) => ({ ...p, active: false })),
    ]) {
      expect(run(books(), { template: { ...template, people } }).skipped[0].reason).toContain(
        "Unknown",
      );
    }
  });
  it("skips disabled policies, disabled channels and absent columns", () => {
    expect(run(books(), { policy: { ...policy, enabled: false } }).skipped[0].reason).toContain(
      "off",
    );
    expect(run(books(), { policy: { ...policy, rules: [] } }).skipped[0].reason).toContain("off");
    expect(
      run(importBooksCsv("Date,Amount,Type\n2026-11-01,20,payment_out")).skipped.map(
        (s) => s.missingColumn,
      ),
    ).toEqual(["entered_by", "approved_by"]);
  });
  it("imports channel aliases and applies the documented type fallback", () => {
    for (const [type, channel] of [
      ["payment_out", "ach"],
      ["refund", "ach"],
      ["write_off", "writeoff"],
      ["payroll", "payroll"],
    ]) {
      const file = importBooksCsv(
        `Date,Amount,Type,Entered by,Approved by\n2026-11-01,10.01,${type},First Signer,`,
      );
      expect(file.optionalColumns).not.toContain("channel");
      expect(payments(run(file))[0].sentence).toContain(`A ${channel} entry`);
    }
    for (const alias of ["Channel", "Method", "Payment method"]) {
      const file = importBooksCsv(
        `Date,Amount,Type,Entered by,Approved by,${alias}\n2026-11-01,20,payment_out,First Signer,,check`,
      );
      expect(file.optionalColumns).toContain("channel");
      expect(payments(run(file))[0].sentence).toContain("A check entry");
    }
    expect(run(books("20", "", "refund", "unknown")).skipped[0].missingColumn).toBe("channel");
  });
  it("honors scoped, dated and amount-band exceptions as of the entry's effective date", () => {
    const ex = exception({
      personId: "t1",
      payeeContains: "supplier",
      effectiveFrom: "2026-11-01",
      effectiveTo: "2026-11-01",
      amountMinUsd: 10.01,
      amountMaxUsd: 10.01,
    });
    expect(payments(run(books(), { policy: { ...policy, exceptions: [ex] } }))).toEqual([]);
    expect(
      payments(
        run(books(), { policy: { ...policy, exceptions: [{ ...ex, effectiveTo: "2026-10-31" }] } }),
      ),
    ).toHaveLength(1);
    expect(
      payments(
        run(books(), {
          policy: {
            ...policy,
            exceptions: [exception({ action: "raise_threshold", thresholdUsd: 20 })],
          },
        }),
      ),
    ).toEqual([]);
    expect(
      payments(
        run(books("5"), {
          policy: { ...policy, exceptions: [exception({ action: "force_dual" })] },
        }),
      ),
    ).toHaveLength(1);
    expect(
      payments(
        run(books("5"), {
          policy: {
            ...policy,
            exceptions: [exception({ action: "lower_threshold", thresholdUsd: 4.99 })],
          },
        }),
      ),
    ).toHaveLength(1);
  });
  it("does not silently lose a cent at the dollar-number boundary", () => {
    expect(run(books("90071992547409.91")).skipped).toContainEqual(
      expect.objectContaining({ missingColumn: "amount" }),
    );
  });
  it("counts distinct active duty holders using the shared assignment resolver", () => {
    const holders = (tpl = template) =>
      run(books(), { template: tpl }).findings.filter((f) => f.check === "sole_money_duty_holder");
    expect(holders().some((f) => f.id.endsWith(":initiate_ach"))).toBe(true);
    const two = {
      ...template,
      people: template.people.map((p) => ({
        ...p,
        entitlements: [...p.entitlements!, "initiate_ach"],
      })),
    };
    expect(holders(two).some((f) => f.id.endsWith(":initiate_ach"))).toBe(false);
    expect(
      holders({ ...two, people: two.people.map((p, i) => ({ ...p, active: i === 0 })) }).some((f) =>
        f.id.endsWith(":initiate_ach"),
      ),
    ).toBe(true);
  });
  it("is deterministic and leaves SoD, HardGate, residual score and Coverage unchanged", () => {
    const before = {
      sod: detectSodConflicts(template),
      score: portfolioSummary(template),
      coverage: coverageReport(template),
    };
    const original = structuredClone(template);
    const result = run();
    expect(
      run(books(), { template: { ...template, people: [...template.people].reverse() } }),
    ).toEqual(result);
    expect(template).toEqual(original);
    expect({
      sod: detectSodConflicts(template),
      score: portfolioSummary(template),
      coverage: coverageReport(template),
    }).toEqual(before);
  });
  it("handles empty books, future entries and invalid today", () => {
    expect(payments(run(importBooksCsv("Date,Amount,Type,Entered by,Approved by")))).toEqual([]);
    expect(payments(run(books(), { today: "2026-10-31" }))).toEqual([]);
    expect(() => run(books(), { today: "bad" })).toThrow();
  });
  it("keeps payment IDs and ordering stable when source rows are shuffled or renumbered", () => {
    const file = books();
    file.rows.push({ ...file.rows[0], reference: "R2", sourceRow: 2 });
    const first = run(file);
    expect(run({ ...file, rows: [...file.rows].reverse() })).toEqual(first);
    expect(
      run({
        ...file,
        rows: file.rows.map((r) => ({ ...r, sourceRow: r.sourceRow + 10 })),
      }).findings.map((f) => f.id),
    ).toEqual(first.findings.map((f) => f.id));
  });
});
