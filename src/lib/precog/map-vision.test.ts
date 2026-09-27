import { describe, expect, it } from "vitest";
import { buildPriorityTargets, priorityBand, scorePriority } from "./map-vision";
import { resolveTemplate } from "./active-template";
import { defaultProfile } from "./practice-profile";
import { buildProcessMapGraph, graphNodeIdForPriority } from "./process-graph";

const profile = defaultProfile();
const tpl = resolveTemplate(profile);
const graph = buildProcessMapGraph(tpl, profile.staff);

describe("buildPriorityTargets", () => {
  it("ranks every target highest first", () => {
    const targets = buildPriorityTargets(graph, () => true);
    expect(targets.length).toBeGreaterThan(graph.snapshots.length);
    for (let i = 1; i < targets.length; i++) {
      expect(targets[i - 1].priority).toBeGreaterThanOrEqual(targets[i].priority);
    }
  });

  it("leaves out a process the map does not score, with its cards", () => {
    const skipped = graph.snapshots[0].process.id;
    const targets = buildPriorityTargets(graph, (id) => id !== skipped);
    expect(targets.some((t) => t.processId === skipped)).toBe(false);
    expect(buildPriorityTargets(graph, () => false)).toEqual([]);
  });

  it("reads risk and control heat from the card the canvas draws", () => {
    const targets = buildPriorityTargets(graph, () => true);
    const satellites = targets.filter((t) => t.kind === "risk" || t.kind === "control");
    expect(satellites.length).toBeGreaterThan(0);
    for (const t of satellites) {
      const card = graph.nodes.find((n) => n.id === graphNodeIdForPriority(t, graph.nodes));
      expect(card?.severity, t.label).toBe(t.heat);
    }
  });
});

describe("priorityBand", () => {
  it("bands at 88, 72, 55 and 35", () => {
    expect(priorityBand(88)).toBe("white_hot");
    expect(priorityBand(87)).toBe("critical");
    expect(priorityBand(72)).toBe("critical");
    expect(priorityBand(71)).toBe("elevated");
    expect(priorityBand(55)).toBe("elevated");
    expect(priorityBand(54)).toBe("watch");
    expect(priorityBand(35)).toBe("watch");
    expect(priorityBand(34)).toBe("cold");
  });
});

describe("scorePriority", () => {
  it("marks a target immediate only when it ranks at 78 or above", () => {
    for (const heat of [20, 50, 70, 90, 100]) {
      for (const kind of ["process", "risk", "control", "knowledge"]) {
        const s = scorePriority({ heat, kind, controlOpen: kind === "control" });
        if (s.immediate) expect(s.priority).toBeGreaterThanOrEqual(78);
      }
    }
  });
  it("stays on 0 to 100", () => {
    for (const heat of [0, 50, 100]) {
      for (const kind of ["process", "risk", "control", "knowledge", "idea"]) {
        const { priority } = scorePriority({ heat, kind, riskSeverity: 5, riskLikelihood: 5 });
        expect(priority).toBeGreaterThanOrEqual(0);
        expect(priority).toBeLessThanOrEqual(100);
      }
    }
  });

  it("never falls when heat rises", () => {
    let last = -1;
    for (let heat = 0; heat <= 100; heat += 5) {
      const { priority } = scorePriority({ heat, kind: "process", dependencyCount: 2 });
      expect(priority).toBeGreaterThanOrEqual(last);
      last = priority;
    }
  });

  it("never falls when a risk's severity rises", () => {
    let last = -1;
    for (let sev = 1; sev <= 5; sev++) {
      const { priority } = scorePriority({ heat: 60, kind: "risk", riskSeverity: sev });
      expect(priority).toBeGreaterThanOrEqual(last);
      last = priority;
    }
  });

  it("flags an open control gap as high impact", () => {
    const r = scorePriority({ heat: 80, kind: "control" });
    expect(r.reasons).toContain("Open control / SoD gap");
    expect(r.immediate).toBe(true);
  });
});
