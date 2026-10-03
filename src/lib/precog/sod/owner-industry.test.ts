import { describe, expect, it } from "vitest";
import {
  NONPROFIT_LEADER_ID,
  nonprofitLeaderPeople,
  nonprofitLeaderTeam,
} from "@/test/nonprofit-leader-team";
import { buildCoveragePlans, buildCoverageProgram } from "./coverage-planner";
import { detectSodConflicts } from "./detect";
import { soleOwnerId } from "./owner-role";
import { buildResolutionPlans } from "./resolution-planner";
import { dutyStandInSuggestions } from "./stand-in-suggestions";

/**
 * A nonprofit belongs to no one, so its leader is an employee whatever the
 * title says. Every engine that reads the sole owner is told the line of
 * business, so a team that never passed through setup (an older stored
 * profile, a Pioneer request) gets the same answer as one that did. The
 * same people in a line of business with an owner show what changed.
 */
describe("a nonprofit's unmarked leader", () => {
  const people = nonprofitLeaderPeople();
  const team = nonprofitLeaderTeam();

  it("is nobody's owner, where the same title would own a shop", () => {
    expect(soleOwnerId(people, "nonprofit")).toBeNull();
    expect(soleOwnerId(people, "general")).toBe(NONPROFIT_LEADER_ID);
  });

  it("has their conflict counted, not set aside as the owner's", () => {
    const report = detectSodConflicts(undefined, undefined, {
      assignments: team,
      industry: "nonprofit",
    });
    expect(report.conflicts.map((c) => [c.personId, c.ruleId, c.ownerHeld])).toEqual([
      [NONPROFIT_LEADER_ID, "rule-release-rec", false],
    ]);
    expect(report.summary.critical).toBe(1);
    expect(report.summary.ownerHeld).toBe(0);
  });

  it("is not offered as a stand-in while they hold a conflict", () => {
    // In a line of business with an owner, the leader is the owner and may
    // stand in anywhere: two plans, two steps, 22 to 27 (+5).
    const asOwner = buildCoverageProgram(team, "general");
    expect(buildCoveragePlans(team, "general").map((p) => `${p.id}:${p.continuityGain}`)).toEqual([
      "approve_payroll:np-4:2",
      "approve_expenses:np-1:2",
    ]);
    expect([asOwner.startingScore, asOwner.projectedScore, asOwner.unresolvedGaps]).toEqual([
      22, 27, 5,
    ]);
    // As a nonprofit's employee holding a conflict, they are not a stand-in:
    // one plan, one step, 22 to 24 (+2), and one more duty still on one holder.
    const asEmployee = buildCoverageProgram(team, "nonprofit");
    expect(buildCoveragePlans(team, "nonprofit").map((p) => `${p.id}:${p.continuityGain}`)).toEqual(
      ["approve_payroll:np-4:2"],
    );
    expect([
      asEmployee.startingScore,
      asEmployee.projectedScore,
      asEmployee.unresolvedGaps,
    ]).toEqual([22, 24, 6]);
  });

  it("gets the same stand-in suggestions on Who knows what", () => {
    const suggestions = dutyStandInSuggestions(team, "nonprofit");
    expect(suggestions.plans).toEqual(buildCoveragePlans(team, "nonprofit"));
    expect(suggestions.program).toEqual(buildCoverageProgram(team, "nonprofit"));
    expect(suggestions.program.projectedScore - suggestions.program.startingScore).toBe(2);
  });

  it("has their conflict resolved like any employee's", () => {
    const [conflict] = detectSodConflicts(undefined, undefined, {
      assignments: team,
      industry: "nonprofit",
    }).conflicts;
    const plans = buildResolutionPlans(team, conflict, "nonprofit");
    expect(plans.length).toBeGreaterThan(0);
    for (const plan of plans) {
      expect(plan.fromPersonId).toBe(NONPROFIT_LEADER_ID);
      expect(plan.conflictsResolved).toBeGreaterThan(0);
      expect(plan.conflictsCreated).toBe(0);
    }
    expect(plans.map((p) => p.id)).toEqual([
      "np-1:rule-release-rec:bank_reconcile:np-4",
      "np-1:rule-release-rec:release_payment:np-3",
      "np-1:rule-release-rec:bank_reconcile:remove",
      "np-1:rule-release-rec:release_payment:remove",
    ]);
  });
});
