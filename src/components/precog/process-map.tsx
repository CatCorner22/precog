import {
  connectProcessDependency,
  edgesWithinNodes,
  removeProcessDependencies,
} from "@/lib/precog/builder/map-editing";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTemplate } from "@/lib/precog/use-template";
import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  Panel,
  ReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
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
  type ProcessMapSnapshot,
} from "@/lib/precog/process-graph";
import {
  DEFAULT_LAYERS,
  PRIORITY_BAND_LABEL,
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
  Crosshair,
  Eye,
  Hammer,
  LayoutGrid,
  Layers,
  ListOrdered,
  Redo2,
  Scan,
  Thermometer,
  Undo2,
} from "lucide-react";
import type { NavFn } from "@/lib/precog/navigation";
import {
  LaneHeaders,
  nodeTypes,
  type ProcessFlowNode,
} from "@/components/precog/process-map/nodes";
import {
  asMapNode,
  EDGE_STYLE,
  heatColorStandard,
  layerForKind,
} from "@/components/precog/process-map/style";
import {
  PredatorLegend,
  ProcessDetail,
  StandardLegend,
  T1000Buddy,
  TerminatorLegend,
  VisionChip,
} from "@/components/precog/process-map/detail";

/**
 * Stable identity matters: React Flow syncs this prop into its store on every
 * render, and a fresh object would overwrite the options queued by focusOn().
 */
const FIT_ALL_OPTIONS = { padding: 0.15 } as const;

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
  const {
    profile,
    setMapLayout,
    setCustomProcesses,
    mapCustomized,
    undoMap,
    redoMap,
    canUndoMap,
    canRedoMap,
  } = usePractice();
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
    (_: unknown, node: ProcessFlowNode, dragged: ProcessFlowNode[] = []) => {
      const moved = (dragged.length ? dragged : [node]).filter(
        (n) => asMapNode(n.data).kind === "process",
      );
      if (!moved.length) return;
      setMapLayout((layout) => ({
        ...layout,
        ...Object.fromEntries(moved.map((n) => [n.id, n.position])),
      }));
      setLiveLayout((layout) => {
        const next = { ...layout };
        for (const n of moved) delete next[n.id];
        return next;
      });
    },
    [setMapLayout],
  );

  const processIds = useMemo(() => new Set(processes.map((p) => p.id)), [processes]);
  const isValidConnection = useCallback(
    (connection: Connection | Edge) =>
      Boolean(
        build &&
        connection.source &&
        connection.target &&
        connection.source !== connection.target &&
        processIds.has(connection.source) &&
        processIds.has(connection.target),
      ),
    [build, processIds],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!isValidConnection(connection)) return;
      const source = connection.source;
      const target = connection.target;
      if (connectProcessDependency(processes, source, target) === processes) return;
      setCustomProcesses((current) => connectProcessDependency(current, source, target));
      toast.success("Dependency linked", {
        description: `${processes.find((p) => p.id === target)?.name} now depends on ${processes.find((p) => p.id === source)?.name}`,
      });
    },
    [isValidConnection, processes, setCustomProcesses],
  );

  const onEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      if (!build) return;
      const ids = new Set(deleted.map((edge) => edge.id));
      const links = graph.edges.filter((edge) => edge.kind === "depends" && ids.has(edge.id));
      if (!links.length) return;
      setCustomProcesses((current) => removeProcessDependencies(current, links));
    },
    [build, graph.edges, setCustomProcesses],
  );

  const visibleEdges = useMemo(
    () => edgesWithinNodes(graph.edges, visibleNodes),
    [graph.edges, visibleNodes],
  );

  const rfEdges: Edge[] = useMemo(() => {
    const depInteractive = layerMap.get("depends")?.interactive !== false;
    const depVisible = layerMap.get("depends")?.visible !== false;
    return visibleEdges
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
  }, [visibleEdges, vision, layerMap, build]);

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
          <div className="mt-4 flex flex-wrap items-start justify-between gap-3 rounded-xl border border-accent/30 bg-accent/5 p-3 text-xs text-muted">
            <p>
              <span className="font-semibold text-fg">Build mode.</span> Drag process boxes to
              arrange your value stream. Drag from the right handle of one process to the left
              handle of another to wire dependencies. Click a process to edit it — or insert a
              reusable block from the builder panel.
            </p>
            <div className="inline-flex shrink-0 overflow-hidden rounded-md border border-border bg-surface">
              <button
                type="button"
                onClick={undoMap}
                disabled={!canUndoMap}
                title="Undo (Ctrl+Z)"
                aria-label="Undo"
                className="inline-flex h-8 items-center gap-1 px-2.5 text-muted hover:bg-elevated hover:text-fg disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <Undo2 className="size-3.5" />
                Undo
              </button>
              <button
                type="button"
                onClick={redoMap}
                disabled={!canRedoMap}
                title="Redo (Ctrl+Shift+Z)"
                aria-label="Redo"
                className="inline-flex h-8 items-center gap-1 border-l border-border px-2.5 text-muted hover:bg-elevated hover:text-fg disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <Redo2 className="size-3.5" />
                Redo
              </button>
            </div>
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
