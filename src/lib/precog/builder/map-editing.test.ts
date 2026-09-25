import { describe, expect, it } from "vitest";
import { defaultProfile } from "../practice-profile";
import type { ProcessNode } from "../types";
import { applyMapSnapshot, captureMapSnapshot } from "./map-history";
import {
  connectProcessDependency,
  edgesWithinNodes,
  removeProcessDependencies,
} from "./map-editing";

const process = (id: string, dependencies: string[] = []): ProcessNode => ({
  id,
  name: id,
  description: "",
  layer: "process",
  dependencies,
  controlIds: [],
});

describe("map editing", () => {
  it("filters dangling edges with one visit per node, preserving edge order and identity", () => {
    let reads = 0;
    const nodes = Array.from({ length: 100 }, (_, i) => ({
      get id() {
        reads += 1;
        return String(i);
      },
    }));
    const edges = Array.from({ length: 300 }, (_, i) => ({
      source: String(i % 100),
      target: String(i),
    }));
    expect(edgesWithinNodes(edges, nodes)).toEqual(edges.slice(0, 100));
    expect(reads).toBe(100);
    expect(edgesWithinNodes(edges, [])).toEqual([]);
  });

  it("removes multiple dependencies in a single immutable edit", () => {
    const before = [process("a"), process("b", ["a"]), process("c", ["a", "b"]), process("d")];
    const after = removeProcessDependencies(before, [
      { source: "a", target: "b" },
      { source: "b", target: "c" },
    ]);
    expect(after[1].dependencies).toEqual([]);
    expect(after[2].dependencies).toEqual(["a"]);
    expect(before[1].dependencies).toEqual(["a"]);
    expect(after[0]).toBe(before[0]);
    expect(after[3]).toBe(before[3]);
  });

  it("preserves identity for no-op removals and duplicate connection requests", () => {
    const nodes = [process("a"), process("b", ["a"])];
    expect(removeProcessDependencies(nodes, [])).toBe(nodes);
    expect(removeProcessDependencies(nodes, [{ source: "missing", target: "b" }])).toBe(nodes);
    expect(connectProcessDependency(nodes, "a", "b")).toBe(nodes);
  });

  it("rejects missing endpoints and self-loops but permits legitimate rework loops", () => {
    const nodes = [process("a"), process("b", ["a"])];
    expect(connectProcessDependency(nodes, "missing", "b")).toBe(nodes);
    expect(connectProcessDependency(nodes, "a", "missing")).toBe(nodes);
    expect(connectProcessDependency(nodes, "a", "a")).toBe(nodes);
    expect(connectProcessDependency(nodes, "b", "a")[0].dependencies).toEqual(["b"]);
  });
});

describe("map history", () => {
  it("restores manual layout with domain edits without undoing unrelated business changes", () => {
    const before = {
      ...defaultProfile(),
      mapLayout: { a: { x: 5, y: 9 } },
      customProcesses: [process("a")],
    };
    const snapshot = captureMapSnapshot(before);
    const after = {
      ...before,
      practiceName: "A later name",
      mapLayout: { a: { x: 55, y: 99 } },
      customProcesses: [process("a"), process("b")],
    };
    const restored = applyMapSnapshot(after, snapshot);
    expect(restored.mapLayout).toEqual(before.mapLayout);
    expect(restored.customProcesses).toEqual(before.customProcesses);
    expect(restored.practiceName).toBe("A later name");
    expect(applyMapSnapshot(restored, captureMapSnapshot(after)).mapLayout).toEqual(
      after.mapLayout,
    );
  });

  it("returns to automatic layout when the earlier snapshot had no pinned positions", () => {
    const before = defaultProfile();
    before.mapLayout = undefined;
    const after = { ...before, mapLayout: { a: { x: 3, y: 4 } } };
    expect(applyMapSnapshot(after, captureMapSnapshot(before)).mapLayout).toEqual({});
  });
});
