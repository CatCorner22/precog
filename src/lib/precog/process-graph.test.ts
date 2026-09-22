import { describe, expect, it } from "vitest";
import { validateProcessMap } from "./process-graph";
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
