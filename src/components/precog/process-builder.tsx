import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { usePractice } from "@/lib/precog/practice-context";
import { useTemplate } from "@/lib/precog/use-template";
import type {
  LeanWasteKind,
  ProcessIdea,
  ProcessNode,
  ProcessRisk,
  ProcessRiskKind,
  ProcessWaste,
} from "@/lib/precog/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  Download,
  Hammer,
  Lightbulb,
  Plus,
  Recycle,
  RotateCcw,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import type { Person } from "@/lib/precog/types";
import { getBaseTemplate } from "@/lib/precog/active-template";
import { industryMeta } from "@/lib/precog/industry";
import { suggestForProcess } from "@/lib/precog/builder/suggest-server";
import type { SuggestionResult } from "@/lib/precog/builder/suggest";
import {
  Blocks,
  GitCompare,
  Loader2,
  Redo2,
  Save,
  ShieldCheck,
  Sparkles,
  Undo2,
  Wand2,
} from "lucide-react";
import { suggestControlForProcess, suggestOwnerForProcess } from "@/lib/precog/builder/quick-fix";
import {
  analyzeWorkload,
  healthDelta,
  previewMapHealth,
  type HealthDelta,
  type PersonWorkload,
} from "@/lib/precog/builder/what-if";
import { Activity, ChevronRight, Gauge, HelpCircle, Scale } from "lucide-react";
import { BuilderTour, useBuilderTour } from "@/components/precog/builder-tour";
import {
  blocksForIndustry,
  instantiateBlock,
  processToSavedBlock,
  type ProcessBlock,
  type SavedProcessBlock,
} from "@/lib/precog/builder/process-blocks";
import {
  validateProcessMap,
  type MapValidationIssue,
} from "@/lib/precog/process-graph";
import { ENTITLEMENTS, type EntitlementId } from "@/lib/precog/sod/conflict-rules";

const RISK_KINDS: ProcessRiskKind[] = [
  "fraud",
  "control",
  "continuity",
  "compliance",
  "quality",
  "revenue",
  "safety",
];
const IDEA_CATEGORIES: ProcessIdea["category"][] = [
  "control",
  "lean",
  "tech",
  "training",
  "policy",
];
const EFFORTS: ProcessIdea["effort"][] = ["low", "medium", "high"];
const IDEA_STATUS: ProcessIdea["status"][] = ["backlog", "exploring", "planned", "done"];
const WASTE_KINDS: { id: LeanWasteKind; label: string }[] = [
  { id: "muda_waiting", label: "Waiting" },
  { id: "muda_rework", label: "Rework" },
  { id: "muda_motion", label: "Motion" },
  { id: "muda_overprocessing", label: "Over-processing" },
  { id: "mura", label: "Unevenness (mura)" },
  { id: "muri", label: "Overburden (muri)" },
];

function slug(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

const inputCls =
  "w-full rounded-lg border border-border bg-elevated px-2.5 py-1.5 text-xs text-fg placeholder:text-subtle focus:border-primary/50 focus:outline-none";
const labelCls = "block text-[10px] font-medium tracking-wide text-subtle uppercase";

export function ProcessBuilder({
  selectedProcessId,
  onSelectProcess,
  onClose,
}: {
  selectedProcessId: string | null;
  onSelectProcess: (id: string) => void;
  onClose: () => void;
}) {
  const tpl = useTemplate();
  const {
    profile,
    setCustomProcesses,
    setCustomPeople,
    setMapLayout,
    setSavedProcessBlocks,
    mapCustomized,
    undoMap,
    redoMap,
    canUndoMap,
    canRedoMap,
  } = usePractice();
  const processes = tpl.processes;
  const [showTeam, setShowTeam] = useState(false);
  const [showChanges, setShowChanges] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  const [showBlocks, setShowBlocks] = useState(false);
  const [showWorkload, setShowWorkload] = useState(false);
  const tour = useBuilderTour();

  const currentHealth = useMemo(
    () =>
      previewMapHealth(processes, profile.staff, {
        people: tpl.people,
        layout: profile.mapLayout ?? {},
        customized: mapCustomized,
      }),
    [processes, profile.staff, tpl.people, profile.mapLayout, mapCustomized],
  );
  // Baseline when the builder opened — shows the session's net effect.
  const sessionBaseline = useRef<number | null>(null);
  if (sessionBaseline.current === null) sessionBaseline.current = currentHealth.score;

  /** Score a hypothetical process list against the current one. */
  const whatIf = (next: ProcessNode[]): HealthDelta =>
    healthDelta(
      currentHealth,
      previewMapHealth(next, profile.staff, {
        people: tpl.people,
        layout: profile.mapLayout ?? {},
        customized: true,
      }),
    );

  const workload = useMemo(
    () =>
      showWorkload
        ? analyzeWorkload(processes, tpl.people, profile.staff, profile.dualRelease)
        : [],
    [showWorkload, processes, tpl.people, profile.staff, profile.dualRelease],
  );

  const validationIssues = useMemo(
    () =>
      validateProcessMap(
        processes,
        tpl.people,
        new Set(tpl.controls.map((c) => c.id)),
        profile.mapLayout ?? {},
      ),
    [processes, tpl.people, tpl.controls, profile.mapLayout],
  );
  const selected = processes.find((p) => p.id === selectedProcessId) ?? null;
  const fileRef = useRef<HTMLInputElement>(null);

  function update(id: string, patch: Partial<ProcessNode>) {
    setCustomProcesses((cur) => cur.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  /** Compute the process list a quick fix would produce, without applying it. */
  function quickFixResult(issueId: string, processId: string): ProcessNode[] | null {
    const proc = processes.find((p) => p.id === processId);
    if (!proc) return null;
    const replace = (patch: Partial<ProcessNode>) =>
      processes.map((p) => (p.id === processId ? { ...p, ...patch } : p));
    if (issueId.startsWith("owner-ref-") || issueId.startsWith("dep-")) {
      const ids = new Set(processes.map((p) => p.id));
      const pids = new Set(tpl.people.map((p) => p.id));
      return replace({
        dependencies: proc.dependencies.filter((d) => ids.has(d)),
        ownerPersonIds: (proc.ownerPersonIds ?? []).filter((o) => pids.has(o)),
      });
    }
    if (issueId.startsWith("owner-")) {
      const owner = suggestOwnerForProcess(proc, processes, tpl.people);
      return owner ? replace({ ownerPersonIds: [...(proc.ownerPersonIds ?? []), owner.id] }) : null;
    }
    if (issueId.startsWith("fraud-nocontrol-")) {
      const control = suggestControlForProcess(proc, tpl.controls);
      return control ? replace({ controlIds: [...proc.controlIds, control.id] }) : null;
    }
    return null;
  }

  function previewQuickFix(issueId: string, processId: string): HealthDelta | null {
    const next = quickFixResult(issueId, processId);
    return next ? whatIf(next) : null;
  }

  function previewBlock(block: ProcessBlock | SavedProcessBlock): HealthDelta {
    const ids = new Set(processes.map((p) => p.id));
    const maxStage = Math.max(0, ...processes.map((p) => p.stage ?? 0));
    return whatIf([...processes, instantiateBlock(block, ids, maxStage + 1)]);
  }

  /** Apply one quick fix for a validation issue; returns true if something changed. */
  function quickFix(issueId: string, processId: string): boolean {
    const proc = processes.find((p) => p.id === processId);
    if (!proc) return false;
    if (issueId.startsWith("owner-")) {
      const owner = suggestOwnerForProcess(proc, processes, tpl.people);
      if (!owner) return false;
      update(processId, { ownerPersonIds: [...(proc.ownerPersonIds ?? []), owner.id] });
      toast.success(`${owner.name} assigned to ${proc.name}`);
      return true;
    }
    if (issueId.startsWith("fraud-nocontrol-")) {
      const control = suggestControlForProcess(proc, tpl.controls);
      if (!control) return false;
      update(processId, { controlIds: [...proc.controlIds, control.id] });
      toast.success(`Mapped "${control.name}" to ${proc.name}`);
      return true;
    }
    if (issueId.startsWith("dep-") || issueId.startsWith("owner-ref-")) {
      const ids = new Set(processes.map((p) => p.id));
      const pids = new Set(tpl.people.map((p) => p.id));
      update(processId, {
        dependencies: proc.dependencies.filter((d) => ids.has(d)),
        ownerPersonIds: (proc.ownerPersonIds ?? []).filter((o) => pids.has(o)),
      });
      toast.success(`Removed broken references on ${proc.name}`);
      return true;
    }
    return false;
  }

  function fixAllQuickWins() {
    const fixable = validationIssues.filter(
      (i) =>
        i.processId &&
        (i.id.startsWith("owner-") ||
          i.id.startsWith("fraud-nocontrol-") ||
          i.id.startsWith("dep-")),
    );
    if (!fixable.length) return;
    // Batch into one state update so undo reverts the whole sweep.
    const ids = new Set(processes.map((p) => p.id));
    const pids = new Set(tpl.people.map((p) => p.id));
    let touched = 0;
    setCustomProcesses((cur) =>
      cur.map((p) => {
        const mine = fixable.filter((i) => i.processId === p.id);
        if (!mine.length) return p;
        let next = { ...p };
        for (const i of mine) {
          if (i.id.startsWith("owner-ref-") || i.id.startsWith("dep-")) {
            next = {
              ...next,
              dependencies: next.dependencies.filter((d) => ids.has(d)),
              ownerPersonIds: (next.ownerPersonIds ?? []).filter((o) => pids.has(o)),
            };
          } else if (i.id.startsWith("owner-")) {
            const owner = suggestOwnerForProcess(next, cur, tpl.people);
            if (owner) next = { ...next, ownerPersonIds: [...(next.ownerPersonIds ?? []), owner.id] };
          } else if (i.id.startsWith("fraud-nocontrol-")) {
            const control = suggestControlForProcess(next, tpl.controls);
            if (control) next = { ...next, controlIds: [...next.controlIds, control.id] };
          }
          touched += 1;
        }
        return next;
      }),
    );
    toast.success(`Applied ${touched} quick fix(es)`, {
      description: "Review the suggestions — undo if anything looks off.",
    });
  }

  function insertBlock(block: ProcessBlock | SavedProcessBlock) {
    const ids = new Set(processes.map((p) => p.id));
    const maxStage = Math.max(0, ...processes.map((p) => p.stage ?? 0));
    const node = instantiateBlock(block, ids, maxStage + 1);
    setCustomProcesses((cur) => [...cur, node]);
    onSelectProcess(node.id);
    toast.success(`Inserted "${block.name}"`, {
      description: "Assign owners and wire dependencies on the canvas.",
    });
  }

  function addProcess() {
    const name = "New process";
    const base = slug(name) || "process";
    let id = `proc-${base}`;
    let n = 2;
    while (processes.some((p) => p.id === id)) id = `proc-${base}-${n++}`;
    const maxStage = Math.max(0, ...processes.map((p) => p.stage ?? 0));
    const node: ProcessNode = {
      id,
      name,
      layer: "process",
      description: "Describe what this process does and who touches it.",
      dependencies: [],
      controlIds: [],
      stage: maxStage,
      ownerPersonIds: [],
      risks: [],
      ideas: [],
      wastes: [],
      inputs: [],
      outputs: [],
    };
    setCustomProcesses((cur) => [...cur, node]);
    onSelectProcess(id);
    toast.success("Process added", { description: "Rename it and wire dependencies." });
  }

  function removeProcess(id: string) {
    const p = processes.find((x) => x.id === id);
    if (!p) return;
    if (!window.confirm(`Delete "${p.name}"? Dependencies pointing to it are removed.`)) return;
    setCustomProcesses((cur) =>
      cur
        .filter((x) => x.id !== id)
        .map((x) => ({ ...x, dependencies: x.dependencies.filter((d) => d !== id) })),
    );
    setMapLayout((l) => {
      const next = { ...l };
      delete next[id];
      return next;
    });
    const fallback = processes.find((x) => x.id !== id);
    if (fallback) onSelectProcess(fallback.id);
    toast("Process deleted");
  }

  function resetToTemplate() {
    if (!window.confirm("Discard your custom map and team, and restore the industry template?"))
      return;
    setCustomProcesses(null);
    setCustomPeople(null);
    setMapLayout({});
    toast.success("Template restored");
  }

  function exportMap() {
    const payload = {
      version: 2,
      industry: profile.industry,
      businessName: profile.practiceName,
      exportedAt: new Date().toISOString(),
      processes,
      people: tpl.people,
      layout: profile.mapLayout ?? {},
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug(profile.practiceName) || "process-map"}-map.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Map exported");
  }

  async function importMap(file: File) {
    try {
      const parsed = JSON.parse(await file.text()) as {
        processes?: ProcessNode[];
        people?: Person[];
        layout?: Record<string, { x: number; y: number }>;
      };
      if (!Array.isArray(parsed.processes) || parsed.processes.length === 0) {
        throw new Error("File has no processes");
      }
      const procIds = new Set(
        parsed.processes
          .filter((p) => p && typeof p.id === "string")
          .map((p) => p.id as string),
      );
      const cleaned: ProcessNode[] = parsed.processes
        .filter((p) => p && typeof p.id === "string" && typeof p.name === "string")
        .map((p) => ({
          id: p.id,
          name: p.name,
          layer: "process",
          description: p.description ?? "",
          dependencies: Array.isArray(p.dependencies)
            ? p.dependencies.filter((d) => procIds.has(d))
            : [],
          controlIds: Array.isArray(p.controlIds) ? p.controlIds : [],
          stage: typeof p.stage === "number" ? p.stage : 0,
          ownerPersonIds: Array.isArray(p.ownerPersonIds) ? p.ownerPersonIds : [],
          risks: Array.isArray(p.risks) ? p.risks : [],
          ideas: Array.isArray(p.ideas) ? p.ideas : [],
          wastes: Array.isArray(p.wastes) ? p.wastes : [],
          inputs: Array.isArray(p.inputs) ? p.inputs : [],
          outputs: Array.isArray(p.outputs) ? p.outputs : [],
        }));
      if (Array.isArray(parsed.people) && parsed.people.length) {
        setCustomPeople(
          parsed.people
            .filter((p) => p && typeof p.id === "string" && typeof p.name === "string")
            .map((p) => ({
              id: p.id,
              name: p.name,
              role: p.role ?? "Team member",
              active: p.active ?? true,
              tenureYears: typeof p.tenureYears === "number" ? p.tenureYears : 1,
              entitlements: Array.isArray(p.entitlements) ? p.entitlements : undefined,
            })),
        );
      }
      const importIssues = validateProcessMap(
        cleaned,
        Array.isArray(parsed.people) ? parsed.people : tpl.people,
        new Set(tpl.controls.map((c) => c.id)),
        parsed.layout ?? {},
      );
      setCustomProcesses(cleaned);
      setMapLayout(parsed.layout ?? {});
      onSelectProcess(cleaned[0].id);
      const errs = importIssues.filter((i) => i.severity === "error").length;
      toast.success(`Imported ${cleaned.length} processes`, {
        description:
          errs > 0
            ? `${errs} issue(s) found — open Validate to review`
            : importIssues.length
              ? `${importIssues.length} warning(s) — open Validate`
              : undefined,
      });
    } catch (e) {
      toast.error("Import failed", {
        description: e instanceof Error ? e.message : "Invalid file",
      });
    }
  }

  return (
    <Card className="border-accent/30">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Hammer className="size-4 text-accent" />
              Map builder
              {mapCustomized && <Badge variant="accent">custom</Badge>}
            </CardTitle>
            <CardDescription>
              Build your real value stream. Every change re-scores residual risk, SoD, and
              scenarios live.
            </CardDescription>
            <HealthPill
              score={currentHealth.score}
              band={currentHealth.bandLabel}
              sessionDelta={currentHealth.score - (sessionBaseline.current ?? currentHealth.score)}
            />
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            {!tour.show && (
              <button
                type="button"
                onClick={tour.restart}
                className="rounded-md p-1 text-muted hover:bg-elevated hover:text-fg"
                aria-label="Show builder tour"
                title="Show quick tour"
              >
                <HelpCircle className="size-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-muted hover:bg-elevated hover:text-fg"
              aria-label="Close builder"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {tour.show && (
          <BuilderTour
            onDismiss={tour.dismiss}
            onAction={(a) => {
              if (a === "blocks") setShowBlocks(true);
              if (a === "validate") setShowValidation(true);
              if (a === "add") addProcess();
            }}
          />
        )}
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" onClick={addProcess}>
            <Plus className="size-3.5" /> Add process
          </Button>
          <Button
            size="sm"
            variant={showBlocks ? "default" : "secondary"}
            onClick={() => setShowBlocks((v) => !v)}
          >
            <Blocks className="size-3.5" /> Blocks
          </Button>
          <div className="inline-flex overflow-hidden rounded-md border border-border">
            <button
              type="button"
              onClick={undoMap}
              disabled={!canUndoMap}
              title="Undo (Ctrl+Z)"
              aria-label="Undo"
              className="inline-flex h-8 items-center px-2 text-muted hover:bg-elevated hover:text-fg disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <Undo2 className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={redoMap}
              disabled={!canRedoMap}
              title="Redo (Ctrl+Shift+Z)"
              aria-label="Redo"
              className="inline-flex h-8 items-center border-l border-border px-2 text-muted hover:bg-elevated hover:text-fg disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <Redo2 className="size-3.5" />
            </button>
          </div>
          <Button size="sm" variant="secondary" onClick={exportMap}>
            <Download className="size-3.5" /> Export
          </Button>
          <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>
            <Upload className="size-3.5" /> Import
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importMap(f);
              e.target.value = "";
            }}
          />
          <Button
            size="sm"
            variant={showTeam ? "default" : "secondary"}
            onClick={() => setShowTeam((v) => !v)}
          >
            <Users className="size-3.5" /> Team ({tpl.people.length})
          </Button>
          <Button
            size="sm"
            variant={showWorkload ? "default" : "secondary"}
            onClick={() => setShowWorkload((v) => !v)}
          >
            <Scale className="size-3.5" /> Workload
          </Button>
          <Button
            size="sm"
            variant={showValidation ? "default" : "secondary"}
            onClick={() => setShowValidation((v) => !v)}
          >
            <ShieldCheck className="size-3.5" />
            Validate
            {validationIssues.filter((i) => i.severity === "error").length > 0 && (
              <Badge variant="warn" className="ml-1 px-1 py-0 text-[9px]">
                {validationIssues.filter((i) => i.severity === "error").length}
              </Badge>
            )}
          </Button>
          {mapCustomized && (
            <Button
              size="sm"
              variant={showChanges ? "default" : "secondary"}
              onClick={() => setShowChanges((v) => !v)}
            >
              <GitCompare className="size-3.5" /> Changes
            </Button>
          )}
          {mapCustomized && (
            <Button size="sm" variant="ghost" onClick={resetToTemplate}>
              <RotateCcw className="size-3.5" /> Template
            </Button>
          )}
        </div>

        {showWorkload && (
          <WorkloadView
            rows={workload}
            processCount={processes.length}
            onSelectProcess={onSelectProcess}
            onReassign={(fromId, processId) => {
              const proc = processes.find((p) => p.id === processId);
              if (!proc) return;
              const others = tpl.people.filter((p) => p.id !== fromId && p.active);
              const candidate = suggestOwnerForProcess(
                { ...proc, ownerPersonIds: [] },
                processes,
                others,
              );
              if (!candidate) return;
              update(processId, {
                ownerPersonIds: [
                  ...(proc.ownerPersonIds ?? []).filter((o) => o !== fromId),
                  candidate.id,
                ],
              });
              toast.success(`${proc.name} reassigned to ${candidate.name}`);
            }}
          />
        )}

        {showBlocks && (
          <BlockLibrary
            industry={profile.industry}
            saved={profile.savedProcessBlocks ?? []}
            onInsert={insertBlock}
            previewDelta={previewBlock}
            onRemoveSaved={(id) =>
              setSavedProcessBlocks((blocks) => blocks.filter((b) => b.id !== id))
            }
          />
        )}

        {showValidation && (
          <ValidationPanel
            issues={validationIssues}
            onSelectProcess={(id) => {
              onSelectProcess(id);
              setShowValidation(false);
            }}
            onQuickFix={quickFix}
            onFixAll={fixAllQuickWins}
            previewFix={previewQuickFix}
            onCleanLayout={() => {
              const ids = new Set(processes.map((p) => p.id));
              setMapLayout((l) =>
                Object.fromEntries(Object.entries(l).filter(([k]) => ids.has(k))),
              );
              toast.success("Removed stale layout positions");
            }}
          />
        )}

        {showChanges && mapCustomized && (
          <ChangesView processes={processes} people={tpl.people} onSelectProcess={onSelectProcess} />
        )}

        {showTeam && (
          <TeamEditor
            people={tpl.people}
            onChange={(next) => setCustomPeople(next)}
          />
        )}

        <div>
          <span className={labelCls}>Processes ({processes.length})</span>
          <div className="mt-1 flex flex-wrap gap-1">
            {processes
              .slice()
              .sort((a, b) => (a.stage ?? 0) - (b.stage ?? 0))
              .map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onSelectProcess(p.id)}
                  className={cn(
                    "rounded-md border px-2 py-0.5 text-[11px] transition-colors",
                    p.id === selectedProcessId
                      ? "border-primary/50 bg-primary/15 text-fg"
                      : "border-border bg-elevated text-muted hover:text-fg",
                  )}
                >
                  {p.name}
                </button>
              ))}
          </div>
        </div>

        {selected ? (
          <ProcessForm
            key={selected.id}
            process={selected}
            all={processes}
            onChange={(patch) => update(selected.id, patch)}
            onDelete={() => removeProcess(selected.id)}
            onSaveAsBlock={() => {
              const block = processToSavedBlock(selected);
              setSavedProcessBlocks((blocks) => [block, ...blocks]);
              toast.success(`Saved "${selected.name}" as reusable block`);
            }}
          />
        ) : (
          <p className="text-xs text-muted">Select a process on the map to edit it.</p>
        )}
      </CardContent>
    </Card>
  );
}

function ChangesView({
  processes,
  people,
  onSelectProcess,
}: {
  processes: ProcessNode[];
  people: Person[];
  onSelectProcess: (id: string) => void;
}) {
  const base = getBaseTemplate();
  const baseById = new Map(base.processes.map((p) => [p.id, p]));
  const curById = new Map(processes.map((p) => [p.id, p]));

  const added = processes.filter((p) => !baseById.has(p.id));
  const removed = base.processes.filter((p) => !curById.has(p.id));
  const modified = processes
    .filter((p) => baseById.has(p.id))
    .map((p) => {
      const b = baseById.get(p.id)!;
      const changes: string[] = [];
      if (p.name !== b.name) changes.push("renamed");
      if (p.description !== b.description) changes.push("description");
      if ((p.stage ?? 0) !== (b.stage ?? 0)) changes.push("stage");
      if (p.dependencies.join("|") !== b.dependencies.join("|")) changes.push("dependencies");
      if ((p.ownerPersonIds ?? []).join("|") !== (b.ownerPersonIds ?? []).join("|"))
        changes.push("owners");
      if (p.controlIds.join("|") !== b.controlIds.join("|")) changes.push("controls");
      const d = (a?: unknown[], c?: unknown[]) => (a?.length ?? 0) - (c?.length ?? 0);
      const dr = d(p.risks, b.risks);
      const di = d(p.ideas, b.ideas);
      const dw = d(p.wastes, b.wastes);
      if (dr) changes.push(`${dr > 0 ? "+" : ""}${dr} risk${Math.abs(dr) === 1 ? "" : "s"}`);
      if (di) changes.push(`${di > 0 ? "+" : ""}${di} idea${Math.abs(di) === 1 ? "" : "s"}`);
      if (dw) changes.push(`${dw > 0 ? "+" : ""}${dw} waste`);
      return { p, changes };
    })
    .filter((x) => x.changes.length);

  const basePeople = new Set(base.people.map((p) => p.id));
  const curPeople = new Set(people.map((p) => p.id));
  const peopleAdded = people.filter((p) => !basePeople.has(p.id));
  const peopleRemoved = base.people.filter((p) => !curPeople.has(p.id));

  const total =
    added.length + removed.length + modified.length + peopleAdded.length + peopleRemoved.length;

  return (
    <div className="space-y-2 rounded-lg border border-border bg-panel p-2.5 text-[11px]">
      <p className="text-muted">
        <span className="font-medium text-fg">{total}</span> change{total === 1 ? "" : "s"} vs the{" "}
        {industryMeta(base.id).label} template.
      </p>
      {added.length > 0 && (
        <ChangeGroup label="Added processes" tone="ok">
          {added.map((p) => (
            <ChangeRow key={p.id} label={p.name} onClick={() => onSelectProcess(p.id)} />
          ))}
        </ChangeGroup>
      )}
      {removed.length > 0 && (
        <ChangeGroup label="Removed processes" tone="danger">
          {removed.map((p) => (
            <ChangeRow key={p.id} label={p.name} />
          ))}
        </ChangeGroup>
      )}
      {modified.length > 0 && (
        <ChangeGroup label="Edited processes" tone="warn">
          {modified.map(({ p, changes }) => (
            <ChangeRow
              key={p.id}
              label={p.name}
              detail={changes.join(" · ")}
              onClick={() => onSelectProcess(p.id)}
            />
          ))}
        </ChangeGroup>
      )}
      {(peopleAdded.length > 0 || peopleRemoved.length > 0) && (
        <ChangeGroup label="Team" tone="primary">
          {peopleAdded.map((p) => (
            <ChangeRow key={p.id} label={`+ ${p.name}`} detail={p.role} />
          ))}
          {peopleRemoved.map((p) => (
            <ChangeRow key={p.id} label={`− ${p.name}`} detail={p.role} />
          ))}
        </ChangeGroup>
      )}
    </div>
  );
}

function ChangeGroup({
  label,
  tone,
  children,
}: {
  label: string;
  tone: "ok" | "danger" | "warn" | "primary";
  children: React.ReactNode;
}) {
  return (
    <div>
      <Badge variant={tone}>{label}</Badge>
      <ul className="mt-1 space-y-0.5">{children}</ul>
    </div>
  );
}

function ChangeRow({
  label,
  detail,
  onClick,
}: {
  label: string;
  detail?: string;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <span className="font-medium text-fg">{label}</span>
      {detail && <span className="text-subtle"> · {detail}</span>}
    </>
  );
  return (
    <li>
      {onClick ? (
        <button type="button" onClick={onClick} className="text-left hover:underline">
          {inner}
        </button>
      ) : (
        <span>{inner}</span>
      )}
    </li>
  );
}

function SuggestPanel({
  process,
  onChange,
}: {
  process: ProcessNode;
  onChange: (patch: Partial<ProcessNode>) => void;
}) {
  const tpl = useTemplate();
  const { profile } = usePractice();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SuggestionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await suggestForProcess({
        data: {
          processName: process.name,
          description: process.description,
          industryLabel: industryMeta(profile.industry).label,
          existingRiskTitles: (process.risks ?? []).map((r) => r.title),
          existingIdeaTitles: (process.ideas ?? []).map((i) => i.title),
          availableControls: tpl.controls.map((c) => ({ id: c.id, name: c.name })),
          ownerRoles: (process.ownerPersonIds ?? [])
            .map((id) => tpl.people.find((p) => p.id === id)?.role)
            .filter((r): r is string => Boolean(r)),
        },
      });
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Suggestion failed");
    } finally {
      setLoading(false);
    }
  }

  const existingRisk = new Set((process.risks ?? []).map((r) => r.title.toLowerCase()));
  const existingIdea = new Set((process.ideas ?? []).map((i) => i.title.toLowerCase()));

  return (
    <div className="space-y-2 rounded-lg border border-dashed border-accent/40 bg-accent/5 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className={cn(labelCls, "flex items-center gap-1")}>
          <Sparkles className="size-3 text-accent" />
          Suggest risks & controls
        </span>
        <Button size="sm" variant="secondary" onClick={run} disabled={loading}>
          {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
          {result ? "Again" : "Suggest"}
        </Button>
      </div>
      {!result && !loading && (
        <p className="text-[11px] text-muted">
          Get starter risks, improvement ideas, and matching controls for this process based on
          its name and description.
        </p>
      )}
      {error && <p className="text-[11px] text-danger">{error}</p>}
      {result && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-subtle">
            <Badge variant={result.source === "grok" ? "accent" : "default"}>
              {result.source === "grok" ? `Grok · ${result.model ?? ""}` : "Rule-based"}
            </Badge>
            <span>{result.rationale}</span>
          </div>
          {result.risks.length > 0 && (
            <ul className="space-y-1">
              {result.risks.map((r) => {
                const added = existingRisk.has(r.title.toLowerCase());
                return (
                  <li
                    key={r.title}
                    className="flex items-start gap-2 rounded-md border border-border bg-elevated px-2 py-1.5 text-[11px]"
                  >
                    <AlertTriangle className="mt-0.5 size-3 shrink-0 text-danger" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-fg">{r.title}</p>
                      <p className="text-subtle">
                        {r.kind} · S{r.severity}×L{r.likelihood}
                        {r.note ? ` · ${r.note}` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={added}
                      onClick={() =>
                        onChange({ risks: [...(process.risks ?? []), { ...r, id: uid("r") }] })
                      }
                      className="text-[10px] font-medium text-primary hover:underline disabled:text-subtle disabled:no-underline"
                    >
                      {added ? "Added" : "Add"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {result.ideas.length > 0 && (
            <ul className="space-y-1">
              {result.ideas.map((i) => {
                const added = existingIdea.has(i.title.toLowerCase());
                return (
                  <li
                    key={i.title}
                    className="flex items-start gap-2 rounded-md border border-border bg-elevated px-2 py-1.5 text-[11px]"
                  >
                    <Lightbulb className="mt-0.5 size-3 shrink-0 text-warn" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-fg">{i.title}</p>
                      <p className="text-subtle">
                        {i.category} · {i.effort} effort · {i.impact} impact
                        {i.note ? ` · ${i.note}` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={added}
                      onClick={() =>
                        onChange({ ideas: [...(process.ideas ?? []), { ...i, id: uid("i") }] })
                      }
                      className="text-[10px] font-medium text-primary hover:underline disabled:text-subtle disabled:no-underline"
                    >
                      {added ? "Added" : "Add"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {result.controlIds.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 text-[11px]">
              <span className="text-subtle">Link controls:</span>
              {result.controlIds.map((cid) => {
                const c = tpl.controls.find((x) => x.id === cid);
                if (!c) return null;
                const on = process.controlIds.includes(cid);
                return (
                  <button
                    key={cid}
                    type="button"
                    disabled={on}
                    onClick={() => onChange({ controlIds: [...process.controlIds, cid] })}
                    className={cn(
                      "rounded-md border px-2 py-0.5",
                      on
                        ? "border-primary/40 bg-primary/10 text-subtle"
                        : "border-border bg-elevated text-muted hover:text-fg",
                    )}
                  >
                    {on ? "✓ " : "+ "}
                    {c.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function HealthPill({
  score,
  band,
  sessionDelta,
}: {
  score: number;
  band: string;
  sessionDelta: number;
}) {
  const tone =
    score >= 70 ? "text-ok border-ok/40 bg-ok/10" : score >= 55 ? "text-warn border-warn/40 bg-warn/10" : "text-danger border-danger/40 bg-danger/10";
  return (
    <div className="mt-2 inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px]">
      <span className={cn("inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 font-semibold tabular", tone)}>
        <Gauge className="size-3" />
        {score}
      </span>
      <span className="text-muted">Map health · {band}</span>
      {sessionDelta !== 0 && (
        <span className={cn("font-medium tabular", sessionDelta > 0 ? "text-ok" : "text-danger")}>
          {sessionDelta > 0 ? "+" : ""}
          {sessionDelta} this session
        </span>
      )}
    </div>
  );
}

/** Compact "+4" / "−2" badge for what-if previews. */
function DeltaBadge({ delta, title }: { delta: HealthDelta | null; title?: string }) {
  if (!delta || delta.delta === 0) return null;
  const up = delta.delta > 0;
  return (
    <span
      title={
        title ??
        (delta.driver
          ? `Health ${delta.before} → ${delta.after} · ${delta.driver.label} ${delta.driver.delta > 0 ? "+" : ""}${delta.driver.delta}`
          : `Health ${delta.before} → ${delta.after}`)
      }
      className={cn(
        "inline-flex items-center gap-0.5 rounded px-1 py-px text-[10px] font-semibold tabular",
        up ? "bg-ok/15 text-ok" : "bg-danger/15 text-danger",
      )}
    >
      <Activity className="size-2.5" />
      {up ? "+" : ""}
      {delta.delta}
    </span>
  );
}

function WorkloadView({
  rows,
  processCount,
  onSelectProcess,
  onReassign,
}: {
  rows: PersonWorkload[];
  processCount: number;
  onSelectProcess: (id: string) => void;
  onReassign: (fromPersonId: string, processId: string) => void;
}) {
  const [open, setOpen] = useState<string | null>(rows[0]?.person.id ?? null);
  const overloaded = rows.filter((r) => r.load >= 70).length;
  const idle = rows.filter((r) => !r.ownedProcesses.length).length;

  return (
    <div className="space-y-2 rounded-lg border border-border bg-panel p-2.5">
      <p className="text-[11px] text-muted">
        Who carries the risk. {overloaded ? `${overloaded} overburdened · ` : ""}
        {idle ? `${idle} with no processes · ` : ""}
        {processCount} processes across {rows.length} people.
      </p>
      <ul className="space-y-1">
        {rows.map((r) => {
          const expanded = open === r.person.id;
          const loadColor =
            r.load >= 70 ? "var(--color-danger)" : r.load >= 45 ? "var(--color-warn)" : "var(--color-ok)";
          return (
            <li key={r.person.id} className="rounded-md border border-border bg-elevated">
              <button
                type="button"
                onClick={() => setOpen(expanded ? null : r.person.id)}
                className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-[11px]"
              >
                <ChevronRight
                  className={cn("size-3 shrink-0 text-subtle transition-transform", expanded && "rotate-90")}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">
                    <span className="font-medium text-fg">{r.person.name}</span>
                    <span className="text-subtle"> · {r.person.role}</span>
                  </span>
                  <span className="block text-[10px] text-subtle">
                    {r.ownedProcesses.length} proc · {r.entitlementCount} duties
                    {r.criticalConflicts ? ` · ${r.criticalConflicts} critical SoD` : ""}
                  </span>
                </span>
                <span className="flex w-20 shrink-0 items-center gap-1.5">
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface">
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${r.load}%`, background: loadColor }}
                    />
                  </span>
                  <span className="w-6 text-right tabular text-subtle">{r.load}</span>
                </span>
              </button>
              {expanded && (
                <div className="space-y-1.5 border-t border-border px-2 py-1.5 text-[11px]">
                  {r.flags.length > 0 && (
                    <ul className="flex flex-wrap gap-1">
                      {r.flags.map((f) => (
                        <li
                          key={f}
                          className="rounded border border-warn/30 bg-warn/10 px-1.5 py-0.5 text-[10px] text-fg"
                        >
                          {f}
                        </li>
                      ))}
                    </ul>
                  )}
                  {r.ownedProcesses.length > 0 ? (
                    <ul className="space-y-0.5">
                      {r.ownedProcesses.map((p) => (
                        <li key={p.id} className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onSelectProcess(p.id)}
                            className="min-w-0 flex-1 truncate text-left text-fg hover:underline"
                          >
                            {p.name}
                          </button>
                          {r.load >= 70 && (
                            <button
                              type="button"
                              onClick={() => onReassign(r.person.id, p.id)}
                              className="shrink-0 text-[10px] text-primary hover:underline"
                              title="Move to the next best owner"
                            >
                              Reassign
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-subtle">Owns no processes.</p>
                  )}
                  {r.conflicts.length > 0 && (
                    <p className="text-subtle">
                      SoD: {r.conflicts.slice(0, 2).map((c) => c.title).join(" · ")}
                      {r.conflicts.length > 2 ? ` · +${r.conflicts.length - 2} more` : ""}
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function BlockLibrary({
  industry,
  saved,
  onInsert,
  onRemoveSaved,
  previewDelta,
}: {
  industry: import("@/lib/precog/industry").IndustryId;
  saved: SavedProcessBlock[];
  onInsert: (block: ProcessBlock | SavedProcessBlock) => void;
  onRemoveSaved: (id: string) => void;
  previewDelta: (block: ProcessBlock | SavedProcessBlock) => HealthDelta;
}) {
  const builtIn = useMemo(() => blocksForIndustry(industry), [industry]);

  return (
    <div className="space-y-2 rounded-lg border border-border bg-panel p-2.5">
      <p className="text-[11px] text-muted">
        Drop pre-built control patterns onto your map — risks, controls, and I/O included. The
        badge previews the map-health change before you insert.
      </p>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {builtIn.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => onInsert(b)}
            className="rounded-md border border-border bg-elevated px-2.5 py-2 text-left transition-colors hover:border-primary/40"
          >
            <div className="flex items-start justify-between gap-1">
              <p className="text-[11px] font-medium text-fg">{b.name}</p>
              <DeltaBadge delta={previewDelta(b)} />
            </div>
            <p className="mt-0.5 line-clamp-2 text-[10px] text-muted">{b.description}</p>
            <Badge variant="default" className="mt-1 text-[9px]">
              {b.category}
            </Badge>
          </button>
        ))}
      </div>
      {saved.length > 0 && (
        <>
          <p className={cn(labelCls, "mt-2")}>Your saved blocks</p>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {saved.map((b) => (
              <div
                key={b.id}
                className="flex items-start gap-1 rounded-md border border-accent/30 bg-accent/5 px-2 py-1.5"
              >
                <button
                  type="button"
                  onClick={() => onInsert(b)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="flex items-center gap-1 text-[11px] font-medium text-fg">
                    {b.name}
                    <DeltaBadge delta={previewDelta(b)} />
                  </p>
                  <p className="line-clamp-1 text-[10px] text-muted">{b.description}</p>
                </button>
                <button
                  type="button"
                  onClick={() => onRemoveSaved(b.id)}
                  className="text-subtle hover:text-danger"
                  aria-label={`Remove ${b.name}`}
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function isQuickFixable(i: MapValidationIssue) {
  return Boolean(
    i.processId &&
      (i.id.startsWith("owner-") ||
        i.id.startsWith("fraud-nocontrol-") ||
        i.id.startsWith("dep-")),
  );
}

function ValidationPanel({
  issues,
  onSelectProcess,
  onCleanLayout,
  onQuickFix,
  onFixAll,
  previewFix,
}: {
  issues: MapValidationIssue[];
  onSelectProcess: (id: string) => void;
  onCleanLayout: () => void;
  onQuickFix: (issueId: string, processId: string) => boolean;
  onFixAll: () => void;
  previewFix: (issueId: string, processId: string) => HealthDelta | null;
}) {
  const errors = issues.filter((i) => i.severity === "error");
  const warns = issues.filter((i) => i.severity === "warn");
  const infos = issues.filter((i) => i.severity === "info");
  const fixable = issues.filter(isQuickFixable).length;

  if (issues.length === 0) {
    return (
      <div className="rounded-lg border border-ok/30 bg-ok/5 p-2.5 text-[11px] text-ok">
        Map looks healthy — no broken dependencies, missing owners, or stale references.
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-border bg-panel p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-muted">
          {errors.length} error(s), {warns.length} warning(s), {infos.length} info
        </p>
        {fixable > 1 && (
          <Button size="sm" variant="secondary" onClick={onFixAll}>
            <Wand2 className="size-3.5" /> Fix {fixable} quick wins
          </Button>
        )}
      </div>
      <ul className="max-h-48 space-y-1 overflow-y-auto">
        {[...errors, ...warns, ...infos].map((i) => (
          <li
            key={i.id}
            className={cn(
              "flex items-stretch gap-1 rounded-md border text-[11px]",
              i.severity === "error"
                ? "border-danger/40 bg-danger/10 text-fg"
                : i.severity === "warn"
                  ? "border-warn/40 bg-warn/10 text-fg"
                  : "border-border bg-elevated text-muted",
            )}
          >
            <button
              type="button"
              onClick={() => i.processId && onSelectProcess(i.processId)}
              disabled={!i.processId}
              className={cn("min-w-0 flex-1 px-2 py-1 text-left", i.processId && "hover:underline")}
            >
              {i.message}
            </button>
            {isQuickFixable(i) && (
              <button
                type="button"
                onClick={() => onQuickFix(i.id, i.processId!)}
                title="Apply suggested fix"
                className="inline-flex shrink-0 items-center gap-1 border-l border-current/20 px-2 text-primary hover:bg-primary/10"
              >
                <Wand2 className="size-3" /> Fix
                <DeltaBadge delta={previewFix(i.id, i.processId!)} />
              </button>
            )}
          </li>
        ))}
      </ul>
      {infos.some((i) => i.id.startsWith("layout-")) && (
        <Button size="sm" variant="secondary" onClick={onCleanLayout}>
          Clean stale layout positions
        </Button>
      )}
    </div>
  );
}

function EntitlementPicker({
  selected,
  onChange,
}: {
  selected: EntitlementId[];
  onChange: (next: EntitlementId[]) => void;
}) {
  const toggle = (id: EntitlementId) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {ENTITLEMENTS.filter((e) => e.id !== "view_reports_only").map((e) => {
        const on = selected.includes(e.id);
        return (
          <button
            key={e.id}
            type="button"
            onClick={() => toggle(e.id)}
            className={cn(
              "rounded-md border px-1.5 py-0.5 text-[10px]",
              on ? "border-primary/50 bg-primary/15 text-fg" : "border-border bg-elevated text-muted",
            )}
            title={e.label}
          >
            {e.label.split(" / ")[0].slice(0, 28)}
          </button>
        );
      })}
    </div>
  );
}

function TeamEditor({
  people,
  onChange,
}: {
  people: Person[];
  onChange: (next: Person[]) => void;
}) {
  const roleOptions = useMemo(() => Object.keys(getBaseTemplate().roleTemplates), []);
  const [name, setName] = useState("");
  const [role, setRole] = useState(roleOptions[0] ?? "Team member");
  const [customRole, setCustomRole] = useState("");
  const [tenure, setTenure] = useState(2);
  const [entitlements, setEntitlements] = useState<EntitlementId[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const useCustom = role === "__custom";

  function add() {
    const finalRole = (useCustom ? customRole : role).trim();
    if (!name.trim() || !finalRole) return;
    let id = `p-${slug(name)}`;
    let n = 2;
    while (people.some((p) => p.id === id)) id = `p-${slug(name)}-${n++}`;
    onChange([
      ...people,
      {
        id,
        name: name.trim().slice(0, 60),
        role: finalRole.slice(0, 40),
        active: true,
        tenureYears: tenure,
        entitlements: useCustom && entitlements.length ? entitlements : undefined,
      },
    ]);
    setName("");
    setCustomRole("");
    setEntitlements([]);
    toast.success(`${name.trim()} added to the team`);
  }

  function updatePerson(id: string, patch: Partial<Person>) {
    onChange(people.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function remove(id: string) {
    const p = people.find((x) => x.id === id);
    if (!p) return;
    if (people.length <= 1) {
      toast.error("Keep at least one person on the team.");
      return;
    }
    if (!window.confirm(`Remove ${p.name}? They will be unassigned from any processes.`)) return;
    onChange(people.filter((x) => x.id !== id));
  }

  return (
    <div className="space-y-2 rounded-lg border border-border bg-panel p-2.5">
      <p className="text-[11px] text-muted">
        Roles drive SoD detection — pick the closest match so conflicts are scored correctly.
      </p>
      <ul className="space-y-1">
        {people.map((p) => {
          const knownRole = roleOptions.includes(p.role);
          const editing = editingId === p.id;
          return (
            <li
              key={p.id}
              className="rounded-md border border-border bg-elevated px-2 py-1.5 text-[11px]"
            >
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium text-fg">{p.name}</span>
                  <span className="text-subtle"> · {p.role}</span>
                  {!knownRole && !(p.entitlements?.length) && (
                    <span className="text-warn"> · needs duties</span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => setEditingId(editing ? null : p.id)}
                  className="text-subtle hover:text-primary"
                >
                  {editing ? "Done" : "Duties"}
                </button>
                <button
                  type="button"
                  onClick={() => remove(p.id)}
                  className="text-subtle hover:text-danger"
                  aria-label={`Remove ${p.name}`}
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
              {editing && (
                <EntitlementPicker
                  selected={(p.entitlements ?? []) as EntitlementId[]}
                  onChange={(next) =>
                    updatePerson(p.id, { entitlements: next.length ? next : undefined })
                  }
                />
              )}
            </li>
          );
        })}
      </ul>
      <div className="grid gap-1.5 sm:grid-cols-[1fr_1fr_64px]">
        <input
          className={inputCls}
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <select className={inputCls} value={role} onChange={(e) => setRole(e.target.value)}>
          {roleOptions.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
          <option value="__custom">Other role…</option>
        </select>
        <input
          className={inputCls}
          type="number"
          min={0}
          max={40}
          step={0.5}
          value={tenure}
          onChange={(e) => setTenure(Number(e.target.value))}
          title="Tenure (years)"
        />
      </div>
      {useCustom && (
        <>
          <input
            className={inputCls}
            placeholder="Role title"
            value={customRole}
            onChange={(e) => setCustomRole(e.target.value)}
          />
          <div>
            <span className={labelCls}>Duty entitlements (for SoD scoring)</span>
            <EntitlementPicker selected={entitlements} onChange={setEntitlements} />
          </div>
        </>
      )}
      <Button size="sm" variant="secondary" onClick={add} disabled={!name.trim()}>
        <Plus className="size-3.5" /> Add team member
      </Button>
    </div>
  );
}

function ProcessForm({
  process,
  all,
  onChange,
  onDelete,
  onSaveAsBlock,
}: {
  process: ProcessNode;
  all: ProcessNode[];
  onChange: (patch: Partial<ProcessNode>) => void;
  onDelete: () => void;
  onSaveAsBlock: () => void;
}) {
  const tpl = useTemplate();
  const [name, setName] = useState(process.name);
  const [desc, setDesc] = useState(process.description);
  const [inputs, setInputs] = useState((process.inputs ?? []).join(", "));
  const [outputs, setOutputs] = useState((process.outputs ?? []).join(", "));

  // Debounce text field commits so typing doesn't thrash the graph.
  useEffect(() => {
    const t = setTimeout(() => {
      const parse = (s: string) =>
        s
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean);
      const patch: Partial<ProcessNode> = {};
      if (name !== process.name) patch.name = name.slice(0, 60);
      if (desc !== process.description) patch.description = desc.slice(0, 240);
      const pi = parse(inputs);
      const po = parse(outputs);
      if (pi.join("|") !== (process.inputs ?? []).join("|")) patch.inputs = pi;
      if (po.join("|") !== (process.outputs ?? []).join("|")) patch.outputs = po;
      if (Object.keys(patch).length) onChange(patch);
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, desc, inputs, outputs]);

  const stages = useMemo(() => {
    const max = Math.max(4, ...all.map((p) => p.stage ?? 0));
    return Array.from({ length: max + 2 }, (_, i) => i);
  }, [all]);

  const toggleIn = (list: string[], id: string) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

  return (
    <div className="space-y-3 border-t border-border pt-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_88px]">
        <label>
          <span className={labelCls}>Name</span>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          <span className={labelCls}>Stage</span>
          <select
            className={inputCls}
            value={process.stage ?? 0}
            onChange={(e) => onChange({ stage: Number(e.target.value) })}
          >
            {stages.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        <span className={labelCls}>Description</span>
        <textarea
          className={cn(inputCls, "min-h-[52px] resize-y")}
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
        />
      </label>
      <div className="grid gap-2 sm:grid-cols-2">
        <label>
          <span className={labelCls}>Inputs (comma-separated)</span>
          <input className={inputCls} value={inputs} onChange={(e) => setInputs(e.target.value)} />
        </label>
        <label>
          <span className={labelCls}>Outputs</span>
          <input
            className={inputCls}
            value={outputs}
            onChange={(e) => setOutputs(e.target.value)}
          />
        </label>
      </div>

      <ChipPicker
        label="Depends on"
        options={all
          .filter((p) => p.id !== process.id)
          .map((p) => ({ id: p.id, label: p.name }))}
        selected={process.dependencies}
        onToggle={(id) => onChange({ dependencies: toggleIn(process.dependencies, id) })}
      />
      <ChipPicker
        label="Owners"
        options={tpl.people.map((p) => ({ id: p.id, label: `${p.name} · ${p.role}` }))}
        selected={process.ownerPersonIds ?? []}
        onToggle={(id) =>
          onChange({ ownerPersonIds: toggleIn(process.ownerPersonIds ?? [], id) })
        }
      />
      <ChipPicker
        label="Controls"
        options={tpl.controls.map((c) => ({
          id: c.id,
          label: c.name,
          tone: c.segregated ? undefined : "danger",
        }))}
        selected={process.controlIds}
        onToggle={(id) => onChange({ controlIds: toggleIn(process.controlIds, id) })}
      />

      <SuggestPanel process={process} onChange={onChange} />

      <RiskList
        risks={process.risks ?? []}
        onChange={(risks) => onChange({ risks })}
        knowledgeOptions={tpl.knowledge.map((k) => ({ id: k.id, label: k.name }))}
        controlOptions={tpl.controls.map((c) => ({ id: c.id, label: c.name }))}
        scenarioOptions={tpl.scenarios.map((s) => ({ id: s.id, label: s.title }))}
      />
      <IdeaList ideas={process.ideas ?? []} onChange={(ideas) => onChange({ ideas })} />
      <WasteList wastes={process.wastes ?? []} onChange={(wastes) => onChange({ wastes })} />

      <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-2">
        <Button size="sm" variant="secondary" onClick={onSaveAsBlock}>
          <Save className="size-3.5" /> Save as block
        </Button>
        <Button size="sm" variant="danger" onClick={onDelete}>
          <Trash2 className="size-3.5" /> Delete process
        </Button>
      </div>
    </div>
  );
}

function ChipPicker({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: { id: string; label: string; tone?: "danger" }[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div>
      <span className={labelCls}>{label}</span>
      <div className="mt-1 flex flex-wrap gap-1">
        {options.length === 0 && <span className="text-[11px] text-subtle">None available</span>}
        {options.map((o) => {
          const on = selected.includes(o.id);
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => onToggle(o.id)}
              className={cn(
                "rounded-md border px-2 py-0.5 text-[11px] transition-colors",
                on
                  ? o.tone === "danger"
                    ? "border-danger/50 bg-danger/15 text-fg"
                    : "border-primary/50 bg-primary/15 text-fg"
                  : "border-border bg-elevated text-muted hover:text-fg",
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  count,
  onAdd,
  adding,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  onAdd: () => void;
  adding: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={cn(labelCls, "flex items-center gap-1")}>
        {icon}
        {title} ({count})
      </span>
      <button
        type="button"
        onClick={onAdd}
        className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
      >
        {adding ? <X className="size-3" /> : <Plus className="size-3" />}
        {adding ? "Cancel" : "Add"}
      </button>
    </div>
  );
}

function RiskList({
  risks,
  onChange,
  knowledgeOptions,
  controlOptions,
  scenarioOptions,
}: {
  risks: ProcessRisk[];
  onChange: (r: ProcessRisk[]) => void;
  knowledgeOptions: { id: string; label: string }[];
  controlOptions: { id: string; label: string }[];
  scenarioOptions: { id: string; label: string }[];
}) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<ProcessRiskKind>("fraud");
  const [sev, setSev] = useState(3);
  const [lik, setLik] = useState(3);
  const [note, setNote] = useState("");
  const [knowledgeId, setKnowledgeId] = useState("");
  const [controlId, setControlId] = useState("");
  const [scenarioId, setScenarioId] = useState("");

  function commit() {
    if (!title.trim()) return;
    onChange([
      ...risks,
      {
        id: uid("r"),
        title: title.trim().slice(0, 80),
        kind,
        severity: sev as ProcessRisk["severity"],
        likelihood: lik as ProcessRisk["likelihood"],
        note: note.trim().slice(0, 200),
        linkedKnowledgeId: knowledgeId || undefined,
        linkedControlId: controlId || undefined,
        linkedScenarioId: scenarioId || undefined,
      },
    ]);
    setTitle("");
    setNote("");
    setKnowledgeId("");
    setControlId("");
    setScenarioId("");
    setAdding(false);
  }

  function updateRisk(id: string, patch: Partial<ProcessRisk>) {
    onChange(risks.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  return (
    <div className="space-y-1.5">
      <SectionHeader
        icon={<AlertTriangle className="size-3 text-danger" />}
        title="Risks"
        count={risks.length}
        adding={adding}
        onAdd={() => setAdding((v) => !v)}
      />
      {risks.map((r) => (
        <div
          key={r.id}
          className="space-y-1 rounded-md border border-border bg-elevated px-2 py-1.5 text-[11px]"
        >
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-fg">{r.title}</p>
              <p className="text-subtle">
                {r.kind} · S{r.severity}×L{r.likelihood}
                {r.note ? ` · ${r.note}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onChange(risks.filter((x) => x.id !== r.id))}
              className="text-subtle hover:text-danger"
              aria-label="Remove risk"
            >
              <Trash2 className="size-3" />
            </button>
          </div>
          <div className="grid gap-1 sm:grid-cols-3">
            <select
              className={inputCls}
              value={r.linkedControlId ?? ""}
              onChange={(e) =>
                updateRisk(r.id, { linkedControlId: e.target.value || undefined })
              }
            >
              <option value="">Link control…</option>
              {controlOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <select
              className={inputCls}
              value={r.linkedScenarioId ?? ""}
              onChange={(e) =>
                updateRisk(r.id, { linkedScenarioId: e.target.value || undefined })
              }
            >
              <option value="">Link scenario…</option>
              {scenarioOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            <select
              className={inputCls}
              value={r.linkedKnowledgeId ?? ""}
              onChange={(e) =>
                updateRisk(r.id, { linkedKnowledgeId: e.target.value || undefined })
              }
            >
              <option value="">Link knowledge…</option>
              {knowledgeOptions.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      ))}
      {adding && (
        <div className="space-y-1.5 rounded-md border border-dashed border-border p-2">
          <input
            className={inputCls}
            placeholder="Risk title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
          <div className="grid grid-cols-3 gap-1.5">
            <select
              className={inputCls}
              value={kind}
              onChange={(e) => setKind(e.target.value as ProcessRiskKind)}
            >
              {RISK_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <select className={inputCls} value={sev} onChange={(e) => setSev(Number(e.target.value))}>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  Severity {n}
                </option>
              ))}
            </select>
            <select className={inputCls} value={lik} onChange={(e) => setLik(Number(e.target.value))}>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  Likelihood {n}
                </option>
              ))}
            </select>
          </div>
          <input
            className={inputCls}
            placeholder="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="grid gap-1 sm:grid-cols-3">
            <select
              className={inputCls}
              value={controlId}
              onChange={(e) => setControlId(e.target.value)}
            >
              <option value="">Link control (optional)</option>
              {controlOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <select
              className={inputCls}
              value={scenarioId}
              onChange={(e) => setScenarioId(e.target.value)}
            >
              <option value="">Link scenario (optional)</option>
              {scenarioOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            <select
              className={inputCls}
              value={knowledgeId}
              onChange={(e) => setKnowledgeId(e.target.value)}
            >
              <option value="">Link knowledge (optional)</option>
              {knowledgeOptions.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </select>
          </div>
          <Button size="sm" onClick={commit} disabled={!title.trim()}>
            Add risk
          </Button>
        </div>
      )}
    </div>
  );
}

function IdeaList({
  ideas,
  onChange,
}: {
  ideas: ProcessIdea[];
  onChange: (i: ProcessIdea[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<ProcessIdea["category"]>("control");
  const [effort, setEffort] = useState<ProcessIdea["effort"]>("low");
  const [impact, setImpact] = useState<ProcessIdea["impact"]>("high");
  const [status, setStatus] = useState<ProcessIdea["status"]>("backlog");
  const [note, setNote] = useState("");

  function commit() {
    if (!title.trim()) return;
    onChange([
      ...ideas,
      {
        id: uid("i"),
        title: title.trim().slice(0, 80),
        category,
        effort,
        impact,
        status,
        note: note.trim().slice(0, 200),
      },
    ]);
    setTitle("");
    setNote("");
    setAdding(false);
  }

  return (
    <div className="space-y-1.5">
      <SectionHeader
        icon={<Lightbulb className="size-3 text-warn" />}
        title="Improvement ideas"
        count={ideas.length}
        adding={adding}
        onAdd={() => setAdding((v) => !v)}
      />
      {ideas.map((i) => (
        <div
          key={i.id}
          className="flex items-start gap-2 rounded-md border border-border bg-elevated px-2 py-1.5 text-[11px]"
        >
          <div className="min-w-0 flex-1">
            <p className="font-medium text-fg">{i.title}</p>
            <p className="text-subtle">
              {i.category} · {i.effort} effort · {i.impact} impact · {i.status}
            </p>
          </div>
          <select
            className="rounded border border-border bg-surface px-1 text-[10px] text-muted"
            value={i.status}
            onChange={(e) =>
              onChange(
                ideas.map((x) =>
                  x.id === i.id ? { ...x, status: e.target.value as ProcessIdea["status"] } : x,
                ),
              )
            }
          >
            {IDEA_STATUS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => onChange(ideas.filter((x) => x.id !== i.id))}
            className="text-subtle hover:text-danger"
            aria-label="Remove idea"
          >
            <Trash2 className="size-3" />
          </button>
        </div>
      ))}
      {adding && (
        <div className="space-y-1.5 rounded-md border border-dashed border-border p-2">
          <input
            className={inputCls}
            placeholder="Idea title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            <select
              className={inputCls}
              value={category}
              onChange={(e) => setCategory(e.target.value as ProcessIdea["category"])}
            >
              {IDEA_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select
              className={inputCls}
              value={effort}
              onChange={(e) => setEffort(e.target.value as ProcessIdea["effort"])}
            >
              {EFFORTS.map((c) => (
                <option key={c} value={c}>
                  {c} effort
                </option>
              ))}
            </select>
            <select
              className={inputCls}
              value={impact}
              onChange={(e) => setImpact(e.target.value as ProcessIdea["impact"])}
            >
              {EFFORTS.map((c) => (
                <option key={c} value={c}>
                  {c} impact
                </option>
              ))}
            </select>
            <select
              className={inputCls}
              value={status}
              onChange={(e) => setStatus(e.target.value as ProcessIdea["status"])}
            >
              {IDEA_STATUS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <input
            className={inputCls}
            placeholder="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <Button size="sm" onClick={commit} disabled={!title.trim()}>
            Add idea
          </Button>
        </div>
      )}
    </div>
  );
}

function WasteList({
  wastes,
  onChange,
}: {
  wastes: ProcessWaste[];
  onChange: (w: ProcessWaste[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<LeanWasteKind>("muda_waiting");
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");

  function commit() {
    if (!label.trim()) return;
    onChange([
      ...wastes,
      { id: uid("w"), kind, label: label.trim().slice(0, 80), note: note.trim().slice(0, 200) },
    ]);
    setLabel("");
    setNote("");
    setAdding(false);
  }

  return (
    <div className="space-y-1.5">
      <SectionHeader
        icon={<Recycle className="size-3 text-muted" />}
        title="Lean waste"
        count={wastes.length}
        adding={adding}
        onAdd={() => setAdding((v) => !v)}
      />
      {wastes.map((w) => (
        <div
          key={w.id}
          className="flex items-start gap-2 rounded-md border border-border bg-elevated px-2 py-1.5 text-[11px]"
        >
          <div className="min-w-0 flex-1">
            <p className="font-medium text-fg">{w.label}</p>
            <p className="text-subtle">
              {WASTE_KINDS.find((k) => k.id === w.kind)?.label ?? w.kind}
              {w.note ? ` · ${w.note}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onChange(wastes.filter((x) => x.id !== w.id))}
            className="text-subtle hover:text-danger"
            aria-label="Remove waste"
          >
            <Trash2 className="size-3" />
          </button>
        </div>
      ))}
      {adding && (
        <div className="space-y-1.5 rounded-md border border-dashed border-border p-2">
          <div className="grid grid-cols-[120px_1fr] gap-1.5">
            <select
              className={inputCls}
              value={kind}
              onChange={(e) => setKind(e.target.value as LeanWasteKind)}
            >
              {WASTE_KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </select>
            <input
              className={inputCls}
              placeholder="What is wasted?"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              autoFocus
            />
          </div>
          <input
            className={inputCls}
            placeholder="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <Button size="sm" onClick={commit} disabled={!label.trim()}>
            Add waste
          </Button>
        </div>
      )}
    </div>
  );
}
