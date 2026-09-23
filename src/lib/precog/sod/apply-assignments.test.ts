import { describe, expect, it } from "vitest";
import type { Person } from "../types";
import { applyAssignmentsToPeople } from "./apply-assignments";
import type { EntitlementId } from "./conflict-rules";
import type { RoleAssignment } from "./detect";

const people: Person[] = [
  { id: "p1", name: "Ana", role: "Owner", active: true, tenureYears: 9 },
  { id: "p2", name: "Ben", role: "Bookkeeper", active: true, entitlements: ["bank_reconcile"] },
  { id: "p3", name: "Cal", role: "Clerk", active: false, entitlements: ["collect_cash"] },
  { id: "sim-1", name: "Proposed hire", role: "Receptionist", active: true, entitlements: [] },
];

const assignment = (
  personId: string,
  entitlements: EntitlementId[],
  extra: Partial<RoleAssignment> = {},
): RoleAssignment => ({
  personId,
  personName: extra.personName ?? "",
  role: extra.role ?? "",
  entitlements,
});

describe("applyAssignmentsToPeople", () => {
  it("writes duties onto matching people and keeps their other fields", () => {
    const next = applyAssignmentsToPeople(people, [
      assignment("p1", ["approve_payroll"], { personName: "Ana", role: "Owner" }),
      assignment("p2", ["bank_reconcile", "post_payments"], {
        personName: "Ben",
        role: "Bookkeeper",
      }),
      assignment("sim-1", ["collect_cash"], { personName: "Proposed hire", role: "Receptionist" }),
    ]);
    expect(next.find((p) => p.id === "p1")).toMatchObject({
      tenureYears: 9,
      entitlements: ["approve_payroll"],
    });
    expect(next.find((p) => p.id === "p2")?.entitlements).toEqual([
      "bank_reconcile",
      "post_payments",
    ]);
  });

  it("keeps a real person with no assignment, drops a simulated one, and adds unknown ids", () => {
    const next = applyAssignmentsToPeople(people, [
      assignment("p1", ["approve_payroll"], { personName: "Ana", role: "Owner" }),
      assignment("sim-2", ["enter_payroll"], { personName: "New payroll clerk", role: "Payroll" }),
    ]);
    expect(next.map((p) => p.id)).toEqual(["p1", "p2", "p3", "sim-2"]);
    expect(next.find((p) => p.id === "p2")?.entitlements).toEqual(["bank_reconcile"]);
    expect(next.find((p) => p.id === "sim-2")).toMatchObject({
      active: true,
      role: "Payroll",
      entitlements: ["enter_payroll"],
    });
  });

  it("leaves people who have left untouched", () => {
    const next = applyAssignmentsToPeople(people, []);
    expect(next.find((p) => p.id === "p3")).toEqual(people[2]);
  });

  it("falls back to the existing name and role when an assignment's are blank", () => {
    const next = applyAssignmentsToPeople(people, [assignment("p1", ["approve_payroll"])]);
    expect(next[0]).toMatchObject({ name: "Ana", role: "Owner" });
  });
});

describe("duties guessed from a job title", () => {
  const guessed: Person[] = [
    {
      id: "own-1",
      name: "Ben",
      role: "Bookkeeper",
      active: true,
      entitlements: ["bank_reconcile", "post_payments", "view_reports_only"],
      dutiesFromTitle: true,
    },
  ];

  it("stay marked when the power map writes the same duties back", () => {
    const [ben] = applyAssignmentsToPeople(guessed, [
      assignment("own-1", ["post_payments", "bank_reconcile"], { personName: "Ben" }),
    ]);
    expect(ben.dutiesFromTitle).toBe(true);
  });

  it("stop being marked once the owner unticks one on the power map", () => {
    const [ben] = applyAssignmentsToPeople(guessed, [
      assignment("own-1", ["post_payments"], { personName: "Ben" }),
    ]);
    expect(ben).not.toHaveProperty("dutiesFromTitle");
    expect(ben.entitlements).toEqual(["post_payments"]);
  });
});
