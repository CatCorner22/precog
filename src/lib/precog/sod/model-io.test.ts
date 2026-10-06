import { describe, expect, it } from "vitest";
import {
  createPowerMapFile,
  MAX_PEOPLE_STORED,
  normalizeRoleAssignments,
  readRoleAssignments,
} from "./model-io";

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
    expect(readRoleAssignments({ hello: 1 }).problem).toBe(
      "That file is not a Precog duty assignments file.",
    );
  });

  it("keeps a stored list all or nothing", () => {
    expect(normalizeRoleAssignments([good])).toHaveLength(1);
    expect(normalizeRoleAssignments([good, { ...good, personId: "" }])).toBeUndefined();
  });

  // ST-SCALE-2: the 100-person cap on an imported file also dropped a stored
  // baseline or snapshot of a larger team.
  it("caps an imported file at 100 people and a stored list at the team a business holds", () => {
    const team = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ ...good, personId: `p${i}`, personName: `P ${i}` }));
    expect(readRoleAssignments(team(100)).assignments).toHaveLength(100);
    expect(readRoleAssignments(team(101)).problem).toBe("A map holds at most 100 people.");
    expect(normalizeRoleAssignments(team(400))).toHaveLength(400);
    expect(normalizeRoleAssignments(team(MAX_PEOPLE_STORED))).toHaveLength(MAX_PEOPLE_STORED);
    expect(normalizeRoleAssignments(team(MAX_PEOPLE_STORED + 1))).toBeUndefined();
  });
});
