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

  it("counts only explicit acceptances as accepted, keeps them open, and hours to the map", () => {
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
      conflicts: [conflict("r1", "c1"), conflict("r2"), conflict("r3")],
      partialCoverage: none,
      decisions: [
        { kind: "remediate", linkedId: "c1" },
        { kind: "accept_residual", linkedId: "r2" },
        { kind: "accept_residual" },
      ],
      industry: "general",
    });
    expect(metrics.hoursToMap).toBe(5);
    expect(metrics.reportSent).toBe(true);
    // No decision closes a finding, an acceptance included.
    expect(metrics.openFindings).toBe(3);
    expect(metrics.acceptedFindings).toBe(1);
    expect(metrics.actedOnFindings).toBe(1);
    expect(metrics.acceptanceRate).toBeCloseTo(1 / 3, 9);
  });

  it("counts a dual-release closure and a remediate, monitor or insure decision as acted on, never accepted", () => {
    const finding = (ruleId: string, dualReleaseMitigated = false) => ({
      ruleId,
      ownerHeld: false,
      residualRiskAccepted: false,
      dualReleaseMitigated,
    });
    const metrics = pilotMetrics({
      conflicts: [finding("r1"), finding("r2", true), finding("r3"), finding("r4")],
      partialCoverage: none,
      decisions: [
        { kind: "monitor", linkedId: "r1" },
        { kind: "insure", linkedId: "r3" },
        { kind: "accept_residual", linkedId: "r4" },
        { kind: "remediate", linkedId: "r4" },
      ],
      industry: "general",
    });
    expect(metrics.openFindings).toBe(3);
    expect(metrics.actedOnFindings).toBe(3);
    expect(metrics.acceptedFindings).toBe(1);
    expect(metrics.acceptanceRate).toBe(0.25);
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
      decisions: [
        { kind: "monitor", linkedId: "r1", linkedIndustry: "dental" },
        { kind: "accept_residual", linkedId: "r1", linkedIndustry: "dental" },
      ],
      industry: "general",
    });
    expect(metrics.openFindings).toBe(1);
    expect(metrics.actedOnFindings).toBe(0);
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
    expect(metrics.actedOnFindings).toBe(0);
    expect(metrics.acceptanceRate).toBeNull();
  });

  it("counts a pair dual release covers only above a threshold as open, and acted on only once a decision answers it", () => {
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
    expect(unanswered.actedOnFindings).toBe(0);
    const answered = pilotMetrics({
      conflicts: [narrowed],
      partialCoverage,
      decisions: [{ kind: "monitor", linkedId: "rule-writeoff" }],
      industry: "general",
    });
    expect(answered.openFindings).toBe(1);
    expect(answered.actedOnFindings).toBe(1);
    expect(answered.acceptanceRate).toBe(0);
  });

  it("treats a finished business as the owner's team once people were entered, whatever the name", () => {
    expect(isOwnTeam({ practiceName: "Ridgeview Family Dental", customPeople: people })).toBe(true);
    expect(isOwnTeam({ practiceName: "Own Plumbing", customPeople: people })).toBe(true);
    expect(isOwnTeam({ practiceName: "Own Plumbing", customPeople: [] })).toBe(true);
    expect(isOwnTeam({ practiceName: "Own Plumbing", customPeople: null })).toBe(false);
    expect(isOwnTeam({ practiceName: "Own Plumbing" })).toBe(false);
  });

  it("keeps the older rule while setup is unfinished: people entered under a name of the owner's", () => {
    const unfinished = { onboardingComplete: false };
    expect(
      isOwnTeam({ ...unfinished, practiceName: "Ridgeview Family Dental", customPeople: people }),
    ).toBe(false);
    expect(isOwnTeam({ ...unfinished, practiceName: "Own Plumbing", customPeople: people })).toBe(
      true,
    );
    expect(isOwnTeam({ ...unfinished, practiceName: "Own Plumbing", customPeople: [] })).toBe(
      false,
    );
  });

  it("stamps a start for an own team whose people were emptied", () => {
    const ownTeam = isOwnTeam({ practiceName: "Own Plumbing", customPeople: [] });
    const stamp = advanceEngagement(undefined, {
      now: "2026-10-06T00:00:00.000Z",
      people: [],
      ownTeam,
    });
    expect(stamp?.startedAt).toBe("2026-10-06T00:00:00.000Z");
    expect(stamp?.mapCompletedAt).toBeUndefined();
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
    actedOnFindings: 2,
    acceptanceRate: 0.5,
    notValidFindings: 1,
    validRate: 0.75,
    notValidReasons: { duty_not_held: 0, controlled_elsewhere: 1, rule_does_not_fit: 0, other: 0 },
  };

  it("guards a business name that a spreadsheet would run as a formula", () => {
    const [business] = pilotMetricsCsv('=HYPERLINK("x")', metrics).split("\n");
    expect(business).toBe(`business,"'=HYPERLINK(""x"")"`);
  });

  it("writes a plain business name and the metrics as before, with the new columns appended", () => {
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
        "actedOnFindings,2",
        "acceptanceRate,0.500",
        "notValidFindings,1",
        "validRate,0.750",
      ].join("\n"),
    );
  });
});
