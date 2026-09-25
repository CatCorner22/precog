/**
 * The React Flow node and edge renderers of the process map, and the lane headers drawn over the canvas.
 */
import { type ReactNode } from "react";
import { Handle, Position, useStore, type Node, type NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { type MapGraphNode } from "@/lib/precog/process-graph";
import {
  predatorGlow,
  predatorThermalColor,
  terminatorThreatColor,
  type MapVisionMode,
} from "@/lib/precog/map-vision";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  Lightbulb,
  Network,
  Recycle,
  ShieldAlert,
  User,
  Workflow,
} from "lucide-react";
import {
  asMapNode,
  heatColorStandard,
  UNSCORED_ACCENT,
} from "@/components/precog/process-map/style";

export type ProcessFlowNode = Node<
  MapGraphNode & {
    vision: MapVisionMode;
    interactive: boolean;
    priority?: number;
    immediate?: boolean;
    /** A starter process nobody has assessed: drawn without heat or priority. */
    unscored?: boolean;
  } & Record<string, unknown>
>;

function nodeAccent(vision: MapVisionMode, heat: number, priority: number): string {
  if (vision === "predator") return predatorThermalColor(Math.max(heat, priority));
  if (vision === "terminator") return terminatorThreatColor(priority);
  return heatColorStandard(heat);
}

/** Below this zoom the canvas is an overview: cards drop detail and scale their title up so names stay legible. */
const COMPACT_ZOOM = 0.6;

function useCanvasZoom(): number {
  return useStore((s) => s.transform[2]);
}

/** Title size that reads at any zoom: grows as the viewport zooms out, capped so cards do not explode. */
function compactTitlePx(zoom: number): number {
  return Math.min(30, Math.max(14, Math.round(14 / Math.max(zoom, 0.25))));
}

function ProcessNodeView({ data, selected }: NodeProps<ProcessFlowNode>) {
  const d = asMapNode(data);
  const vision = d.vision ?? "standard";
  const heat = d.severity ?? 0;
  const priority = d.priority ?? heat;
  const accent = d.unscored ? UNSCORED_ACCENT : nodeAccent(vision, heat, priority);
  const interactive = d.interactive !== false;
  const hot = !d.unscored && vision === "predator" && priority >= 72;
  const locked = !d.unscored && vision === "terminator" && (d.immediate || priority >= 78);
  const zoom = useCanvasZoom();
  const compact = zoom < COMPACT_ZOOM;

  return (
    <div
      className={cn(
        "min-w-[180px] max-w-[220px] rounded-xl border-2 px-3 py-2 shadow-lg transition-all",
        vision === "predator" ? "bg-black/70 text-white" : "bg-elevated",
        vision === "terminator" && "bg-black/80",
        selected && "ring-2 ring-primary/40",
        // Greyed and dashed while its layer is not interactive; the text stays readable.
        !interactive && "border-dashed grayscale",
        hot && "predator-node-hot",
        locked && "terminator-target",
      )}
      style={{
        borderColor: accent,
        boxShadow:
          vision === "predator" && !d.unscored
            ? predatorGlow(priority)
            : vision === "terminator" && locked
              ? undefined
              : undefined,
        pointerEvents: interactive ? "auto" : "none",
      }}
    >
      <Handle type="target" position={Position.Left} className="!bg-primary" />
      {!compact && (
        <div
          className={cn(
            "flex items-center gap-1.5 text-xs tracking-wide uppercase",
            vision === "terminator" ? "terminator-hud" : "text-subtle",
            vision === "predator" && "predator-hud text-orange-200/90",
          )}
        >
          <Workflow className="size-3" />
          {d.unscored
            ? "starter · not assessed"
            : vision === "predator"
              ? `THERMAL ${priority}`
              : vision === "terminator"
                ? `THREAT ${priority}`
                : `process · ${heat}`}
        </div>
      )}
      <p
        className={cn(
          "font-semibold leading-tight",
          compact ? "py-1" : "mt-1 text-sm",
          vision === "terminator" ? "text-red-300" : "text-fg",
          vision === "predator" && "text-white",
        )}
        style={compact ? { fontSize: compactTitlePx(zoom) } : undefined}
      >
        {d.label}
      </p>
      {!compact && (
        <p
          className={cn(
            "mt-1 line-clamp-2 text-xs",
            vision === "terminator" ? "text-red-400/80" : "text-muted",
            vision === "predator" && "text-white/70",
          )}
        >
          {d.subtitle}
        </p>
      )}
      {!compact && (d.badges ?? []).length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {(d.badges ?? []).slice(0, 3).map((b) => (
            <span
              key={b}
              className={cn(
                "rounded px-1.5 py-0.5 text-xs",
                vision === "predator"
                  ? "bg-white/10 text-white/80"
                  : vision === "terminator"
                    ? "bg-red-950 text-red-300"
                    : "bg-surface text-muted",
              )}
            >
              {b}
            </span>
          ))}
        </div>
      )}
      <Handle type="source" position={Position.Right} className="!bg-primary" />
    </div>
  );
}

function SatelliteNode({
  data,
  selected,
  icon,
  accentDefault,
}: NodeProps<ProcessFlowNode> & { icon: ReactNode; accentDefault: string }) {
  const d = asMapNode(data);
  const vision = d.vision ?? "standard";
  const heat = d.severity ?? 40;
  const priority = d.priority ?? heat;
  const accent = d.unscored
    ? UNSCORED_ACCENT
    : vision === "standard"
      ? accentDefault
      : nodeAccent(vision, heat, priority);
  const interactive = d.interactive !== false;
  const locked = !d.unscored && vision === "terminator" && (d.immediate || priority >= 78);
  const compact = useCanvasZoom() < COMPACT_ZOOM;

  return (
    <div
      className={cn(
        "min-w-[140px] max-w-[180px] rounded-lg border px-2.5 py-1.5 shadow",
        vision === "predator" ? "bg-black/65" : "bg-surface",
        vision === "terminator" && "bg-black/75",
        selected && "ring-2 ring-primary/40",
        // Greyed and dashed while its layer is not interactive; the text stays readable.
        !interactive && "border-dashed grayscale",
        !d.unscored && priority >= 72 && vision === "predator" && "predator-node-hot",
        locked && "terminator-target",
      )}
      style={{
        borderColor: accent,
        boxShadow: vision === "predator" && !d.unscored ? predatorGlow(priority * 0.85) : undefined,
        pointerEvents: interactive ? "auto" : "none",
      }}
    >
      <Handle type="target" position={Position.Left} className="!bg-muted" />
      <div
        className={cn(
          "flex items-center gap-1 text-xs",
          vision === "terminator" ? "terminator-hud" : "text-subtle",
          vision === "predator" && "predator-hud text-orange-100/80",
        )}
      >
        {icon}
        {d.kind}
        {vision !== "standard" && !d.unscored && (
          <span className="ml-auto tabular">{priority}</span>
        )}
      </div>
      <p
        className={cn(
          "mt-0.5 text-xs font-medium leading-snug",
          vision === "terminator" ? "text-red-200" : "text-fg",
          vision === "predator" && "text-white",
        )}
      >
        {d.label}
      </p>
      {d.subtitle && !compact && (
        <p
          className={cn(
            "mt-0.5 line-clamp-2 text-xs",
            vision === "terminator" ? "text-red-400/70" : "text-muted",
            vision === "predator" && "text-white/65",
          )}
        >
          {d.subtitle}
        </p>
      )}
      <Handle type="source" position={Position.Right} className="!bg-muted" />
    </div>
  );
}

function RiskNode(props: NodeProps<ProcessFlowNode>) {
  return (
    <SatelliteNode
      {...props}
      icon={<AlertTriangle className="size-3 text-danger" />}
      accentDefault="var(--color-danger)"
    />
  );
}
function IdeaNode(props: NodeProps<ProcessFlowNode>) {
  return (
    <SatelliteNode
      {...props}
      icon={<Lightbulb className="size-3 text-warn" />}
      accentDefault="var(--color-warn)"
    />
  );
}
function WasteNode(props: NodeProps<ProcessFlowNode>) {
  return (
    <SatelliteNode
      {...props}
      icon={<Recycle className="size-3 text-muted" />}
      accentDefault="var(--color-border-strong)"
    />
  );
}
function ControlNode(props: NodeProps<ProcessFlowNode>) {
  return (
    <SatelliteNode
      {...props}
      icon={<ShieldAlert className="size-3 text-danger" />}
      accentDefault="var(--color-danger)"
    />
  );
}
function KnowledgeNode(props: NodeProps<ProcessFlowNode>) {
  return (
    <SatelliteNode
      {...props}
      icon={<Network className="size-3 text-primary" />}
      accentDefault="var(--color-primary)"
    />
  );
}
function PersonNode(props: NodeProps<ProcessFlowNode>) {
  return (
    <SatelliteNode
      {...props}
      icon={<User className="size-3 text-ok" />}
      accentDefault="var(--color-ok)"
    />
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- the React Flow registry of the node renderers above.
export const nodeTypes = {
  process: ProcessNodeView,
  risk: RiskNode,
  idea: IdeaNode,
  waste: WasteNode,
  control: ControlNode,
  knowledge: KnowledgeNode,
  person: PersonNode,
};

/**
 * Stage headers pinned to the top edge of the canvas, tracking each lane's x as
 * the user pans and zooms. Screen-space so they stay 11px at any zoom.
 */
export function LaneHeaders({ lanes }: { lanes: { stage: number; x: number; count: number }[] }) {
  const [tx, , zoom] = useStore((s) => s.transform);
  const width = useStore((s) => s.width);
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-[72px] z-[4] h-8">
      {lanes.map((lane) => {
        const left = lane.x * zoom + tx;
        if (left < -160 || left > width + 20) return null;
        return (
          <div
            key={lane.stage}
            className="absolute top-1.5 rounded-md border border-border/60 bg-surface/85 px-2 py-0.5 text-xs font-medium tracking-wide text-muted uppercase"
            style={{ left }}
          >
            Stage {lane.stage} · {lane.count}
          </div>
        );
      })}
    </div>
  );
}
