import { describe, expect, it } from "vitest";
import { monthlyReviewTasks } from "./reviews";
import type { Person } from "../types";

const person = (id: string, entitlements: string[], owner = false): Person => ({
  id,
  name: id,
  role: owner ? "Owner" : "Bookkeeper",
  active: true,
  owner,
  entitlements,
});
const task = (people: Person[], key = "payroll_headcount") =>
  monthlyReviewTasks("2026-09-29", people).find((t) => t.key === key)!;

describe("reviewer independence follows work, not ownership", () => {
  it("does not label the owner who prepared payroll as independent", () => {
    const result = task([person("Owner", ["enter_payroll"], true)]);
    expect(result.reviewerHoldsDuty).toBe(true);
    expect(result.reviewerIndependence).toBe("self_review");
  });
  it("prefers a recorded non-conflicting reviewer over the sole owner", () => {
    const result = task([
      person("Owner", ["enter_payroll"], true),
      person("Reviewer", ["view_reports_only"]),
    ]);
    expect(result.suggestedOwner).toBe("Reviewer");
    expect(result.reviewerIndependence).toBe("separate_duties");
  });
  it("counts payroll master changes as preparing the work under review", () => {
    expect(task([person("Owner", ["edit_payroll_master"], true)]).reviewerHoldsDuty).toBe(true);
  });
  it("does not suggest a departed reviewer", () => {
    const result = task([
      person("Owner", ["enter_payroll"], true),
      { ...person("Reviewer", ["view_reports_only"]), active: false },
    ]);
    expect(result.suggestedOwner).toBe("Owner");
    expect(result.reviewerHoldsDuty).toBe(true);
  });
  it("keeps title-derived duties provisional", () => {
    const result = task([{ ...person("Reviewer", ["view_reports_only"]), dutiesFromTitle: true }]);
    expect(result.reviewerIndependence).toBe("not_established");
  });
  it("does not invent an independent owner for an empty team", () => {
    const result = task([]);
    expect(result.reviewerIndependence).toBe("not_established");
    expect(result.suggestedOwner).toBe("Reviewer not assigned");
  });
  it("does not treat a reconciler who releases ACH payments as independent", () => {
    expect(
      task([person("Owner", ["bank_reconcile", "initiate_ach"], true)], "bank_statement")
        .reviewerHoldsDuty,
    ).toBe(true);
  });
});
