import { describe, expect, it } from "vitest";
import {
  advanceEngagement,
  isOwnTeam,
  mapIsComplete,
  pilotMetrics,
  pilotMetricsCsv,
  type PilotMetrics,
} from "./engagement";
import type { Person } from "../types";

const people: Person[] = [
  { id: "a", name: "Ada", role: "Owner", active: true, entitlements: ["approve_payroll"] },
  { id: "b", name: "Ben", role: "Bookkeeper", active: true, entitlements: ["enter_invoices"] },
];

const none: ReadonlyMap<string, number> = new Map();

describe("pilot engagement", () => {
  it("treats two people with duties as a complete map", () => {
    expect(mapIsComplete(people)).toBe(true);
    expect(mapIsComplete([{ ...people[0] }])).toBe(false);
    expect(mapIsComplete(null)).toBe(false);
  });

  it("stamps start and completion once, and leaves an existing stamp", () => {
    const first = advanceEngagement(undefined, {
      now: "2026-09-01T00:00:00.000Z",
      people: [people[0]],
      ownTeam: true,
    });
    expect(first?.startedAt).toBe("2026-09-01T00:00:00.000Z");
    expect(first?.mapCompletedAt).toBeUndefined();
    const done = advanceEngagement(first, {
      now: "2026-09-01T06:00:00.000Z",
      people,
      ownTeam: true,
    });
    expect(done?.mapCompletedAt).toBe("2026-09-01T06:00:00.000Z");
    const again = advanceEngagement(done, {
      now: "2026-09-02T00:00:00.000Z",
      people,
      ownTeam: true,
    });
    expect(again).toBe(done);
  });

  it("does not stamp a start after the map is already complete", () => {
    const stamp = advanceEngagement(undefined, {
      now: "2026-09-04T00:00:00.000Z",
      people,
      ownTeam: true,
    });
    expect(stamp?.startedAt).toBeUndefined();
    expect(stamp?.mapCompletedAt).toBe("2026-09-04T00:00:00.000Z");
    expect(
      pilotMetrics({
        engagement: stamp,
        conflicts: [],
        partialCoverage: none,
        decisions: [],
        industry: "general",
      }).hoursToMap,
    ).toBeNull();
  });

  it("counts answered findings against every finding and hours to the map", () => {
    const conflict = (ruleId: string, linkedControlId?: string) => ({
      ruleId,
      linkedControlId,
      ownerHeld: false,
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
      partialCoverage: none,
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
        {
          ruleId: "r1",
          ownerHeld: false,
          residualRiskAccepted: false,
          dualReleaseMitigated: false,
        },
        { ruleId: "r2", ownerHeld: false, residualRiskAccepted: false, dualReleaseMitigated: true },
      ],
      partialCoverage: none,
      decisions: [{ kind: "accept_residual", linkedId: "r1" }],
      industry: "general",
    });
    expect(metrics.openFindings).toBe(0);
    expect(metrics.acceptanceRate).toBe(1);
  });

  it("does not follow a decision linked under another industry", () => {
    const metrics = pilotMetrics({
      conflicts: [
        {
          ruleId: "r1",
          ownerHeld: false,
          residualRiskAccepted: false,
          dualReleaseMitigated: false,
        },
      ],
      partialCoverage: none,
      decisions: [{ kind: "monitor", linkedId: "r1", linkedIndustry: "dental" }],
      industry: "general",
    });
    expect(metrics.openFindings).toBe(1);
    expect(metrics.acceptanceRate).toBe(0);
  });

  it("leaves the owner's own pairs out, as Start here and the report do", () => {
    const owners = [1, 2, 3].map((n) => ({
      ruleId: `r${n}`,
      ownerHeld: true,
      residualRiskAccepted: false,
      dualReleaseMitigated: false,
    }));
    const metrics = pilotMetrics({
      conflicts: owners,
      partialCoverage: none,
      decisions: [],
      industry: "general",
    });
    expect(metrics.openFindings).toBe(0);
    expect(metrics.acceptedFindings).toBe(0);
    expect(metrics.acceptanceRate).toBeNull();
  });

  it("counts a pair dual release covers only above a threshold as open until a decision answers it", () => {
    const narrowed = {
      ruleId: "rule-writeoff",
      ownerHeld: false,
      residualRiskAccepted: false,
      dualReleaseMitigated: true,
    };
    const partialCoverage = new Map([["rule-writeoff", 150]]);
    const unanswered = pilotMetrics({
      conflicts: [narrowed],
      partialCoverage,
      decisions: [],
      industry: "general",
    });
    expect(unanswered.openFindings).toBe(1);
    expect(unanswered.acceptanceRate).toBe(0);
    const answered = pilotMetrics({
      conflicts: [narrowed],
      partialCoverage,
      decisions: [{ kind: "monitor", linkedId: "rule-writeoff" }],
      industry: "general",
    });
    expect(answered.openFindings).toBe(0);
    expect(answered.acceptanceRate).toBe(1);
  });

  it("does not treat a sample practice name as the owner's team", () => {
    expect(isOwnTeam({ practiceName: "Ridgeview Family Dental", customPeople: people })).toBe(
      false,
    );
    expect(isOwnTeam({ practiceName: "Own Plumbing", customPeople: people })).toBe(true);
  });
});

describe("pilot metrics CSV", () => {
  const metrics: PilotMetrics = {
    startedAt: "2026-09-01T00:00:00.000Z",
    mapCompletedAt: "2026-09-01T05:00:00.000Z",
    hoursToMap: 5,
    reportSent: true,
    reportSentAt: "2026-09-03T00:00:00.000Z",
    openFindings: 1,
    acceptedFindings: 1,
    acceptanceRate: 0.5,
  };

  it("guards a business name that a spreadsheet would run as a formula", () => {
    const [business] = pilotMetricsCsv('=HYPERLINK("x")', metrics).split("\n");
    expect(business).toBe(`business,"'=HYPERLINK(""x"")"`);
  });

  it("writes a plain business name and the metrics as before", () => {
    expect(pilotMetricsCsv("Ruiz Dental", metrics)).toBe(
      [
        "business,Ruiz Dental",
        "startedAt,2026-09-01T00:00:00.000Z",
        "mapCompletedAt,2026-09-01T05:00:00.000Z",
        "hoursToMap,5",
        "reportSent,yes",
        "reportSentAt,2026-09-03T00:00:00.000Z",
        "openFindings,1",
        "acceptedFindings,1",
        "acceptanceRate,0.500",
      ].join("\n"),
    );
  });
});
