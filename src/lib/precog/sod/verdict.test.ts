import { getIndustryTemplate } from "../templates";
import { describe, expect, it } from "vitest";
import { teamTemplate } from "@/test/fixtures";
import { buildAssignments, detectSodConflicts } from "./detect";
import { openFindings } from "./open-findings";
import { concentrationHeadline, separatedPairs } from "./verdict";

const general = getIndustryTemplate("general");

describe("concentrationHeadline", () => {
  it("names the bookkeeper who holds most gaps and the one move that closes the most", () => {
    const tpl = teamTemplate(general, [
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
    const headline = concentrationHeadline(
      openFindings(detectSodConflicts(tpl).conflicts, new Map()),
    );
    expect(headline?.personName).toBe("Denise Holmgren");
    expect(headline?.gaps).toBe(headline?.totalGaps);
    expect(headline?.duty).toBe("bank_reconcile");
    expect(headline?.closes).toBe(3);
  });

  it("names nobody when the gaps are spread across the team", () => {
    const tpl = teamTemplate(general, [
      { name: "A", role: "Front Desk", duties: ["collect_cash", "post_payments"] },
      { name: "B", role: "AP Clerk", duties: ["enter_invoices", "release_payment"] },
      { name: "C", role: "Payroll", duties: ["enter_payroll", "approve_payroll"] },
    ]);
    expect(
      concentrationHeadline(openFindings(detectSodConflicts(tpl).conflicts, new Map())),
    ).toBeNull();
  });
});

describe("separatedPairs", () => {
  it("lists the rules whose two duties sit with different people", () => {
    const tpl = teamTemplate(general, [
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

describe("separatedPairs reads pairs the way the detector does", () => {
  it("does not call check signing and reconciliation kept apart when one person holds both under a covering finding", () => {
    const tpl = teamTemplate(general, [
      { name: "Ana", role: "Owner", duties: ["approve_payroll"] },
      {
        name: "Cy",
        role: "Controller",
        duties: ["release_payment", "sign_checks", "bank_reconcile"],
      },
    ]);
    const report = detectSodConflicts(tpl);
    expect(report.conflicts.map((c) => c.ruleId)).toEqual(["rule-release-rec"]);
    const ids = separatedPairs(report.conflicts, buildAssignments(tpl)).map((p) => p.ruleId);
    expect(ids).not.toContain("rule-sign-rec");
  });

  it("lists payment release and reconciliation as kept apart when payments go out by ACH", () => {
    const tpl = teamTemplate(general, [
      { name: "Ana", role: "Owner", duties: ["bank_reconcile"] },
      { name: "Bo", role: "AP Clerk", duties: ["initiate_ach"] },
    ]);
    const report = detectSodConflicts(tpl);
    const ids = separatedPairs(report.conflicts, buildAssignments(tpl)).map((p) => p.ruleId);
    expect(ids).toContain("rule-release-rec");
  });
});
