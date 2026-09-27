import { getIndustryTemplate } from "../templates";
import { describe, expect, it } from "vitest";
import type { RoleAssignment } from "./assignments";
import { buildAssignments, detectAssignments } from "./detect";
import { applyResolutionPlan, buildResolutionPlans } from "./resolution-planner";

function person(personId: string, role: string, entitlements: string[]): RoleAssignment {
  return { personId, personName: personId, role, entitlements } as RoleAssignment;
}

/** Every plan offered, checked against whole-team scans before and after applying it. */
function checkPlans(assignments: RoleAssignment[]) {
  const before = detectAssignments({ assignments }).conflicts;
  const beforeIds = new Set(before.map((c) => c.id));
  let checked = 0;
  for (const conflict of before) {
    for (const plan of buildResolutionPlans(assignments, conflict)) {
      const after = detectAssignments({ assignments: applyResolutionPlan(assignments, plan) });
      const afterIds = new Set(after.conflicts.map((c) => c.id));
      const created = after.conflicts.filter((c) => !beforeIds.has(c.id)).length;
      const resolved = before.filter((c) => !afterIds.has(c.id)).length;
      expect(created, plan.summary).toBe(plan.conflictsCreated);
      expect(created, plan.summary).toBe(0);
      expect(resolved, plan.summary).toBe(plan.conflictsResolved);
      expect(resolved, plan.summary).toBeGreaterThan(0);
      checked += 1;
    }
  }
  return checked;
}

describe("buildResolutionPlans", () => {
  it("offers no removal that unmasks a pair another finding covered", () => {
    const team = [
      person("owner", "Owner", ["approve_payroll"]),
      person("ctrl", "Controller", ["release_payment", "sign_checks", "bank_reconcile"]),
    ];
    const [conflict] = detectAssignments({ assignments: team }).conflicts;
    expect(conflict.ruleId).toBe("rule-release-rec");
    const plans = buildResolutionPlans(team, conflict);
    // Taking release away leaves check signing + reconciliation, a new critical pair.
    expect(plans.map((p) => p.summary)).not.toContain("Remove Release payments from ctrl");
  });

  it("offers no plan that closes nothing", () => {
    const team = [
      person("clerk", "Clerk", ["enter_invoices", "release_payment", "sign_checks"]),
      person("o", "Owner", ["approve_payroll"]),
    ];
    const [conflict] = detectAssignments({ assignments: team }).conflicts;
    for (const plan of buildResolutionPlans(team, conflict)) {
      expect(plan.conflictsResolved).toBeGreaterThan(0);
    }
    checkPlans(team);
  });

  it("reports exactly what each plan does to the whole team, on every sample", () => {
    let checked = 0;
    for (const industry of ["dental", "retail", "restaurant", "general"] as const) {
      checked += checkPlans(buildAssignments(getIndustryTemplate(industry)));
    }
    expect(checked).toBeGreaterThan(0);
  });
});
