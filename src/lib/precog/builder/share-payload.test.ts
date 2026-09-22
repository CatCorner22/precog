import { describe, expect, it } from "vitest";
import type { SharedMapPayload } from "./share-server";
import { redactSharePayload } from "./share-payload";

function payload(): SharedMapPayload {
  return {
    version: 1,
    businessName: "Example",
    industry: "general",
    industryLabel: "General",
    teamLabel: "team",
    generatedAt: "2025-01-01T00:00:00.000Z",
    health: {
      score: 75,
      bandLabel: "Good",
      summary: "Summary",
      dimensions: [],
      processCount: 1,
      avgHeat: 20,
      hotProcesses: 0,
    },
    processes: [
      {
        id: "p1",
        name: "Payments",
        description: "Payment process",
        stage: 1,
        heat: 20,
        owners: ["Ada", "Unknown"],
        controls: [],
        risks: [],
        dependencies: [],
        evidence: [],
      },
    ],
    people: [
      { name: "Ada", role: "Manager" },
      { name: "Bea", role: "Manager" },
    ],
    issues: [],
    actions: [],
  };
}

describe("redactSharePayload", () => {
  it("redacts people and owners deterministically without mutating the payload", () => {
    const original = payload();
    const redacted = redactSharePayload(original);

    expect(redacted.people).toEqual([
      { name: "Manager A", role: "Manager" },
      { name: "Manager B", role: "Manager" },
    ]);
    expect(redacted.processes[0]?.owners).toEqual(["Manager A", "Team member A"]);
    expect(original.people[0]?.name).toBe("Ada");
    expect(original.processes[0]?.owners).toEqual(["Ada", "Unknown"]);
  });

  it("leaves the original payload unchanged when redaction is disabled", () => {
    const original = payload();
    const copy = { ...original };
    expect(copy.people).toEqual(original.people);
    expect(copy.processes).toEqual(original.processes);
  });
});
