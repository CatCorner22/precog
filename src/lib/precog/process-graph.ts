/**
 * Process map graph builder — merges processes, SoD, knowledge SPOFs, residuals, ideas.
 */
import {
  controls,
  knowledge,
  people,
  processes,
  relations,
  scenarios,
} from "./demo-data";
import { findKnowledgeRisks } from "./engine";
import { portfolioSummary } from "./scoring/residual-engine";
import type { StaffComposition } from "./types";
import type {
  ProcessIdea,
  ProcessNode,
  ProcessRisk,
  ProcessWaste,
} from "./types";

export type MapNodeKind =
  | "process"
  | "risk"
  | "idea"
  | "waste"
  | "control"
  | "knowledge"
  | "person";

export interface MapGraphNode {
  id: string;
  kind: MapNodeKind;
  label: string;
  subtitle?: string;
  processId?: string;
  severity?: number; // 0-100 heat
  badges?: string[];
  data: Record<string, unknown>;
}

export interface MapGraphEdge {
  id: string;
  source: string;
  target: string;
  kind: "depends" | "has_risk" | "has_idea" | "has_waste" | "control" | "knowledge" | "owns" | "feeds";
  label?: string;
}

export interface ProcessMapSnapshot {
  process: ProcessNode;
  risks: ProcessRisk[];
  ideas: ProcessIdea[];
  wastes: ProcessWaste[];
  controlGaps: { id: string; name: string; segregated: boolean; residualRiskAccepted: boolean }[];
  knowledgeItems: {
    id: string;
    name: string;
    soleOwner: boolean;
    riskScore: number;
    owners: string[];
  }[];
  residualScore: number | null;
  residualBand: string | null;
  linkedScenarios: { id: string; title: string }[];
  owners: { id: string; name: string; role: string }[];
  heat: number;
}

function riskHeat(r: ProcessRisk) {
  return r.severity * r.likelihood * 4; // 4–100
}

export function enrichProcess(process: ProcessNode, staff?: StaffComposition): ProcessMapSnapshot {
  const risks = process.risks ?? [];
  const ideas = process.ideas ?? [];
  const wastes = process.wastes ?? [];
  const controlGaps = process.controlIds
    .map((id) => controls.find((c) => c.id === id))
    .filter(Boolean)
    .map((c) => ({
      id: c!.id,
      name: c!.name,
      segregated: c!.segregated,
      residualRiskAccepted: c!.residualRiskAccepted,
    }));

  const kRisks = findKnowledgeRisks();
  const knowledgeItems = knowledge
    .filter((k) => k.linkedProcessIds.includes(process.id))
    .map((k) => {
      const r = kRisks.find((x) => x.knowledgeId === k.id);
      return {
        id: k.id,
        name: k.name,
        soleOwner: Boolean(r?.soleOwner),
        riskScore: r?.riskScore ?? 0,
        owners: r?.owners.map((o) => o.name) ?? [],
      };
    });

  const portfolio = staff ? portfolioSummary(staff) : portfolioSummary();
  // Heuristic link residual items by name tokens
  const tokens = process.name.toLowerCase().split(/\s+/);
  const residualHit =
    portfolio.top.find((t) =>
      tokens.some((tok) => tok.length > 3 && t.name.toLowerCase().includes(tok)),
    ) ??
    portfolio.top.find((t) =>
      process.controlIds.some(
        (cid) =>
          t.id.includes(cid) ||
          (t.linkedScenarioId &&
            scenarios.find((s) => s.id === t.linkedScenarioId)?.controlId === cid),
      ),
    );

  const linkedScenarios = scenarios
    .filter(
      (s) =>
        (s.controlId && process.controlIds.includes(s.controlId)) ||
        (s.knowledgeId &&
          knowledgeItems.some((k) => k.id === s.knowledgeId)),
    )
    .map((s) => ({ id: s.id, title: s.title }));

  const owners = (process.ownerPersonIds ?? [])
    .map((id) => people.find((p) => p.id === id))
    .filter(Boolean)
    .map((p) => ({ id: p!.id, name: p!.name, role: p!.role }));

  const maxRisk = Math.max(0, ...risks.map(riskHeat));
  const sodPenalty = controlGaps.filter((c) => !c.segregated).length * 12;
  const spofPenalty = knowledgeItems.filter((k) => k.soleOwner).length * 15;
  const residualPart = residualHit?.residual ?? 0;
  const heat = Math.min(
    100,
    Math.round(maxRisk * 0.45 + sodPenalty + spofPenalty + residualPart * 0.35),
  );

  return {
    process,
    risks,
    ideas,
    wastes,
    controlGaps,
    knowledgeItems,
    residualScore: residualHit?.residual ?? null,
    residualBand: residualHit?.bandLabel ?? null,
    linkedScenarios,
    owners,
    heat,
  };
}

export function buildProcessMapGraph(
  staff?: StaffComposition,
  opts: { showRisks?: boolean; showIdeas?: boolean; showWaste?: boolean; showKnowledge?: boolean } = {},
): { nodes: MapGraphNode[]; edges: MapGraphEdge[]; snapshots: ProcessMapSnapshot[] } {
  const showRisks = opts.showRisks ?? true;
  const showIdeas = opts.showIdeas ?? true;
  const showWaste = opts.showWaste ?? true;
  const showKnowledge = opts.showKnowledge ?? true;

  const snapshots = processes.map((p) => enrichProcess(p, staff));
  const nodes: MapGraphNode[] = [];
  const edges: MapGraphEdge[] = [];

  for (const snap of snapshots) {
    const p = snap.process;
    nodes.push({
      id: p.id,
      kind: "process",
      label: p.name,
      subtitle: p.description,
      processId: p.id,
      severity: snap.heat,
      badges: [
        snap.heat >= 70 ? "hot" : snap.heat >= 45 ? "warm" : "cool",
        `${snap.risks.length} risks`,
        `${snap.ideas.length} ideas`,
      ],
      data: {
        stage: p.stage ?? 0,
        inputs: p.inputs ?? [],
        outputs: p.outputs ?? [],
        heat: snap.heat,
        residualScore: snap.residualScore,
        residualBand: snap.residualBand,
        controlGapCount: snap.controlGaps.filter((c) => !c.segregated).length,
        spofCount: snap.knowledgeItems.filter((k) => k.soleOwner).length,
      },
    });

    for (const dep of p.dependencies) {
      edges.push({
        id: `dep-${dep}-${p.id}`,
        source: dep,
        target: p.id,
        kind: "depends",
        label: "feeds",
      });
    }

    if (showRisks) {
      for (const r of snap.risks) {
        const rid = `${p.id}::risk::${r.id}`;
        nodes.push({
          id: rid,
          kind: "risk",
          label: r.title,
          subtitle: r.note,
          processId: p.id,
          severity: riskHeat(r),
          badges: [r.kind, `S${r.severity}×L${r.likelihood}`],
          data: { ...r },
        });
        edges.push({
          id: `e-${rid}`,
          source: p.id,
          target: rid,
          kind: "has_risk",
        });
      }
    }

    if (showIdeas) {
      for (const idea of snap.ideas) {
        const iid = `${p.id}::idea::${idea.id}`;
        nodes.push({
          id: iid,
          kind: "idea",
          label: idea.title,
          subtitle: idea.note,
          processId: p.id,
          severity: idea.impact === "high" ? 70 : idea.impact === "medium" ? 45 : 25,
          badges: [idea.category, idea.effort, idea.status],
          data: { ...idea },
        });
        edges.push({
          id: `e-${iid}`,
          source: p.id,
          target: iid,
          kind: "has_idea",
        });
      }
    }

    if (showWaste) {
      for (const w of snap.wastes) {
        const wid = `${p.id}::waste::${w.id}`;
        nodes.push({
          id: wid,
          kind: "waste",
          label: w.label,
          subtitle: w.note,
          processId: p.id,
          severity: 40,
          badges: [w.kind],
          data: { ...w },
        });
        edges.push({
          id: `e-${wid}`,
          source: p.id,
          target: wid,
          kind: "has_waste",
        });
      }
    }

    for (const c of snap.controlGaps) {
      if (c.segregated) continue;
      const cid = `${p.id}::ctrl::${c.id}`;
      nodes.push({
        id: cid,
        kind: "control",
        label: c.name,
        subtitle: c.residualRiskAccepted ? "Residual accepted" : "Open SoD gap",
        processId: p.id,
        severity: c.residualRiskAccepted ? 55 : 80,
        badges: ["SoD gap"],
        data: { ...c },
      });
      edges.push({
        id: `e-${cid}`,
        source: p.id,
        target: cid,
        kind: "control",
      });
    }

    if (showKnowledge) {
      for (const k of snap.knowledgeItems) {
        const kid = `${p.id}::know::${k.id}`;
        nodes.push({
          id: kid,
          kind: "knowledge",
          label: k.name,
          subtitle: k.soleOwner
            ? `SPOF · ${k.owners[0] ?? "unowned"}`
            : `${k.owners.length} owners`,
          processId: p.id,
          severity: k.riskScore,
          badges: k.soleOwner ? ["SPOF"] : ["shared"],
          data: { ...k },
        });
        edges.push({
          id: `e-${kid}`,
          source: p.id,
          target: kid,
          kind: "knowledge",
        });
      }
    }

    for (const o of snap.owners) {
      const oid = `${p.id}::person::${o.id}`;
      if (!nodes.some((n) => n.id === oid)) {
        nodes.push({
          id: oid,
          kind: "person",
          label: o.name,
          subtitle: o.role,
          processId: p.id,
          severity: 20,
          badges: ["owner"],
          data: { ...o },
        });
      }
      edges.push({
        id: `e-${oid}`,
        source: oid,
        target: p.id,
        kind: "owns",
        label: "owns",
      });
    }
  }

  // Cross-link knowledge people for context (not all relations)
  for (const r of relations.filter((x) => x.level === "expert")) {
    const k = knowledge.find((x) => x.id === r.knowledgeId);
    if (!k) continue;
    for (const pid of k.linkedProcessIds) {
      const personNode = `${pid}::person::${r.personId}`;
      const knowNode = `${pid}::know::${r.knowledgeId}`;
      if (nodes.some((n) => n.id === personNode) && nodes.some((n) => n.id === knowNode)) {
        edges.push({
          id: `expert-${r.personId}-${r.knowledgeId}-${pid}`,
          source: personNode,
          target: knowNode,
          kind: "owns",
          label: "expert",
        });
      }
    }
  }

  return { nodes, edges, snapshots };
}

export function layoutProcessMap(
  nodes: MapGraphNode[],
  edges: MapGraphEdge[],
): Map<string, { x: number; y: number }> {
  const pos = new Map<string, { x: number; y: number }>();
  const processNodes = nodes.filter((n) => n.kind === "process");
  const sorted = [...processNodes].sort(
    (a, b) => Number(a.data.stage ?? 0) - Number(b.data.stage ?? 0),
  );

  // Layer by stage
  const stages = new Map<number, MapGraphNode[]>();
  for (const n of sorted) {
    const st = Number(n.data.stage ?? 0);
    if (!stages.has(st)) stages.set(st, []);
    stages.get(st)!.push(n);
  }

  const stageKeys = [...stages.keys()].sort((a, b) => a - b);
  stageKeys.forEach((st, si) => {
    const col = stages.get(st)!;
    col.forEach((n, ri) => {
      pos.set(n.id, { x: 80 + si * 280, y: 80 + ri * 140 });
    });
  });

  // Place satellites around process
  for (const p of processNodes) {
    const origin = pos.get(p.id) ?? { x: 0, y: 0 };
    const children = edges
      .filter((e) => e.source === p.id && e.kind !== "depends")
      .map((e) => nodes.find((n) => n.id === e.target))
      .filter(Boolean) as MapGraphNode[];

    children.forEach((c, i) => {
      const angle = (i / Math.max(1, children.length)) * Math.PI - Math.PI / 2;
      const radius = 110 + (i % 3) * 18;
      pos.set(c.id, {
        x: origin.x + 160 + Math.cos(angle) * radius,
        y: origin.y + 30 + Math.sin(angle) * radius,
      });
    });

    // person owners left of process
    const owners = edges
      .filter((e) => e.target === p.id && e.kind === "owns")
      .map((e) => e.source);
    owners.forEach((oid, i) => {
      if (!pos.has(oid)) {
        pos.set(oid, { x: origin.x - 140, y: origin.y + i * 50 });
      }
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
