/**
 * Process map graph builder — merges processes, SoD, knowledge SPOFs,
 * residuals and ideas into nodes and edges. Validation (process-validation),
 * layout (process-layout) and health (process-health) live beside it; import
 * them from their own modules.
 */
import { findKnowledgeRisks } from "./engine";
import { HEAT_BANDS } from "./scoring/bands";
import type { IndustryTemplate } from "./templates";
import {
  portfolioSummary,
  type ResidualRiskScore,
  type ResidualScope,
} from "./scoring/residual-engine";
import { DEFAULT_WEIGHTS } from "./scoring/weights";
import type { KnowledgeRisk, StaffComposition } from "./types";
import type { ProcessIdea, ProcessNode, ProcessRisk, ProcessWaste } from "./types";

/** Lowercase words of an input or output; "" for a stored value that is not text. */
function normalizeIoToken(s: unknown): string {
  if (typeof s !== "string") return "";
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
    for (const out of listOf(p.outputs)) {
      const tok = normalizeIoToken(out);
      if (tok.length < 3) continue;
      const list = outputIndex.get(tok) ?? [];
      list.push(p.id);
      outputIndex.set(tok, list);
    }
  }

  for (const target of processes) {
    for (const inp of listOf(target.inputs)) {
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

type MapNodeKind = "process" | "risk" | "idea" | "waste" | "control" | "knowledge" | "person";

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

/** The list a stored process field holds, or an empty one when it holds something else. */
function listOf<T>(value: readonly T[] | undefined): readonly T[] {
  return Array.isArray(value) ? value : [];
}

function isObject<T>(value: T): value is T & object {
  return typeof value === "object" && value !== null;
}

/** 4–100; 0 for a risk whose levels are not numbers. */
function riskHeat(r: ProcessRisk) {
  const heat = r.severity * r.likelihood * 4;
  return Number.isFinite(heat) ? heat : 0;
}

/**
 * What enrichProcess reads from the whole business. buildProcessMapGraph
 * computes it once for every process; a single call computes its own.
 */
interface ProcessMapContext {
  knowledgeRisks: KnowledgeRisk[];
  residualRows: ResidualRiskScore[];
}

/**
 * Pass the profile's `residualScope` so the map's residual rows are the
 * Residual page's: the scenarios the owner confirmed, priced at their settings.
 */
export function processMapContext(
  tpl: IndustryTemplate,
  staff?: StaffComposition,
  scope: ResidualScope = {},
): ProcessMapContext {
  return {
    knowledgeRisks: findKnowledgeRisks(tpl),
    residualRows: portfolioSummary(tpl, staff, DEFAULT_WEIGHTS, scope).all,
  };
}

export function enrichProcess(
  tpl: IndustryTemplate,
  process: ProcessNode,
  staff?: StaffComposition,
  context: ProcessMapContext = processMapContext(tpl, staff),
): ProcessMapSnapshot {
  const { controls, knowledge, people, scenarios } = tpl;
  // Objects only: profile-entries rebuilds a business's own lists, and this
  // keeps any other source of a damaged list from throwing below.
  const risks = listOf(process.risks).filter(isObject);
  const ideas = listOf(process.ideas).filter(isObject);
  const wastes = listOf(process.wastes).filter(isObject);
  const controlGaps = process.controlIds
    .map((id) => controls.find((c) => c.id === id))
    .filter(Boolean)
    .map((c) => ({
      id: c!.id,
      name: c!.name,
      segregated: c!.segregated,
      residualRiskAccepted: c!.residualRiskAccepted,
    }));

  const kRisks = context.knowledgeRisks;
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

  const linkedScenarios = scenarios
    .filter(
      (s) =>
        (s.controlId && process.controlIds.includes(s.controlId)) ||
        (s.knowledgeId && knowledgeItems.some((k) => k.id === s.knowledgeId)),
    )
    .map((s) => ({ id: s.id, title: s.title }));

  // The residual rows this process is linked to by id: its controls, its
  // register items and the scenarios on them. The worst of them is the
  // process's residual; nothing linked means no residual, never a row that
  // merely shares a word with the process name.
  const linkedRowIds = new Set([
    ...process.controlIds.map((id) => `ctrl-${id}`),
    ...knowledgeItems.map((k) => `know-${k.id}`),
    ...linkedScenarios.map((s) => `scen-${s.id}`),
  ]);
  const residualHit = context.residualRows
    .filter((row) => linkedRowIds.has(row.id))
    .reduce<ResidualRiskScore | undefined>(
      (worst, row) => (!worst || row.residual > worst.residual ? row : worst),
      undefined,
    );

  // An owner listed twice (a pasted CSV row) is one owner and one map node.
  const owners = [...new Set(process.ownerPersonIds ?? [])]
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
  scope: ResidualScope = {},
): { nodes: MapGraphNode[]; edges: MapGraphEdge[]; snapshots: ProcessMapSnapshot[] } {
  const showRisks = opts.showRisks ?? true;
  const showIdeas = opts.showIdeas ?? true;
  const showWaste = opts.showWaste ?? true;
  const showKnowledge = opts.showKnowledge ?? true;

  const { processes, knowledge, relations } = tpl;
  const context = processMapContext(tpl, staff, scope);
  const snapshots = processes.map((p) => enrichProcess(tpl, p, staff, context));
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
        subtitle: c.residualRiskAccepted ? "Residual risk accepted" : "Open duty conflict",
        processId: p.id,
        severity: c.residualRiskAccepted ? 55 : 80,
        badges: ["Duty conflict"],
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
  // Feed ids carry their own "feed-" prefix and inferFeedEdges dedupes them.
  edges.push(...inferFeedEdges(processes));

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
