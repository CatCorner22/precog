import { describe, expect, it } from "vitest";
import { computeMapHealth, integrityHint, validateProcessMap } from "./process-graph";
import type { Person, ProcessNode } from "./types";

const people: Person[] = [
  { id: "a", name: "Ana", role: "Owner", active: true },
  { id: "d", name: "Dee", role: "Former staff", active: false, lastDay: "2025-01-31" },
];

function proc(id: string, owners: string[]): ProcessNode {
  return {
    id,
    name: id,
    layer: "process",
    description: "",
    dependencies: [],
    controlIds: [],
    ownerPersonIds: owners,
  };
}

describe("validateProcessMap owners", () => {
  it("distinguishes no owner, unknown owner, and owners who have all left", () => {
    const issues = validateProcessMap(
      [proc("none", []), proc("ghost", ["zz"]), proc("left", ["d"]), proc("mixed", ["d", "a"])],
      people,
      new Set(),
    );
    const ids = issues.map((i) => i.id);
    expect(ids).toContain("owner-none");
    expect(ids).toContain("owner-ref-ghost-zz");
    expect(ids).toContain("owner-left-left");
    expect(ids.filter((id) => id.startsWith("owner-") && id.endsWith("mixed"))).toEqual([]);
    expect(issues.find((i) => i.id === "owner-left-left")?.message).toContain("Dee has left");
  });
});

describe("map health Integrity hint", () => {
  it("names the unowned processes that lowered Integrity instead of saying there are no issues", () => {
    const issues = validateProcessMap(
      [proc("one", ["a"]), proc("two", []), proc("three", [])],
      people,
      new Set(),
    );
    const integrity = computeMapHealth([], issues).dimensions.find((d) => d.id === "integrity")!;
    expect(integrity.score).toBeLessThan(100);
    expect(integrity.hint).toBe("Lowered by 2 processes without an owner");
  });

  it("lists every kind of issue that cost points", () => {
    const issues = validateProcessMap(
      [{ ...proc("one", ["zz"]), controlIds: ["missing"] }, proc("two", ["d"]), proc("three", [])],
      people,
      new Set(),
    );
    expect(integrityHint(issues)).toBe(
      "Lowered by 1 broken link or cycle, 1 process without an owner, 1 process whose owner left and 1 reference to an unknown control",
    );
  });

  it("keeps the all-clear wording only when nothing cost points", () => {
    expect(integrityHint([])).toBe("No broken dependencies or cycles");
    expect(
      integrityHint([{ id: "record-x", severity: "info", message: "procedure not written" }]),
    ).toBe("No broken dependencies or cycles");
  });
});
