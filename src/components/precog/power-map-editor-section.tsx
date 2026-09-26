import { ResponsibilityMatrix } from "./power-map-parts";
import { FAMILY_META, withPlaces } from "./power-map-graph";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  AlertTriangle,
  Download,
  FileText,
  Network,
  Plus,
  RotateCcw,
  Search,
  Table2,
  Trash2,
  Undo2,
  Upload,
} from "lucide-react";
import { type DutyFamily } from "@/lib/precog/sod/conflict-rules";
import { JOB_CATALOG } from "@/lib/precog/onboarding/job-catalog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { PowerMapBuilderModel } from "./use-power-map-builder";

export function PowerMapEditorSection({ model }: { model: PowerMapBuilderModel }) {
  const {
    tpl,
    placesOf,
    assignments,
    guidanceByDuty,
    selectedId,
    setSelectedId,
    search,
    setSearch,
    family,
    setFamily,
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
    selectedConflicts,
    conflictEntitlements,
    visibleEntitlements,
    toggleEffects,
    toggle,
    toggleForPerson,
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
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <Card>
        <CardHeader className="gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Network className="size-4" />
              Power, duty & responsibility map
            </CardTitle>
            <CardDescription>
              Every line means a person holds that power. Animated red lines participate in a
              conflict. Drag nodes into the structure that makes sense to your team.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant={conflictsOnly ? "danger" : "secondary"}
              onClick={() => setConflictsOnly((value) => !value)}
            >
              <AlertTriangle className="size-3.5" />
              {conflictsOnly ? "Showing conflicts" : "Focus conflicts"}
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
              Export
            </Button>
            <Button size="sm" variant="ghost" onClick={exportMatrixCsv}>
              <Table2 className="size-3.5" />
              CSV
            </Button>
            <Button size="sm" variant="ghost" onClick={exportGovernanceReport}>
              <FileText className="size-3.5" />
              Report
            </Button>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-muted hover:bg-elevated hover:text-fg">
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
            <Button size="sm" variant="ghost" onClick={reset}>
              <RotateCcw className="size-3.5" />
              Reset model
            </Button>
            <span aria-live="polite" className="ml-auto text-xs text-subtle">
              {importMessage || "Saved with your business"}
            </span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-lg border border-border bg-elevated p-2">
            {Object.entries(FAMILY_META).map(([id, meta]) => (
              <span
                key={id}
                className="flex items-center gap-1.5 text-xs text-muted"
                title={meta.description}
              >
                <span className="size-2 rounded-full" style={{ background: meta.color }} />
                {meta.label}
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
            <div className="h-[720px] overflow-hidden rounded-xl border border-border bg-bg">
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
              onToggle={toggleForPerson}
            />
          )}
        </CardContent>
      </Card>

      <div className="space-y-4">
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

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Assignment builder</CardTitle>
            <CardDescription>
              Select a person, then add or remove powers. This is a planning sandbox and does not
              change production access.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <label className="block text-sm">
              <span className="text-muted">Staff member / modeled job</span>
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-elevated px-3 py-2"
              >
                {assignments.map((person) => (
                  <option key={person.personId} value={person.personId}>
                    {person.personName} · {withPlaces(person.role, placesOf.get(person.personId))}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-border bg-elevated p-2">
                <p className="text-xs text-subtle">POWERS</p>
                <p className="text-lg font-semibold">{selected?.entitlements.length ?? 0}</p>
              </div>
              <div
                className={cn(
                  "rounded-lg border p-2",
                  selectedConflicts.length
                    ? "border-danger/30 bg-danger/10"
                    : "border-ok/30 bg-ok/10",
                )}
              >
                <p className="text-xs text-subtle">CONFLICTS</p>
                <p className="text-lg font-semibold">{selectedConflicts.length}</p>
              </div>
            </div>
            {selected?.personId.startsWith("sim-") && (
              <Button
                size="sm"
                variant="ghost"
                onClick={removeSelected}
                className="w-full text-danger"
              >
                <Trash2 className="size-3.5" />
                Remove modeled job
              </Button>
            )}
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 size-3.5 text-subtle" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Find a power or duty…"
                className="w-full rounded-lg border border-border bg-elevated py-2 pl-8 pr-3 text-sm"
              />
            </div>
            <div className="flex gap-1 overflow-x-auto pb-1">
              {(["all", ...Object.keys(FAMILY_META)] as (DutyFamily | "all")[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setFamily(item)}
                  className={cn(
                    "shrink-0 rounded-full border px-2 py-0.5 text-xs capitalize",
                    family === item
                      ? "border-primary/50 bg-primary/10"
                      : "border-border text-muted",
                  )}
                >
                  {item.replace("_", " ")}
                </button>
              ))}
            </div>
            <div className="max-h-[430px] space-y-1 overflow-y-auto pr-1">
              {visibleEntitlements.map((entitlement) => {
                const active = selected?.entitlements.includes(entitlement.id);
                const conflict = conflictEntitlements.has(entitlement.id);
                const guidance = guidanceByDuty[entitlement.id];
                const effect = toggleEffects.get(entitlement.id);
                const creates = effect?.created ?? 0;
                const resolves = effect?.resolved ?? 0;
                return (
                  <button
                    key={entitlement.id}
                    type="button"
                    onClick={() => toggle(entitlement.id)}
                    title={`${guidance.purpose} ${guidance.boundary}`}
                    className={cn(
                      "flex w-full items-start gap-2 rounded-lg border p-2 text-left",
                      active
                        ? conflict
                          ? "border-danger/40 bg-danger/10"
                          : "border-primary/30 bg-primary/10"
                        : creates
                          ? "border-danger/30 bg-danger/5"
                          : "border-border bg-elevated text-muted",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border text-xs",
                        active && "border-primary bg-primary text-primary-fg",
                      )}
                    >
                      {active ? "✓" : ""}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-medium">{entitlement.label}</span>
                      <span className="text-xs capitalize text-subtle">
                        {FAMILY_META[entitlement.family].label} · risk {entitlement.riskWeight}/5
                      </span>
                      <span className="mt-1 block text-xs leading-relaxed text-subtle">
                        {guidance.purpose}
                      </span>
                      {creates > 0 && (
                        <span className="mt-1 block text-xs font-medium text-danger">
                          Assigning creates {creates} conflict{creates === 1 ? "" : "s"}
                        </span>
                      )}
                      {resolves > 0 && (
                        <span className="mt-1 block text-xs font-medium text-ok">
                          Removing resolves {resolves} conflict{resolves === 1 ? "" : "s"}
                        </span>
                      )}
                    </span>
                    {(conflict || creates > 0) && (
                      <AlertTriangle className="ml-auto size-3.5 shrink-0 text-danger" />
                    )}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
