import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTemplate } from "@/lib/precog/use-template";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  useStore,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
  type ReactFlowInstance,
} from "@xyflow/react";
import { toast } from "sonner";
import "@xyflow/react/dist/style.css";
import {
  buildProcessMapGraph,
  enrichProcess,
  graphNodeIdForPriority,
  HEAT_BANDS,
  layoutProcessMap,
  priorityKeyForNode,
  stageLanes,
  type MapGraphNode,
  type ProcessMapSnapshot,
} from "@/lib/precog/process-graph";
import {
  DEFAULT_LAYERS,
  PRIORITY_BAND_LABEL,
  predatorGlow,
  predatorThermalColor,
  priorityBand,
  scorePriority,
  terminatorThreatColor,
  type LayerConfig,
  type MapLayerId,
  type MapVisionMode,
  type PriorityTarget,
} from "@/lib/precog/map-vision";
import { usePractice } from "@/lib/precog/practice-context";
import {
  mapAssessed,
  mapNotAssessedNote,
  mapSource,
  starterMapFacts,
  untouchedStarterProcessIds,
} from "@/lib/precog/builder/map-state";
import { ProcessBuilder } from "@/components/precog/process-builder";
import { ExportMapImageButton } from "@/components/precog/export-map-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  Crosshair,
  Eye,
  Hammer,
  LayoutGrid,
  Layers,
  Lightbulb,
  ListOrdered,
  Network,
  Recycle,
  Scan,
  ShieldAlert,
  Thermometer,
  User,
  Workflow,
} from "lucide-react";
import type { NavFn } from "@/lib/precog/navigation";

type ProcessFlowNode = Node<
  MapGraphNode & {
    vision: MapVisionMode;
    interactive: boolean;
    priority?: number;
    immediate?: boolean;
    /** A starter process nobody has assessed: drawn without heat or priority. */
    unscored?: boolean;
  } & Record<string, unknown>
>;

function asMapNode(data: unknown): MapGraphNode & {
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
const UNSCORED_ACCENT = "var(--color-border-strong)";

function heatColorStandard(sev?: number) {
  const s = sev ?? 0;
  if (s >= HEAT_BANDS.hot) return "var(--color-danger)";
  if (s >= HEAT_BANDS.warm) return "var(--color-warn)";
  if (s >= 25) return "var(--color-primary)";
  return "var(--color-border-strong)";
}

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

const nodeTypes = {
  process: ProcessNodeView,
  risk: RiskNode,
  idea: IdeaNode,
  waste: WasteNode,
  control: ControlNode,
  knowledge: KnowledgeNode,
  person: PersonNode,
};

const EDGE_STYLE: Record<string, { stroke: string; dashed?: boolean }> = {
  depends: { stroke: "var(--color-primary)" },
  has_risk: { stroke: "var(--color-danger)" },
  has_idea: { stroke: "var(--color-warn)", dashed: true },
  has_waste: { stroke: "var(--color-muted)", dashed: true },
  control: { stroke: "var(--color-danger)" },
  knowledge: { stroke: "var(--color-primary)", dashed: true },
  owns: { stroke: "var(--color-ok)" },
  feeds: { stroke: "var(--color-primary)" },
};

function layerForKind(kind: string): MapLayerId {
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

/**
 * Stable identity matters: React Flow syncs this prop into its store on every
 * render, and a fresh object would overwrite the options queued by focusOn().
 */
const FIT_ALL_OPTIONS = { padding: 0.15 } as const;

/**
 * Stage headers pinned to the top edge of the canvas, tracking each lane's x as
 * the user pans and zooms. Screen-space so they stay 11px at any zoom.
 */
function LaneHeaders({ lanes }: { lanes: { stage: number; x: number; count: number }[] }) {
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

export function ProcessMap({
  onNavigate,
  initialProcessId,
  initialBuild = false,
}: {
  onNavigate?: NavFn;
  initialProcessId?: string | null;
  initialBuild?: boolean;
}) {
  const tpl = useTemplate();
  const { processes } = tpl;
  const { profile, setMapLayout, setCustomProcesses, mapCustomized, undoMap, redoMap } =
    usePractice();
  const [vision, setVision] = useState<MapVisionMode>("standard");
  const [build, setBuild] = useState(initialBuild);
  const [showLayerPanel, setShowLayerPanel] = useState(!initialBuild);
  /** Live positions while dragging; committed to the profile on drag stop. */
  const [liveLayout, setLiveLayout] = useState<Record<string, { x: number; y: number }>>({});
  // Measured node sizes. The nodes are controlled, so React Flow's size
  // reports must be written back onto them; without sizes the minimap draws
  // no nodes at all.
  const [measured, setMeasured] = useState<Record<string, { width: number; height: number }>>({});
  const [layers, setLayers] = useState<LayerConfig[]>(() => DEFAULT_LAYERS.map((l) => ({ ...l })));
  const [selectedId, setSelectedId] = useState<string | null>(
    initialProcessId ?? processes[0]?.id ?? null,
  );
  const [focusProcessId, setFocusProcessId] = useState<string | null>(
    initialProcessId ?? processes[0]?.id ?? null,
  );

  useEffect(() => {
    if (initialProcessId) {
      setSelectedId(initialProcessId);
      setFocusProcessId(initialProcessId);
    }
  }, [initialProcessId]);

  const layerMap = useMemo(() => {
    const m = new Map<MapLayerId, LayerConfig>();
    for (const l of layers) m.set(l.id, l);
    return m;
  }, [layers]);

  const graphOpts = useMemo(
    () => ({
      showRisks: layerMap.get("risk")?.visible ?? true,
      showIdeas: layerMap.get("idea")?.visible ?? true,
      showWaste: layerMap.get("waste")?.visible ?? false,
      showKnowledge: layerMap.get("knowledge")?.visible ?? true,
    }),
    [layerMap],
  );

  const graph = useMemo(
    () => buildProcessMapGraph(tpl, profile.staff, graphOpts),
    [tpl, profile.staff, graphOpts],
  );
  // Heat, hot counts and ranks describe only processes the owner has worked
  // on: nothing while the map is not assessed, and never a starter process
  // the owner has not touched yet.
  const mapReady = mapAssessed(profile);
  const notAssessedNote = mapNotAssessedNote(profile);
  const starterIds = useMemo(
    () =>
      untouchedStarterProcessIds({
        industry: profile.industry,
        customPeople: profile.customPeople,
        customProcesses: profile.customProcesses,
      }),
    [profile.industry, profile.customPeople, profile.customProcesses],
  );
  const isScored = useCallback(
    (processId: string | undefined) => mapReady && !(processId && starterIds.has(processId)),
    [mapReady, starterIds],
  );

  // Keep the selection valid when the template or custom map changes.
  useEffect(() => {
    if (selectedId && !graph.nodes.some((n) => n.id === selectedId)) {
      const first = processes[0]?.id ?? null;
      setSelectedId(first);
      setFocusProcessId(first);
    }
  }, [graph.nodes, processes, selectedId]);

  const pinned = useMemo(
    () => ({ ...(profile.mapLayout ?? {}), ...liveLayout }),
    [profile.mapLayout, liveLayout],
  );

  /** Nodes on the canvas after layer toggles; the layout only reserves room for what is shown. */
  const visibleNodes = useMemo(
    () =>
      graph.nodes.filter((n) => {
        const layer = layerMap.get(layerForKind(n.kind));
        if (n.kind === "person" && !(layerMap.get("person")?.visible ?? true)) return false;
        if (n.kind === "control" && !(layerMap.get("control")?.visible ?? true)) return false;
        return layer?.visible !== false;
      }),
    [graph.nodes, layerMap],
  );

  const positions = useMemo(
    () => layoutProcessMap(visibleNodes, graph.edges, pinned),
    [visibleNodes, graph.edges, pinned],
  );

  const lanes = useMemo(() => stageLanes(visibleNodes, positions), [visibleNodes, positions]);

  const rf = useRef<ReactFlowInstance<ProcessFlowNode, Edge> | null>(null);
  /** Process to frame once the canvas has mounted (deep link from another tab). */
  const pendingFocus = useRef<string | null>(initialProcessId ?? null);

  /** Zoom to a process and everything wired to it. */
  const focusOn = useCallback(
    (id: string) => {
      const inst = rf.current;
      if (!inst) return;
      const ids = new Set<string>([id]);
      for (const e of graph.edges) {
        if (e.source === id) ids.add(e.target);
        if (e.target === id) ids.add(e.source);
      }
      const nodes = visibleNodes.filter((n) => ids.has(n.id)).map((n) => ({ id: n.id }));
      if (!nodes.length) return;
      void inst.fitView({ nodes, duration: 400, padding: 0.35, maxZoom: 1.2 });
    },
    [graph.edges, visibleNodes],
  );

  const fitAll = useCallback(() => {
    void rf.current?.fitView({ ...FIT_ALL_OPTIONS, duration: 400 });
  }, []);

  /** Drop every hand-placed position and return to stage lanes. */
  const autoArrange = useCallback(() => {
    const pinnedCount = Object.keys(profile.mapLayout ?? {}).length;
    setLiveLayout({});
    setMapLayout({});
    window.requestAnimationFrame(() => fitAll());
    toast.success("Arranged by stage", {
      description: pinnedCount
        ? `${pinnedCount} hand-placed position(s) cleared. Ctrl+Z to put them back.`
        : "Every process sits in its stage lane.",
    });
  }, [profile.mapLayout, setMapLayout, fitAll]);

  /** Processes in reading order: stage lane, then top to bottom. */
  const processOrder = useMemo(
    () =>
      visibleNodes
        .filter((n) => n.kind === "process")
        .map((n) => ({
          id: n.id,
          stage: Number(n.data.stage ?? 0),
          y: positions.get(n.id)?.y ?? 0,
        }))
        .sort((a, b) => a.stage - b.stage || a.y - b.y),
    [visibleNodes, positions],
  );

  // Build-mode keyboard: Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z or Ctrl+Y redo; arrows step between
  // processes (left/right = stage, up/down = within a stage); F frames the selection; Enter edits
  // the name. Never fires inside inputs.
  useEffect(() => {
    if (!build) return;
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable)
      )
        return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod) {
        if (k === "z" && e.shiftKey) {
          e.preventDefault();
          redoMap();
        } else if (k === "z") {
          e.preventDefault();
          undoMap();
        } else if (k === "y") {
          e.preventDefault();
          redoMap();
        }
        return;
      }
      if (e.altKey) return;
      const current = processOrder.findIndex((p) => p.id === focusProcessId);
      const select = (next: { id: string } | undefined) => {
        if (!next) return;
        e.preventDefault();
        setSelectedId(next.id);
        setFocusProcessId(next.id);
        focusOn(next.id);
      };
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        if (!processOrder.length) return;
        if (current < 0) return select(processOrder[0]);
        const here = processOrder[current];
        const dir = e.key === "ArrowRight" ? 1 : -1;
        // Nearest process in the adjacent stage lane, matching vertical position when possible.
        const laneStages = [...new Set(processOrder.map((p) => p.stage))];
        const li = laneStages.indexOf(here.stage) + dir;
        if (li < 0 || li >= laneStages.length) return select(here);
        const lane = processOrder.filter((p) => p.stage === laneStages[li]);
        const target = lane.reduce((best, p) =>
          Math.abs(p.y - here.y) < Math.abs(best.y - here.y) ? p : best,
        );
        return select(target);
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (!processOrder.length) return;
        if (current < 0) return select(processOrder[0]);
        const dir = e.key === "ArrowDown" ? 1 : -1;
        const here = processOrder[current];
        const lane = processOrder.filter((p) => p.stage === here.stage);
        const i = lane.findIndex((p) => p.id === here.id) + dir;
        return select(lane[Math.max(0, Math.min(lane.length - 1, i))]);
      }
      if (k === "f" && focusProcessId) {
        e.preventDefault();
        focusOn(focusProcessId);
        return;
      }
      if (k === "a" && e.shiftKey) {
        e.preventDefault();
        autoArrange();
        return;
      }
      if (e.key === "Enter" && focusProcessId) {
        const field = document.querySelector<HTMLInputElement>('[data-builder-field="name"]');
        if (field) {
          e.preventDefault();
          field.focus();
          field.select();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [build, undoMap, redoMap, processOrder, focusProcessId, focusOn, autoArrange]);

  /** Priority targets for Predator / Terminator + priority list */
  const priorities: PriorityTarget[] = useMemo(() => {
    const targets: PriorityTarget[] = [];
    for (const snap of graph.snapshots.filter((s) => isScored(s.process.id))) {
      const depCount = snap.process.dependencies?.length ?? 0;
      const scored = scorePriority({
        heat: snap.heat,
        kind: "process",
        residualScore: snap.residualScore,
        dependencyCount: depCount,
        controlOpen: snap.controlGaps.some((c) => !c.segregated),
      });
      targets.push({
        id: snap.process.id,
        kind: "process",
        label: snap.process.name,
        processId: snap.process.id,
        priority: scored.priority,
        band: priorityBand(scored.priority),
        heat: snap.heat,
        impactHint: scored.impactHint,
        reasons: scored.reasons,
        immediate: scored.immediate,
      });
      for (const r of snap.risks) {
        const heat = r.severity * r.likelihood * 4;
        const s = scorePriority({
          heat,
          kind: "risk",
          riskSeverity: r.severity,
          riskLikelihood: r.likelihood,
        });
        targets.push({
          id: r.id,
          kind: "risk",
          label: r.title,
          processId: snap.process.id,
          priority: s.priority,
          band: priorityBand(s.priority),
          heat,
          impactHint: s.impactHint,
          reasons: s.reasons,
          immediate: s.immediate,
        });
      }
      for (const c of snap.controlGaps.filter((x) => !x.segregated)) {
        const s = scorePriority({
          heat: c.residualRiskAccepted ? 55 : 82,
          kind: "control",
          controlOpen: true,
        });
        targets.push({
          id: c.id,
          kind: "control",
          label: c.name,
          processId: snap.process.id,
          priority: s.priority,
          band: priorityBand(s.priority),
          heat: c.residualRiskAccepted ? 55 : 82,
          impactHint: s.impactHint,
          reasons: s.reasons,
          immediate: s.immediate,
        });
      }
      for (const k of snap.knowledgeItems.filter((x) => x.soleOwner)) {
        const s = scorePriority({
          heat: k.riskScore,
          kind: "knowledge",
          soleOwner: true,
        });
        targets.push({
          id: k.id,
          kind: "knowledge",
          label: k.name,
          processId: snap.process.id,
          priority: s.priority,
          band: priorityBand(s.priority),
          heat: k.riskScore,
          impactHint: s.impactHint,
          reasons: s.reasons,
          immediate: s.immediate,
        });
      }
    }
    return targets.sort((a, b) => b.priority - a.priority);
  }, [graph.snapshots, isScored]);

  const priorityById = useMemo(() => {
    const m = new Map<string, PriorityTarget>();
    for (const t of priorities) {
      m.set(t.id, t);
      if (t.processId && t.kind !== "process") {
        m.set(`${t.processId}::${t.kind}::${t.id}`, t);
      }
    }
    return m;
  }, [priorities]);

  const rfNodes: ProcessFlowNode[] = useMemo(() => {
    return visibleNodes.map((n) => {
      const p = positions.get(n.id) ?? { x: 0, y: 0 };
      const layer = layerMap.get(layerForKind(n.kind));
      const pri =
        priorityById.get(n.id) ??
        priorityById.get(
          n.processId && n.kind !== "process"
            ? `${n.processId}::${n.kind}::${priorityKeyForNode(n)}`
            : priorityKeyForNode(n),
        );
      const priority = pri?.priority ?? n.severity ?? 0;
      return {
        id: n.id,
        type: n.kind,
        position: p,
        draggable: build && n.kind === "process",
        connectable: build && n.kind === "process",
        data: {
          ...n,
          vision,
          interactive: layer?.interactive !== false,
          priority,
          immediate: pri?.immediate,
          unscored: !isScored(n.kind === "process" ? n.id : n.processId),
        },
        selected: n.id === selectedId,
        ...(measured[n.id] ? { measured: measured[n.id] } : {}),
      };
    });
  }, [
    visibleNodes,
    positions,
    selectedId,
    vision,
    layerMap,
    priorityById,
    build,
    isScored,
    measured,
  ]);

  const onNodesChange = useCallback((changes: NodeChange<ProcessFlowNode>[]) => {
    const moves: Record<string, { x: number; y: number }> = {};
    const sizes: Record<string, { width: number; height: number }> = {};
    for (const c of changes) {
      if (c.type === "position" && c.position) moves[c.id] = c.position;
      if (c.type === "dimensions" && c.dimensions) sizes[c.id] = c.dimensions;
    }
    if (Object.keys(moves).length) setLiveLayout((l) => ({ ...l, ...moves }));
    if (Object.keys(sizes).length) {
      setMeasured((m) => {
        const changed = Object.entries(sizes).some(
          ([id, d]) => m[id]?.width !== d.width || m[id]?.height !== d.height,
        );
        return changed ? { ...m, ...sizes } : m;
      });
    }
  }, []);

  const onNodeDragStop = useCallback(
    (_: unknown, node: ProcessFlowNode) => {
      setMapLayout((l) => ({ ...l, [node.id]: node.position }));
      setLiveLayout((l) => {
        const next = { ...l };
        delete next[node.id];
        return next;
      });
    },
    [setMapLayout],
  );

  const isValidConnection = useCallback(
    (connection: Connection | Edge) => {
      if (!build || !connection.source || !connection.target) return false;
      if (connection.source === connection.target) return false;
      const source = graph.nodes.find((n) => n.id === connection.source);
      const target = graph.nodes.find((n) => n.id === connection.target);
      return source?.kind === "process" && target?.kind === "process";
    },
    [build, graph.nodes],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      const source = connection.source;
      const target = connection.target;
      setCustomProcesses((cur) => {
        const next = cur.map((p) => {
          if (p.id !== target) return p;
          if (p.dependencies.includes(source)) return p;
          return { ...p, dependencies: [...p.dependencies, source] };
        });
        const targetProc = next.find((p) => p.id === target);
        const sourceProc = next.find((p) => p.id === source);
        if (targetProc && sourceProc) {
          toast.success("Dependency linked", {
            description: `${targetProc.name} now depends on ${sourceProc.name}`,
          });
        }
        return next;
      });
    },
    [setCustomProcesses],
  );

  const onEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      if (!build) return;
      for (const edge of deleted) {
        const ge = graph.edges.find((e) => e.id === edge.id);
        if (ge?.kind !== "depends") continue;
        setCustomProcesses((cur) =>
          cur.map((p) =>
            p.id === ge.target
              ? { ...p, dependencies: p.dependencies.filter((d) => d !== ge.source) }
              : p,
          ),
        );
      }
    },
    [build, graph.edges, setCustomProcesses],
  );

  const rfEdges: Edge[] = useMemo(() => {
    const depInteractive = layerMap.get("depends")?.interactive !== false;
    const depVisible = layerMap.get("depends")?.visible !== false;
    return graph.edges
      .filter((e) => {
        if (e.kind === "depends" || e.kind === "feeds") return depVisible;
        if (e.kind === "has_idea") return layerMap.get("idea")?.visible !== false;
        if (e.kind === "has_waste") return layerMap.get("waste")?.visible !== false;
        if (e.kind === "has_risk" || e.kind === "control")
          return (
            layerMap.get("risk")?.visible !== false || layerMap.get("control")?.visible !== false
          );
        if (e.kind === "knowledge" || e.kind === "owns")
          return (
            layerMap.get("knowledge")?.visible !== false ||
            layerMap.get("person")?.visible !== false
          );
        return true;
      })
      .filter((e) => {
        // hide edges to filtered nodes
        const ids = new Set(rfNodes.map((n) => n.id));
        return ids.has(e.source) && ids.has(e.target);
      })
      .map((e) => {
        const style = EDGE_STYLE[e.kind] ?? EDGE_STYLE.depends;
        const isDep = e.kind === "depends" || e.kind === "feeds";
        let stroke = style.stroke;
        if (vision === "predator") {
          stroke = isDep
            ? predatorThermalColor(50)
            : predatorThermalColor(e.kind === "has_risk" || e.kind === "control" ? 80 : 40);
        } else if (vision === "terminator") {
          stroke =
            e.kind === "has_risk" || e.kind === "control" ? "rgb(255, 50, 40)" : "rgb(120, 40, 35)";
        }
        const passiveDep = isDep && !depInteractive;
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          deletable: build && e.kind === "depends",
          label: vision === "standard" ? e.label : undefined,
          animated: isDep && depInteractive && vision !== "terminator",
          style: {
            stroke,
            strokeWidth: isDep ? 2 : 1.25,
            strokeDasharray: style.dashed || passiveDep ? "4 3" : undefined,
            opacity: passiveDep ? 0.35 : vision === "terminator" ? 0.85 : 1,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: stroke,
            width: 16,
            height: 16,
          },
          labelStyle: { fill: "var(--color-muted)", fontSize: 12 },
          interactionWidth: passiveDep ? 1 : 12,
        };
      });
  }, [graph.edges, vision, layerMap, rfNodes, build]);

  const selectedNode = graph.nodes.find((n) => n.id === selectedId);
  const processId =
    selectedNode?.processId ??
    (selectedNode?.kind === "process" ? selectedNode.id : focusProcessId);
  const snapshot: ProcessMapSnapshot | null = processId
    ? enrichProcess(tpl, processes.find((p) => p.id === processId) ?? processes[0], profile.staff)
    : null;

  const onNodeClick = useCallback((_: unknown, node: ProcessFlowNode) => {
    const d = asMapNode(node.data);
    if (d.interactive === false) return;
    setSelectedId(node.id);
    if (d.kind === "process") setFocusProcessId(d.id);
    else if (d.processId) setFocusProcessId(d.processId);
  }, []);

  const whiteHot = priorities.filter((p) => p.band === "white_hot").length;
  const immediate = priorities.filter((p) => p.immediate).length;
  const hotCount = graph.snapshots.filter(
    (s) => isScored(s.process.id) && s.heat >= HEAT_BANDS.hot,
  ).length;
  const starterLeft = mapSource(profile) === "own" ? starterIds.size : 0;

  function toggleLayer(id: MapLayerId, field: "visible" | "interactive") {
    setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, [field]: !l[field] } : l)));
  }

  function minimapColor(n: Node) {
    const d = asMapNode(n.data);
    const p = d.priority ?? d.severity ?? 0;
    if (vision === "predator") return predatorThermalColor(p);
    if (vision === "terminator") return terminatorThreatColor(p);
    return heatColorStandard(d.severity);
  }

  return (
    <div className="space-y-4">
      <section className="matrix-grid rounded-2xl border border-border bg-surface p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="accent">Interactive process map</Badge>
          <Badge variant="primary">Vision systems online</Badge>
          {mapSource(profile) === "starter" ? (
            <Badge variant="default">Starter map from the {starterMapFacts(profile).example}</Badge>
          ) : starterLeft > 0 ? (
            <Badge variant="default">
              Your map · {starterLeft} of {graph.snapshots.length} processes still from the starter
            </Badge>
          ) : (
            mapCustomized && <Badge variant="ok">Your custom map</Badge>
          )}
        </div>
        <h1 className="mt-3 text-xl font-semibold tracking-tight sm:text-2xl">
          Map your business · see risk light up · fix what matters
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Start from the industry template, then hit <strong className="text-fg">Build</strong> to
          add your own processes, owners, risks, and controls — every edit re-scores residual risk
          live. Switch to <strong className="text-fg">Risk Predator</strong> for thermal priority
          heat or <strong className="text-fg">Risk Terminator</strong> for immediate threat lock-on.
        </p>

        {/* Vision mode switcher */}
        <div className="mt-4 flex flex-wrap gap-2">
          <VisionChip
            active={vision === "standard"}
            onClick={() => setVision("standard")}
            icon={<Eye className="size-3.5" />}
            label="Standard"
          />
          <VisionChip
            active={vision === "predator"}
            onClick={() => setVision("predator")}
            icon={<Thermometer className="size-3.5" />}
            label="Risk Predator"
            accent="predator"
          />
          <VisionChip
            active={vision === "terminator"}
            onClick={() => setVision("terminator")}
            icon={<Crosshair className="size-3.5" />}
            label="Risk Terminator"
            accent="terminator"
          />
          <Button size="sm" variant="secondary" onClick={() => setShowLayerPanel((v) => !v)}>
            <Layers className="size-3.5" />
            Layers
          </Button>
          <Button
            size="sm"
            variant={build ? "default" : "secondary"}
            onClick={() => {
              setBuild((v) => !v);
              if (!build) {
                setVision("standard");
                setShowLayerPanel(false);
              }
            }}
          >
            <Hammer className="size-3.5" />
            {build ? "Building" : "Build"}
          </Button>
        </div>

        {build && (
          <div className="mt-4 rounded-xl border border-accent/30 bg-accent/5 p-3 text-xs text-muted">
            <span className="font-semibold text-fg">Build mode.</span> Drag process boxes to arrange
            your value stream. Drag from the right handle of one process to the left handle of
            another to wire dependencies. Click a process to edit it — or insert a reusable block
            from the builder panel.
          </div>
        )}

        {vision === "predator" && (
          <div className="mt-4 rounded-xl border border-border bg-black/40 p-3 predator-hud">
            <div className="flex flex-wrap items-center gap-3 text-xs text-orange-100/90">
              <Scan className="size-4 text-orange-200" />
              <span className="font-semibold tracking-widest">PREDATOR VISION</span>
              <span className="text-white/50">·</span>
              {mapReady ? (
                <>
                  <span>{whiteHot} WHITE-HOT</span>
                  <span className="text-white/50">·</span>
                  <span>{priorities.filter((p) => p.band === "critical").length} CRITICAL</span>
                </>
              ) : (
                <span>NOT ASSESSED YET</span>
              )}
            </div>
            <div className="predator-thermal-bar mt-2 h-2.5 w-full rounded-full" />
            <div className="mt-1 flex justify-between text-xs text-white/55">
              <span>BLUE · cold</span>
              <span>THERMAL PRIORITY</span>
              <span>WHITE-HOT · act</span>
            </div>
          </div>
        )}

        {vision === "terminator" && (
          <div className="mt-4 flex flex-wrap items-start gap-4 rounded-xl border border-red-900/50 bg-black/50 p-3">
            <T1000Buddy />
            <div className="min-w-0 flex-1 terminator-hud text-xs">
              <p className="font-semibold tracking-widest">RISK TERMINATOR · SCAN MODE</p>
              <p className="mt-1 text-red-300/90 normal-case tracking-normal">
                Friendly unit online. Mission: cut residual to a reasonable degree — not zero, not
                panic.{" "}
                {mapReady
                  ? `Locking ${immediate} immediate threat${immediate === 1 ? "" : "s"}.`
                  : "Nothing to lock on until the map is assessed."}
              </p>
              <p className="mt-2 text-xs text-red-400/70">
                I'll be back… after dual release and bank rec are locked in.
              </p>
            </div>
          </div>
        )}

        <p className="mt-3 text-xs text-subtle">
          {mapReady
            ? `${graph.snapshots.length} processes · ${hotCount} hot · ${priorities.length} ranked targets${
                starterLeft > 0 ? ` · ${starterLeft} starter, not scored` : ""
              } · pan/zoom`
            : `${graph.snapshots.length} processes · not assessed yet · pan/zoom`}
        </p>
        {notAssessedNote && <p className="mt-1 max-w-2xl text-xs text-muted">{notAssessedNote}</p>}
      </section>

      {/* Columns may shrink below their content, so nothing pushes the page sideways on a phone. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-3">
          {showLayerPanel && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Layers className="size-4" />
                  Layer interaction
                </CardTitle>
                <CardDescription>
                  Visible = drawn. Interactive = clickable targets for vision systems.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {layers.map((l) => (
                    <li
                      key={l.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-border bg-elevated px-2.5 py-2 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-fg">{l.label}</p>
                        <p className="truncate text-xs text-subtle">{l.description}</p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <label className="flex items-center gap-1 text-xs text-muted">
                          <input
                            type="checkbox"
                            checked={l.visible}
                            onChange={() => toggleLayer(l.id, "visible")}
                            className="size-3.5 accent-[var(--color-primary)]"
                          />
                          show
                        </label>
                        <label className="flex items-center gap-1 text-xs text-muted">
                          <input
                            type="checkbox"
                            checked={l.interactive}
                            onChange={() => toggleLayer(l.id, "interactive")}
                            disabled={!l.visible}
                            className="size-3.5 accent-[var(--color-accent)]"
                          />
                          interact
                        </label>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <Card className="overflow-hidden p-0">
            <div
              className={cn(
                "relative h-[min(70vh,640px)] w-full bg-panel",
                vision === "predator" && "vision-predator",
                vision === "terminator" && "vision-terminator",
              )}
            >
              {vision === "terminator" && (
                <div className="terminator-scan-sweep absolute inset-x-0 top-0 z-10 h-1/3" />
              )}
              <ReactFlow
                nodes={rfNodes}
                edges={rfEdges}
                nodeTypes={nodeTypes}
                onNodeClick={onNodeClick}
                onNodesChange={onNodesChange}
                onNodeDragStop={onNodeDragStop}
                onConnect={onConnect}
                onEdgesDelete={onEdgesDelete}
                isValidConnection={isValidConnection}
                nodesDraggable={build}
                nodesConnectable={build}
                // Links are keyboard stops only while building, where Delete removes one.
                edgesFocusable={build}
                deleteKeyCode={build ? "Delete" : null}
                onInit={(inst) => {
                  rf.current = inst;
                  if (pendingFocus.current) {
                    const id = pendingFocus.current;
                    pendingFocus.current = null;
                    window.requestAnimationFrame(() => focusOn(id));
                  }
                }}
                fitView
                fitViewOptions={FIT_ALL_OPTIONS}
                minZoom={0.2}
                maxZoom={1.6}
                proOptions={{ hideAttribution: true }}
                defaultEdgeOptions={{ type: "smoothstep" }}
              >
                {vision === "standard" && <LaneHeaders lanes={lanes} />}
                <Background
                  gap={18}
                  size={1}
                  color={
                    vision === "terminator"
                      ? "rgba(255,40,40,0.15)"
                      : vision === "predator"
                        ? "rgba(80,120,200,0.2)"
                        : "var(--color-border)"
                  }
                />
                <Controls showInteractive={false} />
                <MiniMap
                  nodeStrokeWidth={2}
                  pannable
                  zoomable
                  bgColor="rgba(21, 24, 32, 0.92)"
                  maskColor={vision === "terminator" ? "rgba(40,0,0,0.65)" : "rgba(0,0,0,0.55)"}
                  nodeColor={minimapColor}
                />
                {/* Bottom centre: at the top left the legend covered the first stage label. */}
                <Panel position="bottom-center" className="m-2!">
                  {vision === "standard" ? (
                    <StandardLegend />
                  ) : vision === "predator" ? (
                    <PredatorLegend />
                  ) : (
                    <TerminatorLegend immediate={mapReady ? immediate : null} />
                  )}
                </Panel>
                <Panel position="top-right" className="m-2! flex items-center gap-1">
                  {build && (
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={autoArrange}
                        title="Put every process back in its stage lane (Shift+A)"
                      >
                        <LayoutGrid className="size-3.5" /> Arrange
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={!focusProcessId}
                        onClick={() => focusProcessId && focusOn(focusProcessId)}
                        title="Zoom to the selected process and its links (F)"
                      >
                        <Crosshair className="size-3.5" /> Focus
                      </Button>
                    </>
                  )}
                  <ExportMapImageButton
                    fileName={`${(profile.practiceName || "process-map")
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, "-")
                      .replace(/^-+|-+$/g, "")}-map-${vision}`}
                    background={
                      vision === "terminator"
                        ? "#0a0000"
                        : vision === "predator"
                          ? "#05070d"
                          : "#151820"
                    }
                  />
                </Panel>
              </ReactFlow>
            </div>
          </Card>
        </div>

        <div className="min-w-0 space-y-3">
          {build && (
            <ProcessBuilder
              selectedProcessId={processId ?? null}
              onSelectProcess={(id) => {
                setSelectedId(id);
                setFocusProcessId(id);
                focusOn(id);
              }}
              onClose={() => setBuild(false)}
            />
          )}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <ListOrdered className="size-4" />
                Priority stack
              </CardTitle>
              <CardDescription>Heat × realistic impact · white-hot needs both high</CardDescription>
            </CardHeader>
            <CardContent className="max-h-[320px] space-y-1.5 overflow-y-auto">
              {notAssessedNote && <p className="text-xs text-muted">{notAssessedNote}</p>}
              {!notAssessedNote && priorities.length === 0 && starterLeft > 0 && (
                <p className="text-xs text-muted">
                  Every process on the map is still as the starter had it. Assign an owner or edit a
                  process and it is ranked here.
                </p>
              )}
              {priorities.slice(0, 12).map((t, i) => (
                <button
                  key={`${t.kind}-${t.processId ?? ""}-${t.id}`}
                  type="button"
                  onClick={() => {
                    setSelectedId(graphNodeIdForPriority(t, graph.nodes));
                    if (t.processId) setFocusProcessId(t.processId);
                  }}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition-colors hover:border-border-strong",
                    t.immediate ? "border-danger/40 bg-danger/10" : "border-border bg-elevated",
                  )}
                >
                  <span className="w-5 shrink-0 tabular text-subtle">{i + 1}</span>
                  <span
                    className="mt-0.5 size-2.5 shrink-0 rounded-full"
                    style={{
                      background:
                        vision === "terminator"
                          ? terminatorThreatColor(t.priority)
                          : predatorThermalColor(t.priority),
                      boxShadow:
                        t.band === "white_hot"
                          ? `0 0 8px ${predatorThermalColor(t.priority)}`
                          : undefined,
                    }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1">
                      <span className="truncate font-medium text-fg">{t.label}</span>
                      <Badge
                        variant={
                          t.band === "white_hot" || t.band === "critical"
                            ? "danger"
                            : t.band === "elevated"
                              ? "warn"
                              : "default"
                        }
                      >
                        {PRIORITY_BAND_LABEL[t.band]}
                      </Badge>
                      {t.immediate && <Badge variant="danger">NOW</Badge>}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted">
                      {t.kind} · P{t.priority} · {t.impactHint}
                    </span>
                  </span>
                </button>
              ))}
            </CardContent>
          </Card>

          {snapshot ? (
            <ProcessDetail
              snapshot={snapshot}
              selectedNode={selectedNode}
              unscored={!isScored(snapshot.process.id)}
              priority={
                priorityById.get(snapshot.process.id) ??
                priorities.find((p) => p.processId === snapshot.process.id)
              }
              vision={vision}
              onNavigate={onNavigate}
              onSelectProcess={(id) => {
                setSelectedId(id);
                setFocusProcessId(id);
              }}
            />
          ) : (
            <Card>
              <CardContent className="p-4 text-sm text-muted">
                Select a node to inspect.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function VisionChip({
  active,
  onClick,
  icon,
  label,
  accent,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  accent?: "predator" | "terminator";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        active && !accent && "border-primary/40 bg-primary/15 text-fg",
        active && accent === "predator" && "border-orange-400/40 bg-orange-500/15 text-orange-100",
        active && accent === "terminator" && "border-red-500/50 bg-red-600/20 text-red-200",
        !active && "border-border bg-elevated text-muted hover:text-fg",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function T1000Buddy() {
  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      <div className="t1000-buddy relative flex size-16 items-center justify-center">
        {/* Friendly chrome face */}
        <div className="absolute inset-2 rounded-[40%] bg-gradient-to-b from-white/40 to-transparent" />
        <div className="relative z-[1] flex gap-2">
          <span className="size-2 rounded-full bg-red-500/90 shadow-[0_0_6px_#f44]" />
          <span className="size-2 rounded-full bg-red-500/90 shadow-[0_0_6px_#f44]" />
        </div>
        <div className="absolute bottom-4 left-1/2 h-0.5 w-4 -translate-x-1/2 rounded-full bg-red-400/50" />
      </div>
      <span className="text-xs tracking-wide text-red-400/80 uppercase">T-1000 · risk</span>
    </div>
  );
}

function StandardLegend() {
  return (
    <div className="max-w-[220px] rounded-xl border border-border bg-surface/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
      <p className="font-semibold text-fg">Map legend</p>
      <p className="mt-1 text-muted">Border heat: cool → hot (danger)</p>
      <div
        className="mt-1.5 h-1.5 rounded-full"
        style={{
          background:
            "linear-gradient(90deg, var(--color-border-strong), var(--color-primary), var(--color-warn), var(--color-danger))",
        }}
      />
    </div>
  );
}

function PredatorLegend() {
  return (
    <div className="max-w-[240px] rounded-xl border border-orange-500/30 bg-black/80 px-3 py-2 text-xs text-orange-100/90 shadow-lg predator-hud">
      <p className="font-semibold tracking-widest">THERMAL KEY</p>
      <div className="predator-thermal-bar mt-1.5 h-2 rounded-full" />
      <p className="mt-1 text-white/50">White-hot = high heat × high impact. Hunt those first.</p>
    </div>
  );
}

/** `immediate` is null while the map is not assessed: there is nothing to count yet. */
function TerminatorLegend({ immediate }: { immediate: number | null }) {
  return (
    <div className="max-w-[240px] rounded-xl border border-red-800/50 bg-black/85 px-3 py-2 text-xs terminator-hud shadow-lg">
      <p className="font-semibold tracking-widest">THREAT ANALYSIS</p>
      <p className="mt-1 normal-case tracking-normal text-red-300/90">
        {immediate === null
          ? "Not assessed yet: nothing to lock on until the map is assessed."
          : `${immediate} target${immediate === 1 ? " requires" : "s require"} immediate attention. Pulsing lock = act this week.`}
      </p>
    </div>
  );
}

function ProcessDetail({
  snapshot,
  selectedNode,
  unscored,
  priority,
  vision,
  onNavigate,
  onSelectProcess,
}: {
  snapshot: ProcessMapSnapshot;
  selectedNode?: MapGraphNode;
  /** A starter process nobody has assessed: shown without heat or priority. */
  unscored: boolean;
  priority?: PriorityTarget;
  vision: MapVisionMode;
  onNavigate?: NavFn;
  onSelectProcess: (id: string) => void;
}) {
  const { processes } = useTemplate();
  const p = snapshot.process;
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="size-3 rounded-full"
            style={{
              background: unscored
                ? UNSCORED_ACCENT
                : priority
                  ? predatorThermalColor(priority.priority)
                  : heatColorStandard(snapshot.heat),
            }}
          />
          {unscored ? (
            <Badge variant="default">Starter · not assessed</Badge>
          ) : (
            <Badge variant={snapshot.heat >= HEAT_BANDS.hot ? "danger" : "primary"}>
              heat {snapshot.heat}
            </Badge>
          )}
          {priority && (
            <Badge
              variant={priority.immediate || priority.band === "white_hot" ? "danger" : "warn"}
            >
              {PRIORITY_BAND_LABEL[priority.band]} · P{priority.priority}
            </Badge>
          )}
          {vision !== "standard" && <Badge variant="default">{vision}</Badge>}
        </div>
        <CardTitle className="text-base">{p.name}</CardTitle>
        <CardDescription>{p.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {unscored && (
          <p className="text-xs text-muted">
            A starter process from the industry example, as yet untouched. Its risks and notes are
            what such a process usually carries, not findings about your business; assign an owner
            or edit it and it is scored.
          </p>
        )}
        {priority && (
          <div className="rounded-lg border border-border bg-panel px-3 py-2 text-xs">
            <p className="font-medium text-fg">{priority.impactHint}</p>
            <p className="mt-1 text-muted">{priority.reasons.join(" · ")}</p>
          </div>
        )}
        {selectedNode && selectedNode.kind !== "process" && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
            <p className="text-xs tracking-wide text-subtle uppercase">
              Selected · {selectedNode.kind}
            </p>
            <p className="font-medium">{selectedNode.label}</p>
          </div>
        )}
        <div>
          <p className="text-xs font-medium text-subtle uppercase">Flow</p>
          <p className="mt-1 text-xs text-muted">
            <span className="text-fg">In:</span> {(p.inputs ?? []).join(" · ") || "—"}
          </p>
          <p className="text-xs text-muted">
            <span className="text-fg">Out:</span> {(p.outputs ?? []).join(" · ") || "—"}
          </p>
          {p.dependencies.length > 0 && (
            <p className="mt-1 text-xs text-muted">
              Depends on:{" "}
              {p.dependencies.map((d) => (
                <button
                  key={d}
                  type="button"
                  className="mr-1 text-primary underline-offset-2 hover:underline"
                  onClick={() => onSelectProcess(d)}
                >
                  {processes.find((x) => x.id === d)?.name ?? d}
                </button>
              ))}
            </p>
          )}
        </div>
        <div>
          <p className="mb-1 flex items-center gap-1 text-xs font-medium text-subtle uppercase">
            <AlertTriangle className="size-3" /> Risks ({snapshot.risks.length})
          </p>
          <ul className="space-y-1.5">
            {snapshot.risks.map((r) => (
              <li
                key={r.id}
                className="rounded-lg border border-danger/20 bg-danger/5 px-2 py-1.5 text-xs"
              >
                <span className="font-medium">{r.title}</span>
                <Badge variant="danger" className="ml-1">
                  S{r.severity}×L{r.likelihood}
                </Badge>
                <p className="mt-0.5 text-muted">{r.note}</p>
                {r.linkedScenarioId && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-1 h-7 px-2 text-xs"
                    onClick={() => onNavigate?.("precog", r.linkedScenarioId)}
                  >
                    Precog
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
        {snapshot.ideas.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium text-subtle uppercase">
              Ideas ({snapshot.ideas.length})
            </p>
            <ul className="space-y-1 text-xs text-muted">
              {snapshot.ideas.map((i) => (
                <li key={i.id}>
                  <span className="text-fg">{i.title}</span> — {i.status}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
