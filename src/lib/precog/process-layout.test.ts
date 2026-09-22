import { describe, expect, it } from "vitest";
import { getBaseTemplate } from "./active-template";
import {
  buildProcessMapGraph,
  layoutProcessMap,
  MAP_LAYOUT,
  stageLanes,
  type MapGraphNode,
} from "./process-graph";

const CARD = { w: 220, h: 110 };
const SATELLITE = { w: 180, h: 70 };

function box(n: MapGraphNode, p: { x: number; y: number }) {
  const size = n.kind === "process" ? CARD : SATELLITE;
  return { x1: p.x, y1: p.y, x2: p.x + size.w, y2: p.y + size.h };
}

function overlaps(a: ReturnType<typeof box>, b: ReturnType<typeof box>) {
  return a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;
}

describe("layoutProcessMap", () => {
  const tpl = getBaseTemplate("dental");
  const graph = buildProcessMapGraph(tpl, undefined, {
    showRisks: true,
    showIdeas: true,
    showWaste: true,
    showKnowledge: true,
  });

  it("never places a process card on top of another process card", () => {
    const pos = layoutProcessMap(graph.nodes, graph.edges);
    const procs = graph.nodes.filter((n) => n.kind === "process");
    for (let i = 0; i < procs.length; i++) {
      for (let j = i + 1; j < procs.length; j++) {
        const a = box(procs[i], pos.get(procs[i].id)!);
        const b = box(procs[j], pos.get(procs[j].id)!);
        expect(overlaps(a, b), `${procs[i].id} overlaps ${procs[j].id}`).toBe(false);
      }
    }
  });

  it("keeps a process's satellites out of every other process card", () => {
    const pos = layoutProcessMap(graph.nodes, graph.edges);
    const procs = graph.nodes.filter((n) => n.kind === "process");
    const sats = graph.nodes.filter((n) => n.kind !== "process" && n.kind !== "person");
    for (const s of sats) {
      for (const p of procs) {
        if (s.processId === p.id) continue;
        const a = box(s, pos.get(s.id)!);
        const b = box(p, pos.get(p.id)!);
        expect(overlaps(a, b), `${s.id} lands on ${p.id}`).toBe(false);
      }
    }
  });

  it("never stacks two satellites on the same spot", () => {
    const pos = layoutProcessMap(graph.nodes, graph.edges);
    const sats = graph.nodes.filter((n) => n.kind !== "process");
    for (let i = 0; i < sats.length; i++) {
      for (let j = i + 1; j < sats.length; j++) {
        const a = box(sats[i], pos.get(sats[i].id)!);
        const b = box(sats[j], pos.get(sats[j].id)!);
        expect(overlaps(a, b), `${sats[i].id} overlaps ${sats[j].id}`).toBe(false);
      }
    }
  });

  it("does not treat a downstream process as a satellite of an upstream one", () => {
    // Every process must sit at a lane origin, never on a satellite arc.
    const pos = layoutProcessMap(graph.nodes, graph.edges);
    const lanes = stageLanes(graph.nodes, pos);
    const laneX = new Set(lanes.map((l) => l.x));
    for (const n of graph.nodes.filter((n) => n.kind === "process")) {
      expect(laneX.has(pos.get(n.id)!.x), `${n.id} is off-lane`).toBe(true);
    }
  });

  it("packs columns tightly when no satellites are shown", () => {
    const bare = buildProcessMapGraph(tpl, undefined, {
      showRisks: false,
      showIdeas: false,
      showWaste: false,
      showKnowledge: false,
    });
    const nodes = bare.nodes.filter((n) => n.kind === "process");
    const pos = layoutProcessMap(nodes, bare.edges);
    const lanes = stageLanes(nodes, pos);
    for (let i = 1; i < lanes.length; i++) {
      expect(lanes[i].x - lanes[i - 1].x).toBe(MAP_LAYOUT.colGap);
    }
  });

  it("honours pinned positions", () => {
    const pos = layoutProcessMap(graph.nodes, graph.edges, { "proc-cash": { x: 5, y: 7 } });
    expect(pos.get("proc-cash")).toEqual({ x: 5, y: 7 });
  });
});

describe("stageLanes", () => {
  it("returns one lane per stage in order with the top-left process origin", () => {
    const tpl = getBaseTemplate("dental");
    const graph = buildProcessMapGraph(tpl, undefined);
    const pos = layoutProcessMap(graph.nodes, graph.edges);
    const lanes = stageLanes(graph.nodes, pos);
    const stages = [...new Set(tpl.processes.map((p) => p.stage ?? 0))].sort((a, b) => a - b);
    expect(lanes.map((l) => l.stage)).toEqual(stages);
    expect(lanes.reduce((n, l) => n + l.count, 0)).toBe(tpl.processes.length);
    for (let i = 1; i < lanes.length; i++) expect(lanes[i].x).toBeGreaterThan(lanes[i - 1].x);
  });
});
