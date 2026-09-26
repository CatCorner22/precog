import { describe, expect, it } from "vitest";
import { advanceEngagement, isOwnTeam, mapIsComplete, pilotMetrics } from "./engagement";
import type { Person } from "../types";

const people: Person[] = [
  { id: "a", name: "Ada", role: "Owner", active: true, entitlements: ["approve_payroll"] },
  { id: "b", name: "Ben", role: "Bookkeeper", active: true, entitlements: ["enter_invoices"] },
];

describe("pilot engagement", () => {
  it("treats two people with duties as a complete map", () => {
    expect(mapIsComplete(people)).toBe(true);
    expect(mapIsComplete([{ ...people[0] }])).toBe(false);
    expect(mapIsComplete(null)).toBe(false);
  });

  it("stamps start and completion once, and leaves an existing stamp", () => {
    const first = advanceEngagement(undefined, {
      now: "2026-09-01T00:00:00.000Z",
      people,
      ownTeam: true,
    });
    expect(first?.startedAt).toBe("2026-09-01T00:00:00.000Z");
    expect(first?.mapCompletedAt).toBe("2026-09-01T00:00:00.000Z");
    const again = advanceEngagement(first, {
      now: "2026-09-02T00:00:00.000Z",
      people,
      ownTeam: true,
    });
    expect(again).toBe(first);
  });

  it("counts answered findings against every finding and hours to the map", () => {
    const conflict = (ruleId: string, linkedControlId?: string) => ({
      ruleId,
      linkedControlId,
      residualRiskAccepted: false,
      dualReleaseMitigated: false,
    });
    const metrics = pilotMetrics({
      engagement: {
        startedAt: "2026-09-01T00:00:00.000Z",
        mapCompletedAt: "2026-09-01T05:00:00.000Z",
        reportSentAt: "2026-09-03T00:00:00.000Z",
      },
      conflicts: [conflict("r1", "c1"), conflict("r2")],
      decisions: [{ kind: "remediate", linkedId: "c1" }, { kind: "accept_residual" }],
      industry: "general",
    });
    expect(metrics.hoursToMap).toBe(5);
    expect(metrics.reportSent).toBe(true);
    expect(metrics.openFindings).toBe(1);
    expect(metrics.acceptedFindings).toBe(1);
    expect(metrics.acceptanceRate).toBe(0.5);
  });

  it("reaches 100% and zero open when every finding is answered", () => {
    const metrics = pilotMetrics({
      conflicts: [
        { ruleId: "r1", residualRiskAccepted: false, dualReleaseMitigated: false },
        { ruleId: "r2", residualRiskAccepted: false, dualReleaseMitigated: true },
      ],
      decisions: [{ kind: "accept_residual", linkedId: "r1" }],
      industry: "general",
    });
    expect(metrics.openFindings).toBe(0);
    expect(metrics.acceptanceRate).toBe(1);
  });

  it("does not follow a decision linked under another industry", () => {
    const metrics = pilotMetrics({
      conflicts: [{ ruleId: "r1", residualRiskAccepted: false, dualReleaseMitigated: false }],
      decisions: [{ kind: "monitor", linkedId: "r1", linkedIndustry: "dental" }],
      industry: "general",
    });
    expect(metrics.openFindings).toBe(1);
    expect(metrics.acceptanceRate).toBe(0);
  });

  it("does not treat a sample practice name as the owner's team", () => {
    expect(isOwnTeam({ practiceName: "Ridgeview Family Dental", customPeople: people })).toBe(
      false,
    );
    expect(isOwnTeam({ practiceName: "Own Plumbing", customPeople: people })).toBe(true);
  });
});
