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
import { usePractice } from "@/lib/precog/practice-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  Network,
  Recycle,
  ShieldAlert,
  User,
  Workflow,
} from "lucide-react";

type NavFn = (tab: string, id?: string) => void;

type ProcessFlowNode = Node<MapGraphNode & Record<string, unknown>>;

function asMapNode(data: unknown): MapGraphNode {
  return data as MapGraphNode;
}

/** Shared heat scale — keep legend and node borders in sync. */
export const HEAT_SCALE = [
  {
    id: "cool",
    label: "Cool",
    range: "0–24",
    meaning: "Stable process · low residual heat",
    color: "var(--color-border-strong)",
    swatchClass: "bg-border-strong",
    min: 0,
    max: 24,
  },
  {
    id: "watch",
    label: "Watch",
    range: "25–44",
    meaning: "Elevated · monitor & document",
    color: "var(--color-primary)",
    swatchClass: "bg-primary",
    min: 25,
    max: 44,
  },
  {
    id: "warm",
    label: "Warm",
    range: "45–69",
    meaning: "Material risk · plan remediation",
    color: "var(--color-warn)",
    swatchClass: "bg-warn",
    min: 45,
    max: 69,
  },
  {
    id: "hot",
    label: "Hot",
    range: "70–100",
    meaning: "Critical path · act this week",
    color: "var(--color-danger)",
    swatchClass: "bg-danger",
    min: 70,
    max: 100,
  },
] as const;

const NODE_TYPE_LEGEND = [
  {
    id: "process",
    label: "Process",
    meaning: "Value-stream step (inputs → outputs)",
    color: "var(--color-primary)",
    icon: Workflow,
  },
  {
    id: "risk",
    label: "Risk",
    meaning: "Severity × likelihood tagged risk",
    color: "var(--color-danger)",
    icon: AlertTriangle,
  },
  {
    id: "idea",
    label: "Idea",
    meaning: "Improvement / control opportunity",
    color: "var(--color-warn)",
    icon: Lightbulb,
  },
  {
    id: "waste",
    label: "Waste",
    meaning: "Lean muda / mura / muri",
    color: "var(--color-muted)",
    icon: Recycle,
  },
  {
    id: "control",
    label: "SoD gap",
    meaning: "Open segregation-of-duties issue",
    color: "var(--color-danger)",
    icon: ShieldAlert,
  },
  {
    id: "knowledge",
    label: "Knowledge",
    meaning: "Critical skill · SPOF if sole owner",
    color: "var(--color-primary)",
    icon: Network,
  },
  {
    id: "person",
    label: "Owner",
    meaning: "Person accountable for the process",
    color: "var(--color-ok)",
    icon: User,
  },
] as const;

const EDGE_LEGEND = [
  { id: "depends", label: "Feeds / depends", style: "solid", color: "var(--color-primary)" },
  { id: "has_risk", label: "Has risk / SoD", style: "solid", color: "var(--color-danger)" },
  { id: "has_idea", label: "Has idea / knowledge", style: "dashed", color: "var(--color-warn)" },
  { id: "owns", label: "Owns / expert", style: "solid", color: "var(--color-ok)" },
] as const;

function heatColor(sev?: number) {
  const s = sev ?? 0;
  if (s >= 70) return HEAT_SCALE[3].color;
  if (s >= 45) return HEAT_SCALE[2].color;
  if (s >= 25) return HEAT_SCALE[1].color;
  return HEAT_SCALE[0].color;
}

function heatBandLabel(sev?: number) {
  const s = sev ?? 0;
  if (s >= 70) return HEAT_SCALE[3].label;
  if (s >= 45) return HEAT_SCALE[2].label;
  if (s >= 25) return HEAT_SCALE[1].label;
  return HEAT_SCALE[0].label;
}

function ProcessNodeView({ data, selected }: NodeProps<ProcessFlowNode>) {
  const d = asMapNode(data);
  return (
    <div
      className={cn(
        "min-w-[180px] max-w-[220px] rounded-xl border-2 bg-elevated px-3 py-2 shadow-lg",
        selected ? "border-primary ring-2 ring-primary/30" : "border-border",
      )}
      style={{ borderColor: selected ? undefined : heatColor(d.severity) }}
    >
      <Handle type="target" position={Position.Left} className="!bg-primary" />
      <div className="flex items-center gap-1.5 text-[10px] tracking-wide text-subtle uppercase">
        <Workflow className="size-3" />
        process · {heatBandLabel(d.severity)} {d.severity ?? 0}
      </div>
      <p className="mt-1 text-sm font-semibold leading-tight text-fg">{d.label}</p>
      <p className="mt-1 line-clamp-2 text-[11px] text-muted">{d.subtitle}</p>
      <div className="mt-2 flex flex-wrap gap-1">
        {(d.badges ?? []).slice(0, 3).map((b) => (
          <span
            key={b}
            className="rounded bg-surface px-1.5 py-0.5 text-[10px] text-muted"
          >
            {b}
          </span>
        ))}
      </div>
      <Handle type="source" position={Position.Right} className="!bg-primary" />
    </div>
  );
}

function SatelliteNode({
  data,
  selected,
  icon,
  accent,
}: NodeProps<ProcessFlowNode> & { icon: ReactNode; accent: string }) {
  const d = asMapNode(data);
  return (
    <div
      className={cn(
        "min-w-[140px] max-w-[180px] rounded-lg border bg-surface px-2.5 py-1.5 shadow",
        selected ? "ring-2 ring-primary/40" : "",
      )}
      style={{ borderColor: accent }}
    >
      <Handle type="target" position={Position.Left} className="!bg-muted" />
      <div className="flex items-center gap-1 text-[10px] text-subtle">
        {icon}
        {d.kind}
      </div>
      <p className="mt-0.5 text-xs font-medium leading-snug text-fg">{d.label}</p>
      {d.subtitle && (
        <p className="mt-0.5 line-clamp-2 text-[10px] text-muted">{d.subtitle}</p>
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
      accent="var(--color-danger)"
    />
  );
}
function IdeaNode(props: NodeProps<ProcessFlowNode>) {
  return (
    <SatelliteNode
      {...props}
      icon={<Lightbulb className="size-3 text-warn" />}
      accent="var(--color-warn)"
    />
  );
}
function WasteNode(props: NodeProps<ProcessFlowNode>) {
  return (
    <SatelliteNode
      {...props}
      icon={<Recycle className="size-3 text-muted" />}
      accent="var(--color-border-strong)"
    />
  );
}
function ControlNode(props: NodeProps<ProcessFlowNode>) {
  return (
    <SatelliteNode
      {...props}
      icon={<ShieldAlert className="size-3 text-danger" />}
      accent="var(--color-danger)"
    />
  );
}
function KnowledgeNode(props: NodeProps<ProcessFlowNode>) {
  return (
    <SatelliteNode
      {...props}
      icon={<Network className="size-3 text-primary" />}
      accent="var(--color-primary)"
    />
  );
}
function PersonNode(props: NodeProps<ProcessFlowNode>) {
  return (
    <SatelliteNode
      {...props}
      icon={<User className="size-3 text-ok" />}
      accent="var(--color-ok)"
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

function ProcessMapLegend({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(!compact);

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-surface/95 shadow-lg backdrop-blur",
        compact ? "max-w-[280px]" : "w-full",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
        aria-expanded={open}
      >
        <span className="text-xs font-semibold tracking-wide text-fg uppercase">
          Risk color legend
        </span>
        {open ? (
          <ChevronUp className="size-3.5 text-muted" />
        ) : (
          <ChevronDown className="size-3.5 text-muted" />
        )}
      </button>

      {open && (
        <div className="space-y-3 border-t border-border px-3 py-3">
          {/* Heat continuum */}
          <div>
            <p className="mb-1.5 text-[10px] font-medium tracking-wide text-subtle uppercase">
              Process heat (border + minimap)
            </p>
            <div
              className="mb-2 h-2.5 w-full overflow-hidden rounded-full"
              style={{
                background:
                  "linear-gradient(90deg, var(--color-border-strong) 0%, var(--color-primary) 33%, var(--color-warn) 66%, var(--color-danger) 100%)",
              }}
              role="img"
              aria-label="Heat scale from cool to hot"
            />
            <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              {HEAT_SCALE.map((band) => (
                <li
                  key={band.id}
                  className="rounded-lg border border-border bg-elevated px-2 py-1.5"
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className="size-3 shrink-0 rounded-full ring-1 ring-black/20"
                      style={{ background: band.color }}
                      aria-hidden
                    />
                    <span className="text-[11px] font-semibold text-fg">{band.label}</span>
                  </div>
                  <p className="mt-0.5 text-[10px] tabular text-muted">{band.range}</p>
                  <p className="mt-0.5 text-[10px] leading-snug text-subtle">{band.meaning}</p>
                </li>
              ))}
            </ul>
          </div>

          {/* Node types */}
          <div>
            <p className="mb-1.5 text-[10px] font-medium tracking-wide text-subtle uppercase">
              Node types
            </p>
            <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {NODE_TYPE_LEGEND.map((n) => {
                const Icon = n.icon;
                return (
                  <li
                    key={n.id}
                    className="flex items-start gap-2 rounded-md border border-border/80 bg-elevated/60 px-2 py-1"
                  >
                    <span
                      className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border"
                      style={{ borderColor: n.color, color: n.color }}
                    >
                      <Icon className="size-3" />
                    </span>
                    <span>
                      <span className="block text-[11px] font-medium text-fg">{n.label}</span>
                      <span className="block text-[10px] text-muted">{n.meaning}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Edges */}
          <div>
            <p className="mb-1.5 text-[10px] font-medium tracking-wide text-subtle uppercase">
              Edges
            </p>
            <ul className="flex flex-wrap gap-2">
              {EDGE_LEGEND.map((e) => (
                <li
                  key={e.id}
                  className="inline-flex items-center gap-2 rounded-md border border-border bg-elevated px-2 py-1 text-[10px] text-muted"
                >
                  <span
                    className="inline-block w-7"
                    style={{
                      borderTopWidth: 2,
                      borderTopStyle: e.style === "dashed" ? "dashed" : "solid",
                      borderTopColor: e.color,
                    }}
                    aria-hidden
                  />
                  {e.label}
                </li>
              ))}
            </ul>
          </div>

          <p className="text-[10px] leading-snug text-subtle">
            Heat = process risk scores + open SoD gaps + knowledge SPOFs + residual signals.
            Educational — not an actuarial rating.
          </p>
        </div>
      )}
    </div>
  );
}

export function ProcessMap({
  onNavigate,
  initialProcessId,
}: {
  onNavigate?: NavFn;
  initialProcessId?: string | null;
}) {
  const { profile } = usePractice();
  const [showRisks, setShowRisks] = useState(true);
  const [showIdeas, setShowIdeas] = useState(true);
  const [showWaste, setShowWaste] = useState(false);
  const [showKnowledge, setShowKnowledge] = useState(true);
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

  const graph = useMemo(
    () =>
      buildProcessMapGraph(profile.staff, {
        showRisks,
        showIdeas,
        showWaste,
        showKnowledge,
      }),
    [profile.staff, showRisks, showIdeas, showWaste, showKnowledge],
  );

  const positions = useMemo(
    () => layoutProcessMap(graph.nodes, graph.edges),
    [graph],
  );

  const rfNodes: ProcessFlowNode[] = useMemo(
    () =>
      graph.nodes.map((n) => {
        const p = positions.get(n.id) ?? { x: 0, y: 0 };
        return {
          id: n.id,
          type: n.kind,
          position: p,
          data: { ...n } as MapGraphNode & Record<string, unknown>,
          selected: n.id === selectedId,
        };
      }),
    [graph.nodes, positions, selectedId],
  );

  const rfEdges: Edge[] = useMemo(
    () =>
      graph.edges.map((e) => {
        const style = EDGE_STYLE[e.kind] ?? EDGE_STYLE.depends;
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          label: e.label,
          animated: e.kind === "depends",
          style: {
            stroke: style.stroke,
            strokeWidth: e.kind === "depends" ? 2 : 1.25,
            strokeDasharray: style.dashed ? "4 3" : undefined,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: style.stroke,
            width: 16,
            height: 16,
          },
          labelStyle: { fill: "var(--color-muted)", fontSize: 10 },
        };
      }),
    [graph.edges],
  );

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
    setSelectedId(node.id);
    const d = asMapNode(node.data);
    if (d.kind === "process") setFocusProcessId(d.id);
    else if (d.processId) setFocusProcessId(d.processId);
  }, []);

  const hotCount = graph.snapshots.filter((s) => s.heat >= 70).length;
  const ideaCount = graph.snapshots.reduce((n, s) => n + s.ideas.length, 0);
  const riskCount = graph.snapshots.reduce((n, s) => n + s.risks.length, 0);

  return (
    <div className="space-y-4">
      <section className="matrix-grid rounded-2xl border border-border bg-surface p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="accent">Interactive process map</Badge>
          <Badge variant="primary">React Flow</Badge>
        </div>
        <h2 className="mt-3 text-xl font-semibold tracking-tight sm:text-2xl">
          Value stream · risks · ideas · waste · controls
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Click any node to drill into inputs, dependencies, SoD gaps, knowledge SPOFs, Lean
          waste, and improvement ideas. Heat combines process risks, open controls, and residual
          signals.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <ToggleChip
            on={showRisks}
            onClick={() => setShowRisks((v) => !v)}
            label={`Risks (${riskCount})`}
          />
          <ToggleChip
            on={showIdeas}
            onClick={() => setShowIdeas((v) => !v)}
            label={`Ideas (${ideaCount})`}
          />
          <ToggleChip on={showWaste} onClick={() => setShowWaste((v) => !v)} label="Lean waste" />
          <ToggleChip
            on={showKnowledge}
            onClick={() => setShowKnowledge((v) => !v)}
            label="Knowledge"
          />
        </div>

        {/* Always-visible compact heat strip under filters */}
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-elevated/50 px-3 py-2">
          <span className="text-[10px] font-semibold tracking-wide text-subtle uppercase">
            Heat
          </span>
          <div
            className="h-2 w-24 shrink-0 rounded-full sm:w-32"
            style={{
              background:
                "linear-gradient(90deg, var(--color-border-strong), var(--color-primary), var(--color-warn), var(--color-danger))",
            }}
            aria-hidden
          />
          <ul className="flex flex-wrap gap-x-3 gap-y-1">
            {HEAT_SCALE.map((band) => (
              <li key={band.id} className="inline-flex items-center gap-1.5 text-[11px] text-muted">
                <span
                  className="size-2.5 rounded-full ring-1 ring-black/15"
                  style={{ background: band.color }}
                  aria-hidden
                />
                <span className="font-medium text-fg">{band.label}</span>
                <span className="tabular text-subtle">{band.range}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-3 text-xs text-subtle">
          {graph.snapshots.length} processes · {hotCount} hot · pan/zoom · minimap
        </p>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <Card className="overflow-hidden p-0">
          <div className="h-[min(70vh,640px)] w-full bg-panel">
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
              <Background gap={18} size={1} color="var(--color-border)" />
              <Controls showInteractive={false} />
              <MiniMap
                nodeStrokeWidth={2}
                pannable
                zoomable
                maskColor="rgba(0,0,0,0.55)"
                nodeColor={(n) => heatColor(asMapNode(n.data)?.severity)}
              />
              <Panel position="top-left" className="m-2!">
                <ProcessMapLegend compact />
              </Panel>
            </ReactFlow>
          </div>
        </Card>

        <div className="space-y-3">
          {/* Full legend also in sidebar for mobile / print readability */}
          <div className="xl:hidden">
            <ProcessMapLegend />
          </div>

          {snapshot ? (
            <ProcessDetail
              snapshot={snapshot}
              selectedNode={selectedNode}
              onNavigate={onNavigate}
              onSelectProcess={(id) => {
                setSelectedId(id);
                setFocusProcessId(id);
              }}
            />
          ) : (
            <Card>
              <CardContent className="p-4 text-sm text-muted">
                Select a process node to inspect risks and ideas.
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Hot processes</CardTitle>
              <CardDescription>Highest composite heat</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {[...graph.snapshots]
                .sort((a, b) => b.heat - a.heat)
                .slice(0, 5)
                .map((s) => (
                  <button
                    key={s.process.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(s.process.id);
                      setFocusProcessId(s.process.id);
                    }}
                    className="flex w-full items-center justify-between rounded-lg border border-border bg-elevated px-2.5 py-2 text-left text-sm hover:border-border-strong"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className="size-2.5 shrink-0 rounded-full ring-1 ring-black/15"
                        style={{ background: heatColor(s.heat) }}
                        title={heatBandLabel(s.heat)}
                        aria-hidden
                      />
                      <span className="truncate font-medium">{s.process.name}</span>
                    </span>
                    <Badge
                      variant={
                        s.heat >= 70 ? "danger" : s.heat >= 45 ? "warn" : "default"
                      }
                    >
                      {heatBandLabel(s.heat)} {s.heat}
                    </Badge>
                  </button>
                ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ToggleChip({
  on,
  onClick,
  label,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        on
          ? "border-primary/40 bg-primary/10 text-fg"
          : "border-border bg-elevated text-muted",
      )}
    >
      {label}
    </button>
  );
}

function ProcessDetail({
  snapshot,
  selectedNode,
  onNavigate,
  onSelectProcess,
}: {
  snapshot: ProcessMapSnapshot;
  selectedNode?: MapGraphNode;
  onNavigate?: NavFn;
  onSelectProcess: (id: string) => void;
}) {
  const p = snapshot.process;
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="size-3 rounded-full ring-1 ring-black/15"
            style={{ background: heatColor(snapshot.heat) }}
            aria-hidden
          />
          <Badge variant={snapshot.heat >= 70 ? "danger" : "primary"}>
            {heatBandLabel(snapshot.heat)} · heat {snapshot.heat}
          </Badge>
          {snapshot.residualScore != null && (
            <Badge variant="warn">residual {snapshot.residualScore}</Badge>
          )}
        </div>
        <CardTitle className="text-base">{p.name}</CardTitle>
        <CardDescription>{p.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {selectedNode && selectedNode.kind !== "process" && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
            <p className="text-[10px] tracking-wide text-subtle uppercase">
              Selected · {selectedNode.kind}
            </p>
            <p className="font-medium">{selectedNode.label}</p>
            {selectedNode.subtitle && (
              <p className="mt-1 text-xs text-muted">{selectedNode.subtitle}</p>
            )}
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

        {snapshot.owners.length > 0 && (
          <div>
            <p className="text-xs font-medium text-subtle uppercase">Owners</p>
            <ul className="mt-1 space-y-0.5 text-xs text-muted">
              {snapshot.owners.map((o) => (
                <li key={o.id}>
                  {o.name} · {o.role}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <p className="mb-1 flex items-center gap-1 text-xs font-medium text-subtle uppercase">
            <AlertTriangle className="size-3" /> Risks ({snapshot.risks.length})
          </p>
          <ul className="space-y-1.5">
            {snapshot.risks.map((r) => {
              const score = r.severity * r.likelihood * 4;
              return (
                <li
                  key={r.id}
                  className="rounded-lg border border-danger/20 bg-danger/5 px-2 py-1.5 text-xs"
                >
                  <div className="flex flex-wrap items-center gap-1">
                    <span
                      className="size-2.5 rounded-full ring-1 ring-black/15"
                      style={{ background: heatColor(score) }}
                      aria-hidden
                    />
                    <span className="font-medium">{r.title}</span>
                    <Badge variant="danger">
                      S{r.severity}×L{r.likelihood}
                    </Badge>
                    <span className="text-[10px] text-subtle">{heatBandLabel(score)}</span>
                  </div>
                  <p className="mt-0.5 text-muted">{r.note}</p>
                  {r.linkedScenarioId && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="mt-1 h-7 px-2 text-[11px]"
                      onClick={() => onNavigate?.("precog", r.linkedScenarioId)}
                    >
                      Open Precog scenario
                    </Button>
                  )}
                  {r.linkedKnowledgeId && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="mt-1 h-7 px-2 text-[11px]"
                      onClick={() => onNavigate?.("knowledge", r.linkedKnowledgeId)}
                    >
                      Knowledge map
                    </Button>
                  )}
                </li>
              );
            })}
            {snapshot.risks.length === 0 && (
              <li className="text-xs text-muted">No tagged risks.</li>
            )}
          </ul>
        </div>

        <div>
          <p className="mb-1 flex items-center gap-1 text-xs font-medium text-subtle uppercase">
            <Lightbulb className="size-3" /> Ideas ({snapshot.ideas.length})
          </p>
          <ul className="space-y-1.5">
            {snapshot.ideas.map((i) => (
              <li
                key={i.id}
                className="rounded-lg border border-warn/25 bg-warn/5 px-2 py-1.5 text-xs"
              >
                <div className="flex flex-wrap gap-1">
                  <span className="font-medium">{i.title}</span>
                  <Badge variant="warn">{i.status}</Badge>
                  <Badge variant="default">{i.effort}</Badge>
                </div>
                <p className="mt-0.5 text-muted">{i.note}</p>
              </li>
            ))}
          </ul>
        </div>

        {snapshot.wastes.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium text-subtle uppercase">Lean waste</p>
            <ul className="space-y-1 text-xs text-muted">
              {snapshot.wastes.map((w) => (
                <li key={w.id}>
                  <span className="text-fg">{w.label}</span> — {w.note}
                </li>
              ))}
            </ul>
          </div>
        )}

        {snapshot.controlGaps.some((c) => !c.segregated) && (
          <div>
            <p className="mb-1 text-xs font-medium text-subtle uppercase">SoD gaps</p>
            <ul className="space-y-1 text-xs">
              {snapshot.controlGaps
                .filter((c) => !c.segregated)
                .map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2">
                    <span>{c.name}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2"
                      onClick={() => onNavigate?.("sod")}
                    >
                      SoD
                    </Button>
                  </li>
                ))}
            </ul>
          </div>
        )}

        {snapshot.linkedScenarios.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {snapshot.linkedScenarios.map((s) => (
              <Button
                key={s.id}
                size="sm"
                variant="secondary"
                onClick={() => onNavigate?.("precog", s.id)}
              >
                {s.title.slice(0, 28)}…
              </Button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
