import { describe, expect, it } from "vitest";
import { getIndustryTemplate } from "../templates";
import type { ProcessNode } from "../types";
import { diffMaps, processChanges } from "./diff";

const waste = (id: string) => ({
  id,
  kind: "muda_waiting" as const,
  label: "Waiting on approvals",
  note: "",
});

describe("processChanges and Lean waste", () => {
  const template = getIndustryTemplate("dental");

  it("shows no waste change for a map saved when the sample still carried waste", () => {
    const savedEarlier: ProcessNode[] = template.processes.map((p) => ({
      ...p,
      wastes: [waste(`w-${p.id}-1`), waste(`w-${p.id}-2`)],
    }));
    const diff = diffMaps(
      { processes: template.processes, people: template.people },
      { processes: savedEarlier, people: template.people },
      { baseIsTemplate: true },
    );
    expect(diff.total).toBe(0);
    for (const p of savedEarlier) {
      expect(
        processChanges(template.processes[0], p, { baseIsTemplate: true }).join(" "),
      ).not.toMatch(/waste/);
    }
  });

  it("still counts waste removed from a version that had some", () => {
    const before: ProcessNode = { ...template.processes[0], wastes: [waste("a"), waste("b")] };
    const after: ProcessNode = { ...before, wastes: [waste("a")] };
    expect(processChanges(before, after)).toEqual(["-1 waste"]);
  });

  it("counts waste added to a saved version that had none", () => {
    const saved = { processes: template.processes, people: template.people };
    const current = {
      processes: template.processes.map((p, i) =>
        i === 0 ? { ...p, wastes: [waste("a"), waste("b")] } : p,
      ),
      people: template.people,
    };
    const diff = diffMaps(saved, current);
    expect(diff.total).toBe(1);
    expect(diff.modified[0].changes).toEqual(["+2 waste"]);
  });

  it("leaves every sample without Lean waste", () => {
    expect(template.processes.every((p) => (p.wastes ?? []).length === 0)).toBe(true);
  });
});
