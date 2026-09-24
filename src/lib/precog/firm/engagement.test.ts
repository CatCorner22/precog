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

  it("counts accepted decisions against open conflicts and hours to the map", () => {
    const metrics = pilotMetrics({
      engagement: {
        startedAt: "2026-09-01T00:00:00.000Z",
        mapCompletedAt: "2026-09-01T05:00:00.000Z",
        reportSentAt: "2026-09-03T00:00:00.000Z",
      },
      openFindings: 2,
      decisions: [{ kind: "remediate" }, { kind: "accept_residual" }],
    });
    expect(metrics.hoursToMap).toBe(5);
    expect(metrics.reportSent).toBe(true);
    expect(metrics.acceptanceRate).toBe(0.5);
  });

  it("does not treat a sample practice name as the owner's team", () => {
    expect(isOwnTeam({ practiceName: "Ridgeview Family Dental", customPeople: people })).toBe(
      false,
    );
    expect(isOwnTeam({ practiceName: "Own Plumbing", customPeople: people })).toBe(true);
  });
});
