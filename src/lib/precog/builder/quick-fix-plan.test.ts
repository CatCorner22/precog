import { describe, expect, it } from "vitest";
import { applyQuickFixes, isQuickFixable, planQuickFix } from "./quick-fix-plan";
import { resolveTemplate } from "../active-template";
import { defaultProfile } from "../practice-profile";
import { validateProcessMap } from "../process-validation";
import type { ProcessNode } from "../types";

const tpl = resolveTemplate(defaultProfile());

function issuesOf(processes: ProcessNode[]) {
  return validateProcessMap(processes, tpl.people, new Set(tpl.controls.map((c) => c.id)), {});
}

describe("planQuickFix", () => {
  it("repairs an owner who is not on the team instead of adding another owner", () => {
    const [first, ...rest] = tpl.processes;
    const ghost = { ...first, ownerPersonIds: ["p-ghost"] };
    const issue = issuesOf([ghost, ...rest]).find((i) => i.id.startsWith("owner-ref-"));
    expect(issue).toBeDefined();
    const fix = planQuickFix(issue!.id, ghost, [ghost, ...rest], tpl);
    expect(fix?.patch.ownerPersonIds).toEqual([]);
    expect(fix?.message).toMatch(/Removed broken references/);
  });

  it("adds a suggested owner to a process with none", () => {
    const [first, ...rest] = tpl.processes;
    const unowned = { ...first, ownerPersonIds: [] };
    const fix = planQuickFix(`owner-${unowned.id}`, unowned, [unowned, ...rest], tpl);
    expect(fix?.patch.ownerPersonIds).toHaveLength(1);
    expect(tpl.people.some((p) => p.id === fix?.patch.ownerPersonIds?.[0])).toBe(true);
  });

  it("offers a Fix for the issue kinds it plans and for no others", () => {
    for (const id of ["owner-p", "owner-ref-p-x", "owner-left-p", "dep-p-q", "fraud-nocontrol-p"]) {
      expect(isQuickFixable({ id, processId: "p" }), id).toBe(true);
    }
    for (const id of ["record-p", "ctrl-p-c", "cycle", "layout-p"]) {
      expect(isQuickFixable({ id, processId: "p" }), id).toBe(false);
    }
    expect(isQuickFixable({ id: "owner-p" })).toBe(false);
  });
});

describe("applyQuickFixes", () => {
  it("reports how many fixes it applied (never 0 when it changed the map)", () => {
    const unowned = tpl.processes.map((p, i) => (i < 2 ? { ...p, ownerPersonIds: [] } : p));
    const fixable = issuesOf(unowned).filter(isQuickFixable);
    expect(fixable.length).toBeGreaterThanOrEqual(2);
    const { next, applied } = applyQuickFixes(fixable, unowned, tpl);
    expect(applied).toBeGreaterThanOrEqual(2);
    expect(next[0].ownerPersonIds?.length).toBe(1);
    expect(next[1].ownerPersonIds?.length).toBe(1);
  });

  it("applies nothing and counts nothing when no issue is fixable", () => {
    const { next, applied } = applyQuickFixes([], tpl.processes, tpl);
    expect(applied).toBe(0);
    expect(next).toBe(tpl.processes);
  });
});
