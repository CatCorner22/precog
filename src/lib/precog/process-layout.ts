import type { MapGraphEdge, MapGraphNode } from "./process-graph";

/**
 * Spacing for the stage-lane layout. Satellites (risks, ideas, controls,
 * knowledge, owners) stack in a two-column grid above and below their process
 * card, so a stage lane stays narrow and the canvas fits a landscape viewport.
 */
export const MAP_LAYOUT = {
  originX: 80,
  originY: 80,
  /** Process card is 180–220px wide; leave a gutter for edges. */
  colGap: 300,
  /** Two satellite columns (2 × 200px) starting just left of the card, plus a gutter. */
  colGapWithSatellites: 440,
  rowGap: 200,
  /** Satellite card footprint: two columns, 80px row pitch. */
  satellite: { columns: 2, colPitch: 200, rowPitch: 80, offsetX: -10, above: 80, below: 130 },
} as const;

/** Rows of satellites a process needs above and below its card. */
function satelliteRows(count: number): { above: number; below: number } {
  const perSide = Math.ceil(count / 2);
  const rows = Math.ceil(perSide / MAP_LAYOUT.satellite.columns);
  return { above: rows, below: count > 1 ? rows : 0 };
}

/** Auto-layout positions for the process stream and its satellites; pinned positions win. */
export function layoutProcessMap(
  nodes: MapGraphNode[],
  edges: MapGraphEdge[],
  pinned: Record<string, { x: number; y: number }> = {},
): Map<string, { x: number; y: number }> {
  const pos = new Map<string, { x: number; y: number }>();
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const processNodes = nodes.filter((n) => n.kind === "process");
  const sorted = [...processNodes].sort(
    (a, b) => Number(a.data.stage ?? 0) - Number(b.data.stage ?? 0),
  );

  /** Everything drawn around a process: outgoing satellites plus the people who own it. */
  const satellitesOf = (p: MapGraphNode): MapGraphNode[] => {
    const out: MapGraphNode[] = [];
    const seen = new Set<string>();
    for (const e of edges) {
      const id =
        e.source === p.id && e.kind !== "depends" && e.kind !== "feeds"
          ? e.target
          : e.target === p.id && e.kind === "owns"
            ? e.source
            : null;
      if (!id || seen.has(id)) continue;
      const n = nodeById.get(id);
      if (!n || n.kind === "process") continue;
      seen.add(id);
      out.push(n);
    }
    return out;
  };

  // Layer by stage
  const stages = new Map<number, MapGraphNode[]>();
  for (const n of sorted) {
    const st = Number(n.data.stage ?? 0);
    if (!stages.has(st)) stages.set(st, []);
    stages.get(st)!.push(n);
  }

  const S = MAP_LAYOUT.satellite;
  const stageKeys = [...stages.keys()].sort((a, b) => a - b);
  let x = MAP_LAYOUT.originX;
  for (const st of stageKeys) {
    const col = stages.get(st)!;
    const counts = col.map((n) => satellitesOf(n).length);
    const wide = counts.some((c) => c > 0);
    let y = MAP_LAYOUT.originY;
    col.forEach((n, i) => {
      const rows = satelliteRows(counts[i]);
      // Leave room above the card for this process's own satellites.
      if (rows.above) y += S.above + (rows.above - 1) * S.rowPitch;
      pos.set(n.id, pinned[n.id] ?? { x, y });
      y += rows.below ? S.below + rows.below * S.rowPitch : MAP_LAYOUT.rowGap;
      if (rows.above || rows.below) y += 40;
    });
    x += wide ? MAP_LAYOUT.colGapWithSatellites : MAP_LAYOUT.colGap;
  }

  // Stack satellites above and below the card, two per row, alternating sides so
  // both halves stay balanced.
  for (const p of processNodes) {
    const origin = pos.get(p.id) ?? { x: 0, y: 0 };
    satellitesOf(p).forEach((c, i) => {
      const above = i % 2 === 0;
      const k = Math.floor(i / 2);
      const column = k % S.columns;
      const row = Math.floor(k / S.columns);
      pos.set(c.id, {
        x: origin.x + S.offsetX + column * S.colPitch,
        y: above ? origin.y - S.above - row * S.rowPitch : origin.y + S.below + row * S.rowPitch,
      });
    });
  }

  // Fallback
  nodes.forEach((n, i) => {
    if (!pos.has(n.id)) {
      pos.set(n.id, { x: 40 + (i % 6) * 160, y: 400 + Math.floor(i / 6) * 80 });
    }
  });

  return pos;
}

/** Stage lanes with their left edge and top, for drawing lane headers behind the canvas. */
export function stageLanes(
  nodes: MapGraphNode[],
  positions: Map<string, { x: number; y: number }>,
): { stage: number; x: number; y: number; count: number }[] {
  const lanes = new Map<number, { stage: number; x: number; y: number; count: number }>();
  for (const n of nodes) {
    if (n.kind !== "process") continue;
    const p = positions.get(n.id);
    if (!p) continue;
    const st = Number(n.data.stage ?? 0);
    const lane = lanes.get(st);
    if (!lane) lanes.set(st, { stage: st, x: p.x, y: p.y, count: 1 });
    else {
      lane.x = Math.min(lane.x, p.x);
      lane.y = Math.min(lane.y, p.y);
      lane.count += 1;
    }
  }
  return [...lanes.values()].sort((a, b) => a.stage - b.stage);
}
