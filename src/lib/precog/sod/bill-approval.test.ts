import { describe, expect, it } from "vitest";
import { detectSodConflicts, type RoleAssignment } from "./detect";
import { analyzeAbsenceImpact, analyzeDutyCoverage } from "./coverage-analysis";

/** A childcare center: the office administrator enters and pays bills; the director approves them. */
const childcare = (directorApproves: boolean): RoleAssignment[] => [
  {
    personId: "dir",
    personName: "Rosa Lin",
    role: "Center Director",
    entitlements: directorApproves ? ["approve_payroll", "approve_invoices"] : ["approve_payroll"],
  },
  {
    personId: "adm",
    personName: "Tom Beck",
    role: "Office Administrator",
    entitlements: ["enter_invoices", "release_payment", "enter_payroll"],
  },
  { personId: "own", personName: "Ana Ruiz", role: "Owner", entitlements: ["bank_reconcile"] },
];

const invoicePay = (team: RoleAssignment[]) =>
  detectSodConflicts(undefined, { assignments: team }).conflicts.find(
    (c) => c.personId === "adm" && c.ruleId === "rule-invoice-pay",
  );

describe("approving bills for payment", () => {
  it("credits the director's approval of each bill on the administrator's entry and payment", () => {
    const without = invoicePay(childcare(false))!;
    const withApproval = invoicePay(childcare(true))!;
    expect(without.controlsInPlace).toEqual([]);
    expect(withApproval.controlsInPlace).toContain("Rosa Lin approves each bill before it is paid");
    expect(withApproval.score).toBeLessThan(without.score);
    // The pair is still open: the approval narrows it, it does not remove it.
    expect(withApproval.severity).toBe("critical");
  });

  it("gives no credit when the only approver is the person who enters and pays", () => {
    const team = childcare(false).map((p) =>
      p.personId === "adm"
        ? { ...p, entitlements: [...p.entitlements, "approve_invoices" as const] }
        : p,
    );
    const conflicts = detectSodConflicts(undefined, { assignments: team }).conflicts;
    const pay = conflicts.find((c) => c.personId === "adm" && c.ruleId === "rule-invoice-pay")!;
    expect(pay.controlsInPlace).toEqual([]);
    // Entering and approving one's own bills is its own finding.
    expect(conflicts.some((c) => c.personId === "adm" && c.ruleId === "rule-invoice-approve")).toBe(
      true,
    );
  });

  it("treats the sole owner approving bills and releasing payments as oversight", () => {
    const team: RoleAssignment[] = [
      {
        personId: "own",
        personName: "Ana Ruiz",
        role: "Owner",
        entitlements: ["approve_invoices", "sign_checks", "approve_vendor"],
      },
      {
        personId: "bk",
        personName: "Lee Park",
        role: "Bookkeeper",
        entitlements: ["enter_invoices", "bank_reconcile"],
      },
    ];
    const conflicts = detectSodConflicts(undefined, { assignments: team }).conflicts;
    expect(conflicts.filter((c) => c.personId === "own")).toEqual([]);
  });
});

describe("duty backup with an optional approval step", () => {
  it("leaves bill approval out of the index when nobody holds it", () => {
    const coverage = analyzeDutyCoverage(childcare(false));
    expect(coverage.unassigned.some((d) => d.entitlementId === "approve_invoices")).toBe(false);
    expect(coverage.duties.find((d) => d.entitlementId === "approve_invoices")?.status).toBe(
      "unassigned",
    );
  });

  it("counts the approver's absence as work that stops and lowers the index", () => {
    const team = childcare(true);
    const before = analyzeDutyCoverage(team);
    expect(before.singlePoints.some((d) => d.entitlementId === "approve_invoices")).toBe(true);
    const absence = analyzeAbsenceImpact(team, "dir")!;
    expect(absence.newlyUnassigned.map((d) => d.entitlementId)).toContain("approve_invoices");
    expect(absence.scoreChange).toBeLessThan(0);
  });
});
