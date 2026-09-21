/**
 * Process map graph builder — merges processes, SoD, knowledge SPOFs, residuals, ideas.
 */
import { HEALTH_SCALE } from "./scoring/bands";
import { findKnowledgeRisks } from "./engine";
import type { IndustryTemplate } from "./templates";
import { portfolioSummary } from "./scoring/residual-engine";
import type { StaffComposition } from "./types";
import type { Person, ProcessIdea, ProcessNode, ProcessRisk, ProcessWaste } from "./types";

export interface MapValidationIssue {
  id: string;
  severity: "error" | "warn" | "info";
  message: string;
  processId?: string;
}

function normalizeIoToken(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Match output tokens from upstream processes to downstream inputs. */
function inferFeedEdges(processes: ProcessNode[]): MapGraphEdge[] {
  const edges: MapGraphEdge[] = [];
  const seen = new Set<string>();
  const outputIndex = new Map<string, string[]>();

  for (const p of processes) {
    for (const out of p.outputs ?? []) {
      const tok = normalizeIoToken(out);
      if (tok.length < 3) continue;
      const list = outputIndex.get(tok) ?? [];
      list.push(p.id);
      outputIndex.set(tok, list);
    }
  }

  for (const target of processes) {
    for (const inp of target.inputs ?? []) {
      const tok = normalizeIoToken(inp);
      if (tok.length < 3) continue;

      const sources = new Set<string>();
      for (const [outTok, ids] of outputIndex) {
        if (tok === outTok || tok.includes(outTok) || outTok.includes(tok)) {
          for (const id of ids) sources.add(id);
        }
      }

      for (const src of sources) {
        if (src === target.id || target.dependencies.includes(src)) continue;
        const key = `feed-${src}-${target.id}-${tok}`;
        if (seen.has(key)) continue;
        seen.add(key);
        edges.push({
          id: key,
          source: src,
          target: target.id,
          kind: "feeds",
          label: inp.slice(0, 28),
        });
      }
    }
  }

  return edges;
}

function detectDependencyCycle(processes: ProcessNode[]): string[] | null {
  const ids = new Set(processes.map((p) => p.id));
  const deps = new Map<string, string[]>();
  for (const p of processes) {
    deps.set(
      p.id,
      p.dependencies.filter((d) => ids.has(d)),
    );
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  let cyclePath: string[] | null = null;

  function dfs(id: string, path: string[]): boolean {
    if (visiting.has(id)) {
      const idx = path.indexOf(id);
      cyclePath = [...path.slice(idx), id];
      return true;
    }
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const dep of deps.get(id) ?? []) {
      if (dfs(dep, [...path, id])) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  }

  for (const p of processes) {
    if (dfs(p.id, [])) return cyclePath;
  }
  return null;
}

export function validateProcessMap(
  processes: ProcessNode[],
  people: Person[],
  controlIds: Set<string>,
  mapLayout: Record<string, { x: number; y: number }> = {},
): MapValidationIssue[] {
  const issues: MapValidationIssue[] = [];
  const ids = new Set(processes.map((p) => p.id));
  const personIds = new Set(people.map((p) => p.id));

  const cycle = detectDependencyCycle(processes);
  if (cycle?.length) {
    issues.push({
      id: "cycle",
      severity: "error",
      message: `Dependency cycle detected: ${cycle.map((id) => processes.find((p) => p.id === id)?.name ?? id).join(" → ")}`,
    });
  }

  for (const p of processes) {
    for (const dep of p.dependencies) {
      if (!ids.has(dep)) {
        issues.push({
          id: `dep-${p.id}-${dep}`,
          severity: "error",
          message: `"${p.name}" depends on missing process "${dep}"`,
          processId: p.id,
        });
      }
    }
    for (const cid of p.controlIds) {
      if (!controlIds.has(cid)) {
        issues.push({
          id: `ctrl-${p.id}-${cid}`,
          severity: "warn",
          message: `"${p.name}" references unknown control "${cid}"`,
          processId: p.id,
        });
      }
    }
    if (!(p.ownerPersonIds ?? []).length) {
      issues.push({
        id: `owner-${p.id}`,
        severity: "warn",
        message: `"${p.name}" has no owner assigned`,
        processId: p.id,
      });
    } else {
      for (const oid of p.ownerPersonIds ?? []) {
        if (!personIds.has(oid)) {
          issues.push({
            id: `owner-ref-${p.id}-${oid}`,
            severity: "error",
            message: `"${p.name}" owner "${oid}" is not on the team`,
            processId: p.id,
          });
        }
      }
    }
    if (p.controlIds.length === 0 && (p.risks ?? []).some((r) => r.kind === "fraud")) {
      issues.push({
        id: `fraud-nocontrol-${p.id}`,
        severity: "warn",
        message: `"${p.name}" has fraud risks but no controls mapped`,
        processId: p.id,
      });
    }
  }

  for (const key of Object.keys(mapLayout)) {
    if (!ids.has(key)) {
      issues.push({
        id: `layout-${key}`,
        severity: "info",
        message: `Saved layout position for removed process "${key}"`,
      });
    }
  }

  return issues;
}

/** Resolve a graph node id for a priority-stack target. */
export function graphNodeIdForPriority(
  target: { kind: string; id: string; processId?: string },
  nodes: MapGraphNode[],
): string {
  if (target.kind === "process") return target.id;
  if (!target.processId) return target.id;
  const suffix =
    target.kind === "risk"
      ? `::risk::${target.id}`
      : target.kind === "control"
        ? `::ctrl::${target.id}`
        : target.kind === "knowledge"
          ? `::know::${target.id}`
          : null;
  if (!suffix) return target.processId;
  return nodes.find((n) => n.id === `${target.processId}${suffix}`)?.id ?? target.processId;
}

/** Map a graph node to its priority-stack lookup key. */
export function priorityKeyForNode(n: MapGraphNode): string {
  if (n.kind === "process") return n.id;
  const d = n.data as { id?: string };
  return String(d.id ?? n.id);
}

export type MapNodeKind =
  "process" | "risk" | "idea" | "waste" | "control" | "knowledge" | "person";

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
  kind:
    "depends" | "has_risk" | "has_idea" | "has_waste" | "control" | "knowledge" | "owns" | "feeds";
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

/**
 * Display bands for the composite `heat` score that enrichProcess computes.
 * `heat` is this app's own 0–100 blend of a process's worst risk (severity ×
 * likelihood), its open duty conflicts, sole-owner knowledge, and any linked
 * residual score. The cutoffs order attention on the map; no study sets them
 * and they carry no probability meaning. Every consumer reads them from here
 * so the map badge, the health card, the review, and the weekly plan agree.
 */
export const HEAT_BANDS = { hot: 70, warm: 45 } as const;

function riskHeat(r: ProcessRisk) {
  return r.severity * r.likelihood * 4; // 4–100
}

export function enrichProcess(
  tpl: IndustryTemplate,
  process: ProcessNode,
  staff?: StaffComposition,
): ProcessMapSnapshot {
  const { controls, knowledge, people, scenarios } = tpl;
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

  const kRisks = findKnowledgeRisks(tpl);
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

  const portfolio = portfolioSummary(tpl, staff);
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
        (s.knowledgeId && knowledgeItems.some((k) => k.id === s.knowledgeId)),
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
  tpl: IndustryTemplate,
  staff?: StaffComposition,
  opts: {
    showRisks?: boolean;
    showIdeas?: boolean;
    showWaste?: boolean;
    showKnowledge?: boolean;
  } = {},
): { nodes: MapGraphNode[]; edges: MapGraphEdge[]; snapshots: ProcessMapSnapshot[] } {
  const showRisks = opts.showRisks ?? true;
  const showIdeas = opts.showIdeas ?? true;
  const showWaste = opts.showWaste ?? true;
  const showKnowledge = opts.showKnowledge ?? true;

  const { processes, knowledge, relations } = tpl;
  const snapshots = processes.map((p) => enrichProcess(tpl, p, staff));
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
        snap.heat >= HEAT_BANDS.hot ? "hot" : snap.heat >= HEAT_BANDS.warm ? "warm" : "cool",
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
        label: "depends",
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

  // Semantic value-stream links from inputs/outputs (when not already a dependency)
  for (const feed of inferFeedEdges(processes)) {
    if (!edges.some((e) => e.id === feed.id)) edges.push(feed);
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
  pinned: Record<string, { x: number; y: number }> = {},
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
      pos.set(n.id, pinned[n.id] ?? { x: 80 + si * 360, y: 80 + ri * 220 });
    });
  });

  // Place satellites around process
  for (const p of processNodes) {
    const origin = pos.get(p.id) ?? { x: 0, y: 0 };
    const children = edges
      .filter((e) => e.source === p.id && e.kind !== "depends")
      .map((e) => nodes.find((n) => n.id === e.target))
      .filter(Boolean) as MapGraphNode[];

    // Fan satellites in a right-facing arc; alternate two radii so labels don't stack.
    children.forEach((c, i) => {
      const n = Math.max(1, children.length);
      const angle = -Math.PI / 2 + ((i + 0.5) / n) * Math.PI;
      const radius = 130 + (i % 2) * 48;
      pos.set(c.id, {
        x: origin.x + 170 + Math.cos(angle) * radius,
        y: origin.y + 30 + Math.sin(angle) * radius,
      });
    });

    // person owners left of process
    const owners = edges.filter((e) => e.target === p.id && e.kind === "owns").map((e) => e.source);
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

export type MapHealthBand = "healthy" | "fair" | "at_risk" | "critical";

export interface MapHealthDimension {
  id: string;
  label: string;
  score: number;
  weight: number;
  hint: string;
}

export interface MapHealthReport {
  score: number;
  band: MapHealthBand;
  bandLabel: string;
  summary: string;
  dimensions: MapHealthDimension[];
  issueCount: { errors: number; warns: number; infos: number };
  hotProcesses: number;
  unownedProcesses: number;
  processCount: number;
  avgHeat: number;
  customized: boolean;
}

// Reads against the shared HEALTH_SCALE so the map, COSO, and segregation
// indices band on the same cutoffs.
const HEALTH_BANDS: { min: number; band: MapHealthBand; label: string; summary: string }[] = [
  {
    min: HEALTH_SCALE.strong,
    band: "healthy",
    label: "Healthy",
    summary: "Well-owned and controlled — a few targeted fixes will sharpen scoring.",
  },
  {
    min: HEALTH_SCALE.adequate,
    band: "fair",
    label: "Fair",
    summary: "Fixable gaps — assign owners and wire controls on hot processes.",
  },
  {
    min: HEALTH_SCALE.weak,
    band: "at_risk",
    label: "At risk",
    summary: "Several processes need attention before residual risk stabilizes.",
  },
  {
    min: 0,
    band: "critical",
    label: "Critical",
    summary: "Act this week — broken links or unowned hot processes dominate risk.",
  },
];

function healthBand(score: number) {
  return HEALTH_BANDS.find((b) => score >= b.min) ?? HEALTH_BANDS[HEALTH_BANDS.length - 1];
}

/** Composite 0–100 map health score from graph snapshots + validation. Higher is better. */
export function computeMapHealth(
  snapshots: ProcessMapSnapshot[],
  validationIssues: MapValidationIssue[],
  opts: { customized?: boolean } = {},
): MapHealthReport {
  const total = Math.max(1, snapshots.length);
  const errors = validationIssues.filter((i) => i.severity === "error").length;
  const warns = validationIssues.filter((i) => i.severity === "warn").length;
  const infos = validationIssues.filter((i) => i.severity === "info").length;

  const integrity = Math.max(0, 100 - errors * 35 - warns * 8);
  const owned = snapshots.filter((s) => s.owners.length > 0).length;
  const ownership = Math.round((owned / total) * 100);
  const withControls = snapshots.filter((s) => s.process.controlIds.length > 0).length;
  const controls = Math.round((withControls / total) * 100);
  const avgHeat = Math.round(snapshots.reduce((sum, s) => sum + s.heat, 0) / total);
  const calm = Math.max(0, 100 - avgHeat);
  const hotProcesses = snapshots.filter((s) => s.heat >= HEAT_BANDS.hot).length;
  const unownedProcesses = total - owned;

  const dimensions: MapHealthDimension[] = [
    {
      id: "integrity",
      label: "Integrity",
      score: integrity,
      weight: 0.25,
      hint: errors ? `${errors} structural issue(s)` : "No broken dependencies or cycles",
    },
    {
      id: "ownership",
      label: "Ownership",
      score: ownership,
      weight: 0.2,
      hint: unownedProcesses
        ? `${unownedProcesses} process(es) unowned`
        : "Every process has an owner",
    },
    {
      id: "controls",
      label: "Controls",
      score: controls,
      weight: 0.25,
      hint:
        withControls < total
          ? `${total - withControls} without controls`
          : "Controls mapped across the stream",
    },
    {
      id: "calm",
      label: "Heat",
      score: calm,
      weight: 0.3,
      hint: hotProcesses
        ? `${hotProcesses} hot process(es) · avg ${avgHeat}`
        : `Average heat ${avgHeat}`,
    },
  ];

  const score = Math.round(dimensions.reduce((sum, d) => sum + d.score * d.weight, 0));
  const band = healthBand(score);

  return {
    score,
    band: band.band,
    bandLabel: band.label,
    summary: band.summary,
    dimensions,
    issueCount: { errors, warns, infos },
    hotProcesses,
    unownedProcesses,
    processCount: total,
    avgHeat,
    customized: opts.customized ?? false,
  };
}
