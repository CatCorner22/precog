import { HEAT_BANDS, type MapGraphNode } from "@/lib/precog/process-graph";
import type { MapLayerId, MapVisionMode } from "@/lib/precog/map-vision";

/** Colours and lookups the process map's renderers share; no React here. */
export function asMapNode(data: unknown): MapGraphNode & {
  vision?: MapVisionMode;
  interactive?: boolean;
  priority?: number;
  immediate?: boolean;
  unscored?: boolean;
} {
  return data as MapGraphNode & {
    vision?: MapVisionMode;
    interactive?: boolean;
    priority?: number;
    immediate?: boolean;
    unscored?: boolean;
  };
}

/** Border for a starter process or item nobody has assessed: no heat colour. */
export const UNSCORED_ACCENT = "var(--color-border-strong)";

export function heatColorStandard(sev?: number) {
  const s = sev ?? 0;
  if (s >= HEAT_BANDS.hot) return "var(--color-danger)";
  if (s >= HEAT_BANDS.warm) return "var(--color-warn)";
  if (s >= 25) return "var(--color-primary)";
  return "var(--color-border-strong)";
}

export const EDGE_STYLE: Record<string, { stroke: string; dashed?: boolean }> = {
  depends: { stroke: "var(--color-primary)" },
  has_risk: { stroke: "var(--color-danger)" },
  has_idea: { stroke: "var(--color-warn)", dashed: true },
  has_waste: { stroke: "var(--color-muted)", dashed: true },
  control: { stroke: "var(--color-danger)" },
  knowledge: { stroke: "var(--color-primary)", dashed: true },
  owns: { stroke: "var(--color-ok)" },
  feeds: { stroke: "var(--color-primary)" },
};

export function layerForKind(kind: string): MapLayerId {
  if (kind === "depends" || kind === "feeds") return "depends";
  if (
    kind === "process" ||
    kind === "risk" ||
    kind === "idea" ||
    kind === "waste" ||
    kind === "control" ||
    kind === "knowledge" ||
    kind === "person"
  )
    return kind;
  return "process";
}
