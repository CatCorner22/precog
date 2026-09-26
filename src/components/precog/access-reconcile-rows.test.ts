import { describe, expect, it } from "vitest";
import type { AccessReconciliation, AccessUserRow } from "@/lib/precog/firm/reconcile";
import type { RoleAssignment } from "@/lib/precog/sod/detect";
import { grantDuty, rowDifferences, withUserStatus } from "./access-reconcile-rows";

const row: AccessUserRow = {
  id: "u1",
  name: "Maya Chen",
  email: "maya@example.com",
  role: "Company admin",
  mapped: [],
  unmatchedTokens: ["company", "admin"],
  personId: "own-1",
  extra: ["release_payment", "initiate_ach"],
  missingFromBooks: ["bank_reconcile"],
  status: "pending",
};

const rec: AccessReconciliation = {
  importedAt: "2026-09-25T10:00:00Z",
  source: "quickbooks",
  users: [row, { ...row, id: "u2", name: "Ben Ode", personId: undefined }],
  vendors: [],
};

describe("withUserStatus", () => {
  it("records the mapped duty on the one row and keeps the other rows", () => {
    const next = withUserStatus(rec, "u1", "mapped", "pms_admin_roles");
    expect(next.users[0]).toMatchObject({ status: "mapped", assigned: "pms_admin_roles" });
    expect(next.users[1]).toBe(rec.users[1]);
  });

  it("forgets the duty when the row goes back to the queue", () => {
    const mapped = withUserStatus(rec, "u1", "mapped", "pms_admin_roles");
    const back = withUserStatus(mapped, "u1", "pending");
    expect(back.users[0].status).toBe("pending");
    expect("assigned" in back.users[0]).toBe(false);
  });
});

describe("grantDuty", () => {
  const assignments: RoleAssignment[] = [
    {
      personId: "own-1",
      personName: "Maya Chen",
      role: "Office manager",
      entitlements: ["post_payments"],
    },
    { personId: "own-2", personName: "Ben Ode", role: "Front desk", entitlements: [] },
  ];

  it("adds the duty to the matched person on the map", () => {
    const next = grantDuty(assignments, "own-1", "pms_admin_roles");
    expect(next?.[0].entitlements).toEqual(["post_payments", "pms_admin_roles"]);
    expect(next?.[1]).toBe(assignments[1]);
  });

  it("changes nothing for a person who already holds it or is not on the map", () => {
    expect(grantDuty(assignments, "own-1", "post_payments")).toBeNull();
    expect(grantDuty(assignments, "nobody", "post_payments")).toBeNull();
  });
});

describe("rowDifferences", () => {
  it("names duties in words, never by their ids", () => {
    const text = rowDifferences(row);
    expect(text).not.toMatch(/release_payment|initiate_ach|bank_reconcile/);
    expect(text).toContain("which the duty map does not show");
    expect(text).toContain("which this export does not show");
  });

  it("says when nobody on the team has the name", () => {
    expect(rowDifferences({ ...row, personId: undefined })).toContain(
      "No one on this team has this name.",
    );
  });
});
