import { describe, expect, it } from "vitest";
import type { EntitlementId } from "./conflict-rules";
import { detectAssignments, type RoleAssignment } from "./detect";
import { calculatePowerIndex } from "./power-index";

const seat = (personId: string, role: string, entitlements: EntitlementId[]): RoleAssignment => ({
  personId,
  personName: personId,
  role,
  entitlements,
});

describe("calculatePowerIndex", () => {
  it("does not count a sole owner's signing, approving and reconciling as concentration", () => {
    const index = calculatePowerIndex([
      seat("owner", "Owner / Dentist", [
        "sign_checks",
        "approve_payroll",
        "approve_vendor",
        "approve_writeoffs",
        "bank_reconcile",
      ]),
      seat("manager", "Office Manager", [
        "collect_cash",
        "post_payments",
        "prepare_deposit",
        "enter_invoices",
        "release_payment",
        "enter_payroll",
        "post_adjustments",
      ]),
    ]);
    expect(index[0].personId).toBe("manager");
    const owner = index.find((p) => p.personId === "owner")!;
    expect(owner.authorityIndex).toBeLessThan(index[0].authorityIndex);
    expect(owner.riskWeight).toBe(0);
  });

  it("counts the same duties in full for one of two partners", () => {
    const index = calculatePowerIndex([
      seat("a", "Partner", ["sign_checks", "bank_reconcile"]),
      seat("b", "Partner", ["approve_payroll"]),
    ]);
    expect(index.find((p) => p.personId === "a")!.riskWeight).toBeGreaterThan(0);
  });

  it("treats a nonprofit's chief executive as no owner, as the duty-conflict screen does", () => {
    const team = [
      seat("pat", "President & CEO", [
        "sign_checks",
        "bank_reconcile",
        "approve_invoices",
        "approve_payroll",
        "approve_vendor",
      ]),
      seat("bo", "Bookkeeper", ["enter_invoices", "post_payments"]),
    ];
    const index = calculatePowerIndex(team, "nonprofit");
    const pat = index.find((p) => p.personId === "pat")!;
    expect(pat.riskWeight).toBeGreaterThan(0);
    expect(pat.conflictCount).toBe(
      detectAssignments({ assignments: team, industry: "nonprofit" }).conflicts.filter(
        (c) => c.personId === "pat",
      ).length,
    );
    expect(pat.conflictCount).toBeGreaterThan(0);
    expect(index[0].personId).toBe("pat");
  });

  it("ranks two people who both show 100 by the full value, not by name", () => {
    const heavy: EntitlementId[] = [
      "collect_cash",
      "post_payments",
      "prepare_deposit",
      "enter_invoices",
      "release_payment",
      "enter_payroll",
      "post_adjustments",
      "create_vendor",
      "bank_reconcile",
      "issue_refunds",
    ];
    const index = calculatePowerIndex([
      seat("Aaron", "Clerk", heavy.slice(0, 8)),
      seat("Zoe", "Manager", heavy),
    ]);
    expect(index.map((p) => p.authorityIndex)).toEqual([100, 100]);
    expect(index[0].personId).toBe("Zoe");
  });
});
