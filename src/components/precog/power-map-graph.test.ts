import { describe, expect, it } from "vitest";
import type { DetectedConflict, RoleAssignment } from "@/lib/precog/sod/detect";
import { buildGraph, mapSlice } from "./power-map-graph";

const assignments: RoleAssignment[] = [
  {
    personId: "a",
    personName: "Ana",
    role: "Front desk",
    entitlements: ["collect_cash", "post_adjustments"],
  },
  { personId: "b", personName: "Ben", role: "Bookkeeper", entitlements: ["bank_reconcile"] },
];

const conflict = {
  id: "c1",
  personId: "a",
  entitlementA: "collect_cash",
  entitlementB: "post_adjustments",
} as DetectedConflict;

describe("mapSlice", () => {
  it("shows only people and duties in a conflict when asked", () => {
    const slice = mapSlice(assignments, [conflict], true);
    expect(slice.shownPeople.map((p) => p.personId)).toEqual(["a"]);
    expect(slice.shownDuties.map((d) => d.id).sort()).toEqual(["collect_cash", "post_adjustments"]);
    expect(slice.conflictKeys.has("a:collect_cash")).toBe(true);
  });

  it("narrows the duties to one process and never shows view-only access", () => {
    const all = mapSlice(assignments, [], false);
    expect(all.shownDuties.some((d) => d.id === "view_reports_only")).toBe(false);
    const processId = all.shownDuties[0].processIds[0];
    const one = mapSlice(assignments, [], false, processId);
    expect(one.shownDuties.length).toBeGreaterThan(0);
    expect(one.shownDuties.every((d) => d.processIds.includes(processId))).toBe(true);
  });
});

describe("buildGraph", () => {
  it("draws edges only to duties the view shows, and marks conflict edges", () => {
    const { nodes, edges } = buildGraph(assignments, [conflict], true);
    const ids = new Set(nodes.map((n) => n.id));
    expect(edges.every((e) => ids.has(e.target) && ids.has(e.source))).toBe(true);
    expect(edges.filter((e) => e.animated)).toHaveLength(2);
    expect(nodes.some((n) => n.id === "person:b")).toBe(false);
  });

  it("labels each duty with its weight, not a risk rating", () => {
    const { nodes } = buildGraph(assignments, [], false);
    const duty = nodes.find((n) => n.id === "duty:collect_cash");
    expect(String(duty?.data.label)).toMatch(/weight \d of 5/);
    expect(String(duty?.data.label)).not.toMatch(/risk/);
  });
});
