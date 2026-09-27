import { describe, expect, it } from "vitest";
import { createPowerMapFile, normalizeRoleAssignments, readRoleAssignments } from "./model-io";

const good = { personId: "a", personName: "Ana", role: "Clerk", entitlements: ["collect_cash"] };

describe("readRoleAssignments", () => {
  it("imports the good rows and names each row it leaves out", () => {
    const read = readRoleAssignments({
      version: 1,
      assignments: [good, { ...good, personId: "b", personName: "" }, { ...good, personId: "a" }],
    });
    expect(read.assignments.map((a) => a.personId)).toEqual(["a"]);
    expect(read.issues).toEqual([
      { row: 2, reason: "no name" },
      { row: 3, reason: "the same person id as an earlier row (a)" },
    ]);
    expect(read.problem).toBeUndefined();
  });

  it("refuses a map saved by a newer version", () => {
    const file = { ...createPowerMapFile([good as never]), version: 2 };
    expect(readRoleAssignments(file).problem).toMatch(/newer version/);
  });

  it("names a file that is not a power map", () => {
    expect(readRoleAssignments({ hello: 1 }).problem).toBe("That file is not a Precog power map.");
  });

  it("keeps a stored list all or nothing", () => {
    expect(normalizeRoleAssignments([good])).toHaveLength(1);
    expect(normalizeRoleAssignments([good, { ...good, personId: "" }])).toBeUndefined();
  });
});
