import { describe, expect, it } from "vitest";
import type { RoleAssignment } from "./assignments";
import { detectAssignments } from "./detect";
import { createGovernanceReport } from "./governance-report";

const soloOwner: RoleAssignment[] = [
  {
    personId: "o",
    personName: "Olive",
    role: "Owner",
    entitlements: ["collect_cash", "post_payments", "bank_reconcile"],
  },
];

describe("createGovernanceReport", () => {
  it("counts only open conflicts as open, and lists the owner's own pairs apart", () => {
    const summary = detectAssignments({ assignments: soloOwner }).summary;
    expect(summary.ownerHeld).toBeGreaterThan(0);
    const report = createGovernanceReport(soloOwner, undefined, new Date("2026-09-19T00:00:00Z"));
    expect(report).toContain("- Open conflicts: **0** (0 critical, 0 high)");
    expect(report).toContain(`- Pairs the owner holds (not theft risks): **${summary.ownerHeld}**`);
    expect(report).toContain("- High-risk duties with one holder: **");
    expect(report).not.toContain("Critical single points");
  });

  it("says nobody holds a duty instead of calling for the owner", () => {
    const report = createGovernanceReport(soloOwner);
    expect(report).toContain("**Nobody holds:**");
    expect(report).not.toMatch(
      /Owner required|Recommended fallback|People \/ modeled jobs|Planning analysis only/,
    );
    expect(report).not.toMatch(/library below/);
  });

  it("matches the open count to the detector's own severity counts", () => {
    const team: RoleAssignment[] = [
      ...soloOwner,
      {
        personId: "b",
        personName: "Bo",
        role: "Bookkeeper",
        entitlements: ["create_vendor", "release_payment", "enter_payroll", "approve_payroll"],
      },
    ];
    const { summary } = detectAssignments({ assignments: team });
    const open = summary.critical + summary.high + summary.medium + summary.family;
    expect(open).toBeGreaterThan(0);
    expect(createGovernanceReport(team)).toContain(`- Open conflicts: **${open}**`);
  });
});
