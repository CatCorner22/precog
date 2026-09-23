import { describe, expect, it } from "vitest";
import { getBaseTemplate } from "../active-template";
import type { IndustryTemplate } from "../templates/types";
import { buildAssignments, detectSodConflicts } from "./detect";
import { concentrationHeadline, separatedPairs } from "./verdict";

const general = getBaseTemplate("general");

function team(people: { name: string; role: string; duties: string[] }[]): IndustryTemplate {
  return {
    ...general,
    people: people.map((p, i) => ({
      id: `t${i + 1}`,
      name: p.name,
      role: p.role,
      active: true,
      entitlements: p.duties,
    })),
    relations: [],
    roleTemplates: {},
  };
}

describe("concentrationHeadline", () => {
  it("names the bookkeeper who holds most gaps and the one move that closes the most", () => {
    const tpl = team([
      { name: "Ana", role: "Owner", duties: ["approve_payroll"] },
      {
        name: "Denise Holmgren",
        role: "Finance Manager",
        duties: [
          "post_payments",
          "bank_reconcile",
          "release_payment",
          "enter_invoices",
          "post_journal_entries",
        ],
      },
      { name: "Cal", role: "Cashier", duties: ["collect_cash"] },
    ]);
    const headline = concentrationHeadline(detectSodConflicts(tpl).conflicts);
    expect(headline?.personName).toBe("Denise Holmgren");
    expect(headline?.gaps).toBe(headline?.totalGaps);
    expect(headline?.duty).toBe("bank_reconcile");
    expect(headline?.closes).toBe(3);
  });

  it("names nobody when the gaps are spread across the team", () => {
    const tpl = team([
      { name: "A", role: "Front Desk", duties: ["collect_cash", "post_payments"] },
      { name: "B", role: "AP Clerk", duties: ["enter_invoices", "release_payment"] },
      { name: "C", role: "Payroll", duties: ["enter_payroll", "approve_payroll"] },
    ]);
    expect(concentrationHeadline(detectSodConflicts(tpl).conflicts)).toBeNull();
  });
});

describe("separatedPairs", () => {
  it("lists the rules whose two duties sit with different people", () => {
    const tpl = team([
      { name: "A", role: "AP Clerk", duties: ["enter_invoices"] },
      { name: "B", role: "Owner", duties: ["release_payment", "approve_payroll"] },
      { name: "C", role: "Payroll", duties: ["enter_payroll"] },
    ]);
    const report = detectSodConflicts(tpl);
    const ids = separatedPairs(report.conflicts, buildAssignments(tpl)).map((p) => p.ruleId);
    expect(ids).toContain("rule-invoice-pay");
    expect(ids).toContain("rule-payroll");
    expect(ids).toContain("rule-payroll-release");
    // Nobody sets up suppliers, so that pair is not "kept apart"; it is not held at all.
    expect(ids).not.toContain("rule-vendor-create-pay");
  });
});
