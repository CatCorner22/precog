import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  buildProcessMapGraph,
  enrichProcess,
  layoutProcessMap,
  type MapGraphNode,
  type ProcessMapSnapshot,
} from "@/lib/precog/process-graph";
import { processes } from "@/lib/precog/demo-data";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Crosshair,
  Eye,
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

type NavFn = (tab: string, id?: string) => void;

type ProcessFlowNode = Node<
  MapGraphNode & {
    vision: MapVisionMode;
    interactive: boolean;
    priority?: number;
    immediate?: boolean;
  } & Record<string, unknown>
>;

function asMapNode(data: unknown): MapGraphNode & {
  vision?: MapVisionMode;
  interactive?: boolean;
  priority?: number;
  immediate?: boolean;
} {
  return data as MapGraphNode & {
    vision?: MapVisionMode;
    interactive?: boolean;
    priority?: number;
    immediate?: boolean;
  };
}

function heatColorStandard(sev?: number) {
  const s = sev ?? 0;
  if (s >= 70) return "var(--color-danger)";
  if (s >= 45) return "var(--color-warn)";
  if (s >= 25) return "var(--color-primary)";
  return "var(--color-border-strong)";
}

function nodeAccent(
  vision: MapVisionMode,
  heat: number,
  priority: number,
): string {
  if (vision === "predator") return predatorThermalColor(Math.max(heat, priority));
  if (vision === "terminator") return terminatorThreatColor(priority);
  return heatColorStandard(heat);
}

function ProcessNodeView({ data, selected }: NodeProps<ProcessFlowNode>) {
  const d = asMapNode(data);
  const vision = d.vision ?? "standard";
  const heat = d.severity ?? 0;
  const priority = d.priority ?? heat;
  const accent = nodeAccent(vision, heat, priority);
  const interactive = d.interactive !== false;
  const hot = vision === "predator" && priority >= 72;
  const locked = vision === "terminator" && (d.immediate || priority >= 78);

  return (
    <div
      className={cn(
        "min-w-[180px] max-w-[220px] rounded-xl border-2 px-3 py-2 shadow-lg transition-all",
        vision === "predator" ? "bg-black/70 text-white" : "bg-elevated",
        vision === "terminator" && "bg-black/80",
        selected && "ring-2 ring-primary/40",
        !interactive && "opacity-40 grayscale",
        hot && "predator-node-hot",
        locked && "terminator-target",
      )}
      style={{
        borderColor: accent,
        boxShadow:
          vision === "predator"
            ? predatorGlow(priority)
            : vision === "terminator" && locked
              ? undefined
              : undefined,
        pointerEvents: interactive ? "auto" : "none",
      }}
    >
      <Handle type="target" position={Position.Left} className="!bg-primary" />
      <div
        className={cn(
          "flex items-center gap-1.5 text-[10px] tracking-wide uppercase",
          vision === "terminator" ? "terminator-hud" : "text-subtle",
          vision === "predator" && "predator-hud text-orange-200/90",
        )}
      >
        <Workflow className="size-3" />
        {vision === "predator"
          ? `THERMAL ${priority}`
          : vision === "terminator"
            ? `THREAT ${priority}`
            : `process · ${heat}`}
      </div>
      <p
        className={cn(
          "mt-1 text-sm font-semibold leading-tight",
          vision === "terminator" ? "text-red-300" : "text-fg",
          vision === "predator" && "text-white",
        )}
      >
        {d.label}
      </p>
      <p
        className={cn(
          "mt-1 line-clamp-2 text-[11px]",
          vision === "terminator" ? "text-red-400/80" : "text-muted",
          vision === "predator" && "text-white/70",
        )}
      >
        {d.subtitle}
      </p>
      {(d.badges ?? []).length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {(d.badges ?? []).slice(0, 3).map((b) => (
            <span
              key={b}
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px]",
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
  const accent =
    vision === "standard"
      ? accentDefault
      : nodeAccent(vision, heat, priority);
  const interactive = d.interactive !== false;
  const locked = vision === "terminator" && (d.immediate || priority >= 78);

  return (
    <div
      className={cn(
        "min-w-[140px] max-w-[180px] rounded-lg border px-2.5 py-1.5 shadow",
        vision === "predator" ? "bg-black/65" : "bg-surface",
        vision === "terminator" && "bg-black/75",
        selected && "ring-2 ring-primary/40",
        !interactive && "opacity-35 grayscale",
        priority >= 72 && vision === "predator" && "predator-node-hot",
        locked && "terminator-target",
      )}
      style={{
        borderColor: accent,
        boxShadow: vision === "predator" ? predatorGlow(priority * 0.85) : undefined,
        pointerEvents: interactive ? "auto" : "none",
      }}
    >
      <Handle type="target" position={Position.Left} className="!bg-muted" />
      <div
        className={cn(
          "flex items-center gap-1 text-[10px]",
          vision === "terminator" ? "terminator-hud" : "text-subtle",
          vision === "predator" && "predator-hud text-orange-100/80",
        )}
      >
        {icon}
        {d.kind}
        {vision !== "standard" && (
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
      {d.subtitle && (
        <p
          className={cn(
            "mt-0.5 line-clamp-2 text-[10px]",
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

export function ProcessMap({
  onNavigate,
  initialProcessId,
}: {
  onNavigate?: NavFn;
  initialProcessId?: string | null;
}) {
  const { profile } = usePractice();
  const [vision, setVision] = useState<MapVisionMode>("standard");
  const [layers, setLayers] = useState<LayerConfig[]>(() =>
    DEFAULT_LAYERS.map((l) => ({ ...l })),
  );
  const [showLayerPanel, setShowLayerPanel] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialProcessId ?? "proc-cash",
  );
  const [focusProcessId, setFocusProcessId] = useState<string | null>(
    initialProcessId ?? null,
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
    () => buildProcessMapGraph(profile.staff, graphOpts),
    [profile.staff, graphOpts],
  );

  const positions = useMemo(
    () => layoutProcessMap(graph.nodes, graph.edges),
    [graph],
  );

  /** Priority targets for Predator / Terminator + priority list */
  const priorities: PriorityTarget[] = useMemo(() => {
    const targets: PriorityTarget[] = [];
    for (const snap of graph.snapshots) {
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
  }, [graph.snapshots]);

  const priorityById = useMemo(() => {
    const m = new Map<string, PriorityTarget>();
    for (const t of priorities) m.set(t.id, t);
    return m;
  }, [priorities]);

  const rfNodes: ProcessFlowNode[] = useMemo(() => {
    return graph.nodes
      .filter((n) => {
        const layer = layerMap.get(layerForKind(n.kind));
        if (n.kind === "person" && !(layerMap.get("person")?.visible ?? true))
          return false;
        if (n.kind === "control" && !(layerMap.get("control")?.visible ?? true))
          return false;
        return layer?.visible !== false;
      })
      .map((n) => {
        const p = positions.get(n.id) ?? { x: 0, y: 0 };
        const layer = layerMap.get(layerForKind(n.kind));
        const pt =
          priorityById.get(n.id) ||
          (n.kind === "process" ? priorityById.get(n.id) : undefined) ||
          (n.processId ? priorityById.get(n.id) : undefined);
        // try match by data id for risks stored as risk-${id}
        let pri = pt;
        if (!pri && n.kind === "risk") {
          const raw = String(n.data?.riskId ?? n.id.replace(/^risk-/, ""));
          pri = priorityById.get(raw);
        }
        if (!pri && n.kind === "control") {
          pri = priorityById.get(String(n.data?.controlId ?? n.id.replace(/^ctrl-/, "")));
        }
        if (!pri && n.kind === "knowledge") {
          pri = priorityById.get(
            String(n.data?.knowledgeId ?? n.id.replace(/^know-/, "")),
          );
        }
        if (!pri && n.kind === "process") {
          pri = priorityById.get(n.id);
        }
        const priority = pri?.priority ?? n.severity ?? 0;
        return {
          id: n.id,
          type: n.kind,
          position: p,
          data: {
            ...n,
            vision,
            interactive: layer?.interactive !== false,
            priority,
            immediate: pri?.immediate,
          },
          selected: n.id === selectedId,
          style:
            layer?.interactive === false
              ? { opacity: 0.4 }
              : undefined,
        };
      });
  }, [graph.nodes, positions, selectedId, vision, layerMap, priorityById]);

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
            layerMap.get("risk")?.visible !== false ||
            layerMap.get("control")?.visible !== false
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
            e.kind === "has_risk" || e.kind === "control"
              ? "rgb(255, 50, 40)"
              : "rgb(120, 40, 35)";
        }
        const passiveDep = isDep && !depInteractive;
        return {
          id: e.id,
          source: e.source,
          target: e.target,
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
          labelStyle: { fill: "var(--color-muted)", fontSize: 10 },
          interactionWidth: passiveDep ? 1 : 12,
        };
      });
  }, [graph.edges, vision, layerMap, rfNodes]);

  const selectedNode = graph.nodes.find((n) => n.id === selectedId);
  const processId =
    selectedNode?.processId ??
    (selectedNode?.kind === "process" ? selectedNode.id : focusProcessId);
  const snapshot: ProcessMapSnapshot | null = processId
    ? enrichProcess(
        processes.find((p) => p.id === processId) ?? processes[0],
        profile.staff,
      )
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
  const hotCount = graph.snapshots.filter((s) => s.heat >= 70).length;

  function toggleLayer(
    id: MapLayerId,
    field: "visible" | "interactive",
  ) {
    setLayers((prev) =>
      prev.map((l) =>
        l.id === id ? { ...l, [field]: !l[field] } : l,
      ),
    );
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
        </div>
        <h2 className="mt-3 text-xl font-semibold tracking-tight sm:text-2xl">
          Value stream · priorities · thermal & threat vision
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Toggle layers that interact vs stay passive. Switch to{" "}
          <strong className="text-fg">Risk Predator</strong> for thermal priority heat
          (blue → white-hot), or <strong className="text-fg">Risk Terminator</strong> for
          immediate threat lock-on — with a friendly chrome buddy who just wants residual
          cut to a reasonable level.
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
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setShowLayerPanel((v) => !v)}
          >
            <Layers className="size-3.5" />
            Layers
          </Button>
        </div>

        {vision === "predator" && (
          <div className="mt-4 rounded-xl border border-border bg-black/40 p-3 predator-hud">
            <div className="flex flex-wrap items-center gap-3 text-xs text-orange-100/90">
              <Scan className="size-4 text-orange-200" />
              <span className="font-semibold tracking-widest">PREDATOR VISION</span>
              <span className="text-white/50">·</span>
              <span>{whiteHot} WHITE-HOT</span>
              <span className="text-white/50">·</span>
              <span>{priorities.filter((p) => p.band === "critical").length} CRITICAL</span>
            </div>
            <div className="predator-thermal-bar mt-2 h-2.5 w-full rounded-full" />
            <div className="mt-1 flex justify-between text-[10px] text-white/55">
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
                Friendly unit online. Mission: cut residual to a reasonable degree — not
                zero, not panic. Locking {immediate} immediate threat
                {immediate === 1 ? "" : "s"}.
              </p>
              <p className="mt-2 text-[10px] text-red-400/70">
                I'll be back… after dual release and bank rec are locked in.
              </p>
            </div>
          </div>
        )}

        <p className="mt-3 text-xs text-subtle">
          {graph.snapshots.length} processes · {hotCount} hot · {priorities.length} ranked
          targets · pan/zoom
        </p>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <div className="space-y-3">
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
                <ul className="grid gap-2 sm:grid-cols-2">
                  {layers.map((l) => (
                    <li
                      key={l.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-border bg-elevated px-2.5 py-2 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-fg">{l.label}</p>
                        <p className="truncate text-[10px] text-subtle">{l.description}</p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <label className="flex items-center gap-1 text-[10px] text-muted">
                          <input
                            type="checkbox"
                            checked={l.visible}
                            onChange={() => toggleLayer(l.id, "visible")}
                            className="size-3.5 accent-[var(--color-primary)]"
                          />
                          show
                        </label>
                        <label className="flex items-center gap-1 text-[10px] text-muted">
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
                fitView
                fitViewOptions={{ padding: 0.15 }}
                minZoom={0.25}
                maxZoom={1.6}
                proOptions={{ hideAttribution: true }}
                defaultEdgeOptions={{ type: "smoothstep" }}
              >
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
                  maskColor={
                    vision === "terminator"
                      ? "rgba(40,0,0,0.65)"
                      : "rgba(0,0,0,0.55)"
                  }
                  nodeColor={minimapColor}
                />
                <Panel position="top-left" className="m-2!">
                  {vision === "standard" ? (
                    <StandardLegend />
                  ) : vision === "predator" ? (
                    <PredatorLegend />
                  ) : (
                    <TerminatorLegend immediate={immediate} />
                  )}
                </Panel>
              </ReactFlow>
            </div>
          </Card>
        </div>

        <div className="space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <ListOrdered className="size-4" />
                Priority stack
              </CardTitle>
              <CardDescription>
                Heat × realistic impact · white-hot needs both high
              </CardDescription>
            </CardHeader>
            <CardContent className="max-h-[320px] space-y-1.5 overflow-y-auto">
              {priorities.slice(0, 12).map((t, i) => (
                <button
                  key={`${t.kind}-${t.id}`}
                  type="button"
                  onClick={() => {
                    setSelectedId(
                      t.kind === "process"
                        ? t.id
                        : graph.nodes.find(
                            (n) =>
                              n.id.includes(t.id) ||
                              String(n.data?.riskId) === t.id ||
                              String(n.data?.controlId) === t.id ||
                              String(n.data?.knowledgeId) === t.id,
                          )?.id ?? t.processId ?? t.id,
                    );
                    if (t.processId) setFocusProcessId(t.processId);
                  }}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition-colors hover:border-border-strong",
                    t.immediate
                      ? "border-danger/40 bg-danger/10"
                      : "border-border bg-elevated",
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
                      {t.immediate && (
                        <Badge variant="danger">NOW</Badge>
                      )}
                    </span>
                    <span className="mt-0.5 block text-[10px] text-muted">
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
        active &&
          accent === "predator" &&
          "border-orange-400/40 bg-orange-500/15 text-orange-100",
        active &&
          accent === "terminator" &&
          "border-red-500/50 bg-red-600/20 text-red-200",
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
      <span className="text-[9px] tracking-wide text-red-400/80 uppercase">
        T-1000 · risk
      </span>
    </div>
  );
}

function StandardLegend() {
  return (
    <div className="max-w-[220px] rounded-xl border border-border bg-surface/95 px-3 py-2 text-[10px] shadow-lg backdrop-blur">
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
    <div className="max-w-[240px] rounded-xl border border-orange-500/30 bg-black/80 px-3 py-2 text-[10px] text-orange-100/90 shadow-lg predator-hud">
      <p className="font-semibold tracking-widest">THERMAL KEY</p>
      <div className="predator-thermal-bar mt-1.5 h-2 rounded-full" />
      <p className="mt-1 text-white/50">
        White-hot = high heat × high impact. Hunt those first.
      </p>
    </div>
  );
}

function TerminatorLegend({ immediate }: { immediate: number }) {
  return (
    <div className="max-w-[240px] rounded-xl border border-red-800/50 bg-black/85 px-3 py-2 text-[10px] terminator-hud shadow-lg">
      <p className="font-semibold tracking-widest">THREAT ANALYSIS</p>
      <p className="mt-1 normal-case tracking-normal text-red-300/90">
        {immediate} target{immediate === 1 ? "" : "s"} require immediate attention.
        Pulsing lock = act this week.
      </p>
    </div>
  );
}

function ProcessDetail({
  snapshot,
  selectedNode,
  priority,
  vision,
  onNavigate,
  onSelectProcess,
}: {
  snapshot: ProcessMapSnapshot;
  selectedNode?: MapGraphNode;
  priority?: PriorityTarget;
  vision: MapVisionMode;
  onNavigate?: NavFn;
  onSelectProcess: (id: string) => void;
}) {
  const p = snapshot.process;
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="size-3 rounded-full"
            style={{
              background: priority
                ? predatorThermalColor(priority.priority)
                : heatColorStandard(snapshot.heat),
            }}
          />
          <Badge variant={snapshot.heat >= 70 ? "danger" : "primary"}>
            heat {snapshot.heat}
          </Badge>
          {priority && (
            <Badge
              variant={
                priority.immediate || priority.band === "white_hot"
                  ? "danger"
                  : "warn"
              }
            >
              {PRIORITY_BAND_LABEL[priority.band]} · P{priority.priority}
            </Badge>
          )}
          {vision !== "standard" && (
            <Badge variant="default">{vision}</Badge>
          )}
        </div>
        <CardTitle className="text-base">{p.name}</CardTitle>
        <CardDescription>{p.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {priority && (
          <div className="rounded-lg border border-border bg-panel px-3 py-2 text-xs">
            <p className="font-medium text-fg">{priority.impactHint}</p>
            <p className="mt-1 text-muted">{priority.reasons.join(" · ")}</p>
          </div>
        )}
        {selectedNode && selectedNode.kind !== "process" && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
            <p className="text-[10px] tracking-wide text-subtle uppercase">
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
                    className="mt-1 h-7 px-2 text-[11px]"
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
