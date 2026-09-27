/**
 * The map's three views (standard, heat and priority; the code keeps the
 * older ids "predator" and "terminator" for the last two), its layers, and
 * the priority scoring for process, risk, control and knowledge cards.
 */
import { type MapGraphNode, type ProcessMapSnapshot } from "./process-graph";
import { HEAT_BANDS } from "./scoring/bands";
import { clamp } from "./number";

export type MapVisionMode = "standard" | "predator" | "terminator";

export type MapLayerId =
  "process" | "risk" | "idea" | "waste" | "control" | "knowledge" | "person" | "depends";

export interface LayerConfig {
  id: MapLayerId;
  label: string;
  /** Whether edges/nodes of this layer are shown */
  visible: boolean;
  /**
   * Interactive layers receive clicks, glow, and priority ranking.
   * Passive layers are dimmed and non-targetable (visual context only).
   */
  interactive: boolean;
  description: string;
}

export const DEFAULT_LAYERS: LayerConfig[] = [
  {
    id: "process",
    label: "Processes",
    visible: true,
    interactive: true,
    description: "The steps your business runs, in stage order",
  },
  {
    id: "risk",
    label: "Risks",
    visible: true,
    interactive: true,
    description: "Risks on each process, sized by severity and likelihood",
  },
  {
    id: "control",
    label: "SoD / controls",
    visible: true,
    interactive: true,
    description: "Duties one person holds that should be split",
  },
  {
    id: "knowledge",
    label: "Knowledge",
    visible: true,
    interactive: true,
    description: "Know-how only one person holds",
  },
  {
    id: "depends",
    label: "Dependencies",
    visible: true,
    interactive: true,
    description: "Which process feeds which; a stall spreads along these",
  },
  {
    id: "idea",
    label: "Ideas",
    visible: true,
    interactive: false,
    description: "Improvement ideas; shown for context, not ranked",
  },
  {
    id: "waste",
    label: "Lean waste",
    visible: false,
    interactive: false,
    description: "Lean waste: delays and rework you tagged",
  },
  {
    id: "person",
    label: "Owners",
    visible: true,
    interactive: false,
    description: "Who owns each process; tick clickable to select them",
  },
];

/** Predator thermal: blue (cold) → white-hot (max risk × impact). */
export function predatorThermalColor(heat: number): string {
  const t = clamp(heat / 100, 0, 1);
  // Stops: deep blue, cyan, green, yellow, orange, red, white
  const stops: [number, [number, number, number]][] = [
    [0, [20, 40, 120]],
    [0.2, [30, 100, 180]],
    [0.35, [20, 160, 140]],
    [0.5, [180, 190, 40]],
    [0.65, [230, 140, 20]],
    [0.8, [230, 50, 30]],
    [0.92, [255, 180, 160]],
    [1, [255, 255, 255]],
  ];
  let i = 0;
  while (i < stops.length - 1 && t > stops[i + 1][0]) i++;
  const [t0, c0] = stops[i];
  const [t1, c1] = stops[Math.min(i + 1, stops.length - 1)];
  const u = t1 === t0 ? 0 : (t - t0) / (t1 - t0);
  const r = Math.round(c0[0] + (c1[0] - c0[0]) * u);
  const g = Math.round(c0[1] + (c1[1] - c0[1]) * u);
  const b = Math.round(c0[2] + (c1[2] - c0[2]) * u);
  return `rgb(${r}, ${g}, ${b})`;
}

export function predatorGlow(heat: number): string {
  const c = predatorThermalColor(heat);
  const intensity = heat >= 80 ? 28 : heat >= 60 ? 18 : heat >= 40 ? 12 : 6;
  return `0 0 ${intensity}px ${c}, 0 0 ${intensity * 2}px ${c}`;
}

/** Terminator HUD red-scale. */
export function terminatorThreatColor(priority: number): string {
  if (priority >= 85) return "rgb(255, 40, 40)";
  if (priority >= 70) return "rgb(220, 60, 40)";
  if (priority >= 50) return "rgb(180, 70, 50)";
  if (priority >= 30) return "rgb(120, 50, 45)";
  return "rgb(60, 30, 30)";
}

export type PriorityBand = "white_hot" | "critical" | "elevated" | "watch" | "cold";

export function priorityBand(score: number): PriorityBand {
  if (score >= 88) return "white_hot";
  if (score >= 72) return "critical";
  if (score >= 55) return "elevated";
  if (score >= 35) return "watch";
  return "cold";
}

export const PRIORITY_BAND_LABEL: Record<PriorityBand, string> = {
  white_hot: "Fix first",
  critical: "Fix soon",
  elevated: "Worth doing",
  watch: "Watch",
  cold: "Fine for now",
};

export interface PriorityTarget {
  id: string;
  kind: string;
  label: string;
  processId?: string;
  /** 0–100 composite priority */
  priority: number;
  band: PriorityBand;
  heat: number;
  impactHint: string;
  reasons: string[];
  immediate: boolean;
}

/**
 * Composite priority = heat (likelihood/control pressure) × impact weight.
 * White-hot only when both heat and realistic impact are high.
 */
export function scorePriority(input: {
  heat: number;
  kind: string;
  residualScore?: number | null;
  riskSeverity?: number;
  riskLikelihood?: number;
  soleOwner?: boolean;
  controlOpen?: boolean;
  dependencyCount?: number;
}): { priority: number; reasons: string[]; impactHint: string; immediate: boolean } {
  const { heat } = input;
  let impact = 0.45;
  const reasons: string[] = [];

  if (input.kind === "process") {
    impact = 0.55 + Math.min(0.25, (input.dependencyCount ?? 0) * 0.06);
    if ((input.residualScore ?? 0) >= 60) {
      impact += 0.12;
      reasons.push("High residual on process path");
    }
  }
  if (input.kind === "risk") {
    const sev = input.riskSeverity ?? 3;
    const lik = input.riskLikelihood ?? 3;
    impact = 0.4 + sev * 0.08 + lik * 0.04;
    reasons.push(`Risk S${sev}×L${lik}`);
  }
  if (input.kind === "control" || input.controlOpen) {
    impact = Math.max(impact, 0.72);
    reasons.push("Open control / SoD gap");
  }
  if (input.soleOwner || input.kind === "knowledge") {
    impact = Math.max(impact, 0.65);
    if (input.soleOwner) reasons.push("Knowledge SPOF");
  }

  impact = Math.min(1, impact);
  const priority = Math.round(
    Math.max(
      0,
      Math.min(
        100,
        heat * 0.55 + impact * 100 * 0.45 + (heat >= HEAT_BANDS.hot && impact >= 0.7 ? 8 : 0),
      ),
    ),
  );

  if (heat >= HEAT_BANDS.hot) reasons.push("High thermal heat");
  if (impact >= 0.7) reasons.push("High realistic impact");

  const immediate = priority >= 78 && impact >= 0.6;
  const impactHint =
    impact >= 0.75
      ? "High $ / fraud / continuity impact if it fires"
      : impact >= 0.55
        ? "Material operational or financial impact"
        : "Contained impact · monitor";

  return { priority, reasons, impactHint, immediate };
}

/**
 * The priority stack: every scored process, and its risks, open control gaps
 * and sole-holder knowledge, ranked by composite priority (highest first).
 * `isScored` leaves out processes the map does not score (untouched starter
 * processes, or everything before the map is assessed) with their cards.
 * Risk and control heat is read from the graph's own card, so the stack and
 * the canvas show one number for one card.
 */
export function buildPriorityTargets(
  graph: { nodes: MapGraphNode[]; snapshots: ProcessMapSnapshot[] },
  isScored: (processId: string) => boolean,
): PriorityTarget[] {
  const cardHeat = new Map(graph.nodes.map((n) => [n.id, n.severity ?? 0]));
  const targets: PriorityTarget[] = [];
  const push = (
    base: Pick<PriorityTarget, "id" | "kind" | "label" | "processId" | "heat">,
    scored: ReturnType<typeof scorePriority>,
  ) =>
    targets.push({
      ...base,
      priority: scored.priority,
      band: priorityBand(scored.priority),
      impactHint: scored.impactHint,
      reasons: scored.reasons,
      immediate: scored.immediate,
    });

  for (const snap of graph.snapshots) {
    const processId = snap.process.id;
    if (!isScored(processId)) continue;
    push(
      { id: processId, kind: "process", label: snap.process.name, processId, heat: snap.heat },
      scorePriority({
        heat: snap.heat,
        kind: "process",
        residualScore: snap.residualScore,
        dependencyCount: snap.process.dependencies?.length ?? 0,
        controlOpen: snap.controlGaps.some((c) => !c.segregated),
      }),
    );
    for (const r of snap.risks) {
      const heat = cardHeat.get(`${processId}::risk::${r.id}`) ?? 0;
      push(
        { id: r.id, kind: "risk", label: r.title, processId, heat },
        scorePriority({
          heat,
          kind: "risk",
          riskSeverity: r.severity,
          riskLikelihood: r.likelihood,
        }),
      );
    }
    for (const c of snap.controlGaps.filter((x) => !x.segregated)) {
      const heat = cardHeat.get(`${processId}::ctrl::${c.id}`) ?? 0;
      push(
        { id: c.id, kind: "control", label: c.name, processId, heat },
        scorePriority({ heat, kind: "control", controlOpen: true }),
      );
    }
    for (const k of snap.knowledgeItems.filter((x) => x.soleOwner)) {
      push(
        { id: k.id, kind: "knowledge", label: k.name, processId, heat: k.riskScore },
        scorePriority({ heat: k.riskScore, kind: "knowledge", soleOwner: true }),
      );
    }
  }
  return targets.sort((a, b) => b.priority - a.priority);
}
