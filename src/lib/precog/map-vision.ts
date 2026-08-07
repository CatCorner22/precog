/**
 * Map vision modes: Risk Predator (thermal) + Risk Terminator (threat scan).
 * Priority scoring for process / control nodes.
 */

export type MapVisionMode = "standard" | "predator" | "terminator";

export type MapLayerId =
  | "process"
  | "risk"
  | "idea"
  | "waste"
  | "control"
  | "knowledge"
  | "person"
  | "depends";

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
    description: "Value-stream steps — always primary targets",
  },
  {
    id: "risk",
    label: "Risks",
    visible: true,
    interactive: true,
    description: "Severity × likelihood tags",
  },
  {
    id: "control",
    label: "SoD / controls",
    visible: true,
    interactive: true,
    description: "Open control gaps — high predator heat",
  },
  {
    id: "knowledge",
    label: "Knowledge",
    visible: true,
    interactive: true,
    description: "SPOF knowledge nodes",
  },
  {
    id: "depends",
    label: "Dependencies",
    visible: true,
    interactive: true,
    description: "Process→process feed edges (cascade risk)",
  },
  {
    id: "idea",
    label: "Ideas",
    visible: true,
    interactive: false,
    description: "Improvements — visible context, not threat targets",
  },
  {
    id: "waste",
    label: "Lean waste",
    visible: false,
    interactive: false,
    description: "Muda tags — passive context",
  },
  {
    id: "person",
    label: "Owners",
    visible: true,
    interactive: false,
    description: "People — passive unless you flip interactive",
  },
];

/** Predator thermal: blue (cold) → white-hot (max risk × impact). */
export function predatorThermalColor(heat: number): string {
  const t = Math.max(0, Math.min(1, heat / 100));
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
  white_hot: "WHITE HOT",
  critical: "CRITICAL",
  elevated: "ELEVATED",
  watch: "WATCH",
  cold: "COLD",
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
  const heat = input.heat ?? 0;
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
    Math.min(100, heat * 0.55 + impact * 100 * 0.45 + (heat >= 70 && impact >= 0.7 ? 8 : 0)),
  );

  if (heat >= 70) reasons.push("High thermal heat");
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

export function terminatorScanLines(): string {
  return "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,0,0,0.04) 2px, rgba(255,0,0,0.04) 4px)";
}
