import { ResponsibilityMatrix } from "./power-map-matrix";
import { FAMILY_META } from "@/lib/precog/sod/duty-families";
import { withPlaces } from "@/lib/precog/person-location";
import { Background, Controls, MiniMap, ReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  AlertTriangle,
  Download,
  FileText,
  Network,
  Plus,
  RotateCcw,
  Table2,
  Trash2,
  Undo2,
  Upload,
} from "lucide-react";
import { isSimulatedPersonId } from "@/lib/precog/sod/apply-assignments";
import { JOB_CATALOG } from "@/lib/precog/onboarding/job-catalog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { TeamLink } from "./team-link";
import type { PowerMapBuilderModel } from "./use-power-map-builder";

export function PowerMapEditorSection({ model }: { model: PowerMapBuilderModel }) {
  const {
    tpl,
    placesOf,
    assignments,
    selectedId,
    setSelectedId,
    conflictsOnly,
    setConflictsOnly,
    newJobId,
    setNewJobId,
    simulationName,
    setSimulationName,
    history,
    importMessage,
    mapView,
    setMapView,
    processId,
    setProcessId,
    report,
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    selected,
    addSimulationRole,
    reset,
    removeSelected,
    undo,
    exportModel,
    exportMatrixCsv,
    exportGovernanceReport,
    importModel,
  } = model;

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <Card className="min-w-0">
        <CardHeader className="gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Network className="size-4" />
              Duty assignments
            </CardTitle>
            <CardDescription>
              Each line joins a person to a duty they hold. A red moving line is a duty in a
              conflict. Drag the boxes into the layout that makes sense to your team. To change who
              holds a duty, <TeamLink>edit the team under Team</TeamLink>.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant={conflictsOnly ? "danger" : "secondary"}
              onClick={() => setConflictsOnly((value) => !value)}
            >
              <AlertTriangle className="size-3.5" />
              {conflictsOnly ? "Showing duty conflicts" : "Focus on duty conflicts"}
            </Button>
            <div className="inline-flex rounded-lg border border-border bg-elevated p-0.5">
              <button
                type="button"
                aria-pressed={mapView === "graph"}
                onClick={() => setMapView("graph")}
                className={cn(
                  "rounded-md px-2 py-1 text-xs",
                  mapView === "graph" ? "bg-primary text-primary-fg" : "text-muted",
                )}
              >
                <Network className="mr-1 inline size-3.5" />
                Map
              </button>
              <button
                type="button"
                aria-pressed={mapView === "matrix"}
                onClick={() => setMapView("matrix")}
                className={cn(
                  "rounded-md px-2 py-1 text-xs",
                  mapView === "matrix" ? "bg-primary text-primary-fg" : "text-muted",
                )}
              >
                <Table2 className="mr-1 inline size-3.5" />
                Matrix
              </button>
            </div>
            <Button size="sm" variant="ghost" onClick={undo} disabled={!history.length}>
              <Undo2 className="size-3.5" />
              Undo
            </Button>
            <Button size="sm" variant="ghost" onClick={exportModel}>
              <Download className="size-3.5" />
              Download map (JSON)
            </Button>
            <Button size="sm" variant="ghost" onClick={exportMatrixCsv}>
              <Table2 className="size-3.5" />
              Download duty table (CSV)
            </Button>
            <Button size="sm" variant="ghost" onClick={exportGovernanceReport}>
              <FileText className="size-3.5" />
              Download report
            </Button>
            {/* The file input is visually hidden, so the label shows its keyboard focus. */}
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-muted hover:bg-elevated hover:text-fg has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--color-primary)]">
              <Upload className="size-3.5" />
              Import
              <input
                type="file"
                accept="application/json,.json"
                className="sr-only"
                onChange={(event) => {
                  void importModel(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-muted">
              <span>Person</span>
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="max-w-56 rounded-md border border-border bg-bg px-2 py-1 text-xs text-fg"
              >
                {assignments.map((person) => (
                  <option key={person.personId} value={person.personId}>
                    {person.personName} · {withPlaces(person.role, placesOf.get(person.personId))}
                  </option>
                ))}
              </select>
            </label>
            {selected && isSimulatedPersonId(selected.personId) && (
              <Button size="sm" variant="ghost" onClick={removeSelected} className="text-danger">
                <Trash2 className="size-3.5" />
                Remove modeled job
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={reset}>
              <RotateCcw className="size-3.5" />
              Reset duties
            </Button>
            <span aria-live="polite" className="ml-auto text-xs text-subtle">
              {importMessage || "Saved with your business"}
            </span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-lg border border-border bg-elevated p-2">
            {Object.entries(FAMILY_META).map(([id, meta]) => (
              <span key={id} className="flex items-center gap-1.5 text-xs text-muted">
                <span
                  aria-hidden
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: meta.color }}
                />
                <span>
                  {meta.label}
                  <span className="text-subtle"> · {meta.description}</span>
                </span>
              </span>
            ))}
            <label className="ml-auto flex items-center gap-2 text-xs text-muted">
              <span>Process lens</span>
              <select
                value={processId}
                onChange={(event) => setProcessId(event.target.value)}
                className="max-w-56 rounded-md border border-border bg-bg px-2 py-1 text-xs text-fg"
              >
                <option value="all">All processes</option>
                {tpl.processes.map((process) => (
                  <option key={process.id} value={process.id}>
                    {process.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </CardHeader>
        <CardContent>
          {mapView === "graph" ? (
            <div className="h-[min(720px,70dvh)] w-full min-w-0 overflow-hidden rounded-xl border border-border bg-bg">
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                edgesFocusable={false}
                fitView
                minZoom={0.18}
                maxZoom={1.8}
                onNodeClick={(_, node) => {
                  if (node.id.startsWith("person:")) setSelectedId(node.id.slice(7));
                }}
              >
                <Background gap={24} size={1} />
                <MiniMap
                  pannable
                  zoomable
                  nodeColor={(node) => String(node.style?.borderColor ?? "#3a4155")}
                />
                <Controls />
              </ReactFlow>
            </div>
          ) : (
            <ResponsibilityMatrix
              assignments={assignments}
              conflicts={report.conflicts}
              conflictsOnly={conflictsOnly}
              processId={processId}
              placesOf={placesOf}
            />
          )}
        </CardContent>
      </Card>

      <div className="min-w-0 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add a common job</CardTitle>
            <CardDescription>
              Model a hire, contractor, or reassignment before granting access.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <input
              value={simulationName}
              onChange={(event) => setSimulationName(event.target.value)}
              placeholder="Name (optional)"
              aria-label="Name of the simulated hire (optional)"
              className="w-full rounded-lg border border-border bg-elevated px-3 py-2 text-sm"
            />
            <div className="flex gap-2">
              <select
                value={newJobId}
                onChange={(event) => setNewJobId(event.target.value)}
                aria-label="Job title for a simulated hire"
                className="min-w-0 flex-1 rounded-lg border border-border bg-elevated px-3 py-2 text-sm"
              >
                {JOB_CATALOG.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
              <Button size="sm" onClick={addSimulationRole}>
                <Plus className="size-3.5" />
                Add
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
