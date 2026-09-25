import { normalizeSystems, parseCadence } from "@/lib/precog/process-record";
import { BlockLibrary } from "@/components/precog/builder/block-library";
import { ChangesView } from "@/components/precog/builder/changes-view";
import { DeparturePanel } from "@/components/precog/builder/departure-panel";
import { HealthPill } from "@/components/precog/builder/health-pill";
import { ProcessForm } from "@/components/precog/builder/process-form";
import { ReviewPanel } from "@/components/precog/builder/review-panel";
import { SharePanel } from "@/components/precog/builder/share-panel";
import { slug, labelCls } from "@/components/precog/builder/form-shared";
import { TeamEditor } from "@/components/precog/builder/team-editor";
import { ValidationPanel } from "@/components/precog/builder/validation-panel";
import { VersionsPanel } from "@/components/precog/builder/versions-panel";
import { SpreadsheetPanel } from "@/components/precog/builder/spreadsheet-panel";
import { WorkloadView } from "@/components/precog/builder/workload-view";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { usePractice } from "@/lib/precog/practice-context";
import { useTemplate } from "@/lib/precog/use-template";
import type { ProcessNode } from "@/lib/precog/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Download, Hammer, Plus, RotateCcw, Upload, Users, X, FileSpreadsheet } from "lucide-react";
import type { Person } from "@/lib/precog/types";

import { industryMeta } from "@/lib/precog/industry";

import { Blocks, GitCompare, Redo2, ShieldCheck, Undo2 } from "lucide-react";
import { suggestControlForProcess, suggestOwnerForProcess } from "@/lib/precog/builder/quick-fix";
import { mapAssessed, mapNotAssessedNote, mapSource } from "@/lib/precog/builder/map-state";
import {
  analyzeWorkload,
  healthDelta,
  LOAD_BANDS,
  previewMapHealth,
  type HealthDelta,
} from "@/lib/precog/builder/what-if";
import { ChevronRight, Gauge, HelpCircle, Scale } from "lucide-react";
import { BuilderTour } from "@/components/precog/builder-tour";
import { useBuilderTour } from "@/components/precog/builder-tour-state";

import { reviewMap } from "@/lib/precog/builder/review-server";
import type { MapReview } from "@/lib/precog/builder/review";

import { Camera, ClipboardCheck, History } from "lucide-react";
import { rankDepartureRisk } from "@/lib/precog/builder/departure";
import { summarizeEvidence } from "@/lib/precog/builder/evidence";

import { buildSharePayload } from "@/lib/precog/builder/share-payload";
import { buildWeeklyActions } from "@/lib/precog/weekly-actions/build";
import { buildProcessMapGraph } from "@/lib/precog/process-graph";

import { Clock, Link2, UserMinus } from "lucide-react";
import {
  instantiateBlock,
  processToSavedBlock,
  type ProcessBlock,
  type SavedProcessBlock,
} from "@/lib/precog/builder/process-blocks";
import { enrichProcess, validateProcessMap } from "@/lib/precog/process-graph";
import { peopleFromBackup } from "@/lib/precog/import/people-backup";
import { downloadText } from "@/lib/download";

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
    saveMapVersion,
    deleteMapVersion,
    restoreMapVersion,
  } = usePractice();
  const processes = tpl.processes;
  const [showTeam, setShowTeam] = useState(false);
  const [showChanges, setShowChanges] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  const [showBlocks, setShowBlocks] = useState(false);
  const [showWorkload, setShowWorkload] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [review, setReview] = useState<MapReview | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [showDeparture, setShowDeparture] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showSpreadsheet, setShowSpreadsheet] = useState(false);
  const tour = useBuilderTour();

  const departures = useMemo(
    () => (showDeparture ? rankDepartureRisk(tpl, processes, tpl.people, profile.staff) : []),
    [showDeparture, tpl, processes, profile.staff],
  );
  const evidenceSummary = useMemo(() => summarizeEvidence(processes), [processes]);
  // The starter map with nobody assigned, or an empty map, has no health to
  // show; the pill and the what-if deltas wait until the owner assigns an
  // owner or builds their own map.
  const mapReady = mapAssessed(profile);
  const notAssessed = mapNotAssessedNote(profile);
  const starterMap = mapSource(profile) === "starter";

  const currentHealth = useMemo(
    () =>
      previewMapHealth(tpl, processes, profile.staff, {
        people: tpl.people,
        layout: profile.mapLayout ?? {},
        customized: mapCustomized,
      }),
    [tpl, processes, profile.staff, profile.mapLayout, mapCustomized],
  );
  // Baseline when the builder opened — shows the session's net effect. It is
  // taken from the first assessed score, never from the starter map.
  const sessionBaseline = useRef<number | null>(null);
  if (sessionBaseline.current === null && mapReady) sessionBaseline.current = currentHealth.score;

  /** Score a hypothetical process list against the current one. */
  const whatIf = (next: ProcessNode[]): HealthDelta => {
    if (!mapReady) {
      return { before: currentHealth.score, after: currentHealth.score, delta: 0 };
    }
    return healthDelta(
      currentHealth,
      previewMapHealth(tpl, next, profile.staff, {
        people: tpl.people,
        layout: profile.mapLayout ?? {},
        customized: true,
      }),
    );
  };

  const workload = useMemo(
    () =>
      showWorkload
        ? analyzeWorkload(tpl, processes, tpl.people, profile.staff, profile.dualRelease)
        : [],
    [showWorkload, tpl, processes, profile.staff, profile.dualRelease],
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

  async function runReview() {
    setShowReview(true);
    setReviewing(true);
    try {
      const wl = analyzeWorkload(tpl, processes, tpl.people, profile.staff, profile.dualRelease);
      const enriched = processes.map((p) => {
        const owners = (p.ownerPersonIds ?? [])
          .map((id) => tpl.people.find((x) => x.id === id)?.name)
          .filter((x): x is string => Boolean(x));
        const snap = enrichProcess(tpl, p, profile.staff);
        return {
          id: p.id,
          name: p.name,
          stage: p.stage ?? 0,
          owners,
          controls: p.controlIds,
          riskTitles: (p.risks ?? []).map((r) => r.title).slice(0, 4),
          fraudRisks: (p.risks ?? []).filter((r) => r.kind === "fraud").length,
          heat: snap.heat,
          dependencyCount: p.dependencies.length,
          openSodGaps: snap.controlGaps.filter((c) => !c.segregated).length,
        };
      });
      const result = await reviewMap({
        data: {
          businessName: profile.practiceName,
          industryLabel: industryMeta(profile.industry).label,
          teamSize: tpl.people.filter((p) => p.active).length,
          health: {
            score: currentHealth.score,
            band: currentHealth.bandLabel,
            dimensions: currentHealth.dimensions.map((d) => ({
              label: d.label,
              score: d.score,
              hint: d.hint,
            })),
          },
          processes: enriched,
          issues: validationIssues.filter((i) => i.severity !== "info").map((i) => i.message),
          overburdened: wl
            .filter((r) => r.load >= LOAD_BANDS.overburdened)
            .map((r) => ({ name: r.person.name, role: r.person.role, flags: r.flags })),
          unownedProcesses: processes
            .filter((p) => !(p.ownerPersonIds ?? []).length)
            .map((p) => p.name),
        },
      });
      setReview(result);
    } catch {
      toast.error("Review failed", { description: "Try again in a moment." });
    } finally {
      setReviewing(false);
    }
  }

  function snapshotVersion() {
    const name = window.prompt(
      "Name this version",
      `${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })} · health ${currentHealth.score}`,
    );
    if (name === null) return;
    saveMapVersion(name, currentHealth.score);
    setShowVersions(true);
    toast.success("Version saved", {
      description: "Restore or compare it any time from Versions.",
    });
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
      const owner = suggestOwnerForProcess(tpl, proc, processes, tpl.people);
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
      const owner = suggestOwnerForProcess(tpl, proc, processes, tpl.people);
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
            const owner = suggestOwnerForProcess(tpl, next, cur, tpl.people);
            if (owner)
              next = { ...next, ownerPersonIds: [...(next.ownerPersonIds ?? []), owner.id] };
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

  /**
   * The sample business goes back to its template, people included. A
   * business with its own people goes back to the starter map only: the team,
   * register and journal are the owner's and stay.
   */
  function resetToTemplate() {
    const ownTeam = Boolean(profile.customPeople);
    const question = ownTeam
      ? "Go back to the starter map? This discards your process map edits. Your team, register and journal stay."
      : "Discard your custom map and team, and restore the industry template?";
    if (!window.confirm(question)) return;
    setCustomProcesses(null);
    if (!ownTeam) setCustomPeople(null);
    setMapLayout({});
    toast.success(ownTeam ? "Back to the starter map" : "Template restored");
  }

  function exportMap() {
    const payload = {
      version: 3,
      industry: profile.industry,
      businessName: profile.practiceName,
      exportedAt: new Date().toISOString(),
      processes,
      people: tpl.people,
      layout: profile.mapLayout ?? {},
    };
    downloadText(
      `${slug(profile.practiceName) || "process-map"}-map.json`,
      JSON.stringify(payload, null, 2),
      "application/json",
    );
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
        parsed.processes.filter((p) => p && typeof p.id === "string").map((p) => p.id as string),
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
          evidence: Array.isArray(p.evidence) ? p.evidence : [],
          cadence: parseCadence(typeof p.cadence === "string" ? p.cadence : undefined),
          systems: Array.isArray(p.systems)
            ? normalizeSystems(p.systems.filter((s): s is string => typeof s === "string"))
            : undefined,
          documented: typeof p.documented === "boolean" ? p.documented : undefined,
          procedureLocation:
            typeof p.procedureLocation === "string"
              ? p.procedureLocation.trim().slice(0, 200) || undefined
              : undefined,
        }));
      // Every person field the backup carries comes back: department, last
      // day and employee id too, each checked.
      const restoredPeople = peopleFromBackup(parsed.people);
      if (restoredPeople.length) setCustomPeople(restoredPeople);
      const importIssues = validateProcessMap(
        cleaned,
        restoredPeople.length ? restoredPeople : tpl.people,
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
              Build your real value stream. Every change re-scores residual risk, SoD, and scenarios
              live.
              <span className="mt-1 block text-xs text-subtle">
                Keyboard: arrows move between processes · F frames the selection · Enter edits the
                name · Shift+A arranges by stage · Ctrl+Z undo
              </span>
            </CardDescription>
            {mapReady ? (
              <HealthPill
                score={currentHealth.score}
                band={currentHealth.bandLabel}
                sessionDelta={
                  currentHealth.score - (sessionBaseline.current ?? currentHealth.score)
                }
              />
            ) : (
              <div className="mt-2 inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs">
                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-elevated px-1.5 py-0.5 font-semibold text-muted">
                  <Gauge className="size-3" />
                  {"—"}
                </span>
                <span className="text-muted">Map health · not assessed yet</span>
              </div>
            )}
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
          <Button
            size="sm"
            variant={showSpreadsheet ? "default" : "secondary"}
            onClick={() => setShowSpreadsheet((v) => !v)}
            title="Export to or import from a CSV spreadsheet"
          >
            <FileSpreadsheet className="size-3.5" /> Spreadsheet
          </Button>
          <Button size="sm" variant="secondary" onClick={exportMap} title="Full backup as JSON">
            <Download className="size-3.5" /> Export
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => fileRef.current?.click()}
            title="Restore a JSON backup"
          >
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
            variant={showReview ? "default" : "secondary"}
            onClick={() =>
              review && !showReview
                ? setShowReview(true)
                : showReview
                  ? setShowReview(false)
                  : void runReview()
            }
          >
            <ClipboardCheck className="size-3.5" /> Review
          </Button>
          <Button
            size="sm"
            variant={showDeparture ? "default" : "secondary"}
            onClick={() => setShowDeparture((v) => !v)}
            title="What breaks if someone leaves"
          >
            <UserMinus className="size-3.5" /> Bus factor
          </Button>
          <Button
            size="sm"
            variant={showShare ? "default" : "secondary"}
            onClick={() => setShowShare((v) => !v)}
            title="Create a read-only link for an advisor or lender"
          >
            <Link2 className="size-3.5" /> Share
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={snapshotVersion}
            title="Save a named snapshot of this map"
          >
            <Camera className="size-3.5" /> Snapshot
          </Button>
          {(profile.mapVersions?.length ?? 0) > 0 && (
            <Button
              size="sm"
              variant={showVersions ? "default" : "secondary"}
              onClick={() => setShowVersions((v) => !v)}
            >
              <History className="size-3.5" /> Versions ({profile.mapVersions!.length})
            </Button>
          )}
          <Button
            size="sm"
            variant={showValidation ? "default" : "secondary"}
            onClick={() => setShowValidation((v) => !v)}
          >
            <ShieldCheck className="size-3.5" />
            Validate
            {validationIssues.filter((i) => i.severity === "error").length > 0 && (
              <Badge variant="warn" className="ml-1 px-1 py-0 text-xs">
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
              <RotateCcw className="size-3.5" /> {profile.customPeople ? "Starter map" : "Template"}
            </Button>
          )}
        </div>

        {showDeparture && (
          <DeparturePanel
            impacts={departures}
            onSelectProcess={onSelectProcess}
            onAddBackup={(processId, excludePersonId) => {
              const proc = processes.find((p) => p.id === processId);
              if (!proc) return;
              const candidates = tpl.people.filter((p) => p.id !== excludePersonId && p.active);
              const backup = suggestOwnerForProcess(
                tpl,
                { ...proc, ownerPersonIds: [] },
                processes,
                candidates,
              );
              if (!backup) return;
              update(processId, { ownerPersonIds: [...(proc.ownerPersonIds ?? []), backup.id] });
              toast.success(`${backup.name} added as backup owner on ${proc.name}`);
            }}
          />
        )}

        {showSpreadsheet && (
          <SpreadsheetPanel
            businessName={profile.practiceName}
            onApply={(next) => setCustomProcesses(next)}
            onSelectProcess={onSelectProcess}
          />
        )}

        {showShare && (
          <SharePanel
            buildPayload={(note, redactNames) => {
              const { snapshots } = buildProcessMapGraph(tpl, profile.staff);
              const actions = buildWeeklyActions({
                tpl,
                staff: profile.staff,
                dualRelease: profile.dualRelease,
                mapSnapshots: snapshots,
                mapAssessed: mapReady,
              });
              return buildSharePayload(profile, actions, note, redactNames);
            }}
          />
        )}

        {evidenceSummary.total > 0 &&
          evidenceSummary.overdue + evidenceSummary.never > 0 &&
          !showValidation && (
            <button
              type="button"
              onClick={() => {
                const first = evidenceSummary.overdueItems[0];
                if (first) onSelectProcess(first.process.id);
              }}
              className="flex w-full items-center gap-2 rounded-md border border-warn/40 bg-warn/10 px-2.5 py-1.5 text-left text-xs text-fg hover:border-warn/60"
            >
              <Clock className="size-3.5 shrink-0 text-warn" />
              <span className="min-w-0 flex-1">
                <span className="font-medium">
                  {evidenceSummary.overdue + evidenceSummary.never} evidence item(s) need attention
                </span>
                <span className="text-muted">
                  {" "}
                  · {evidenceSummary.coverage}% of control evidence is current
                </span>
              </span>
              <ChevronRight className="size-3 shrink-0 text-subtle" />
            </button>
          )}

        {showReview && (
          <ReviewPanel
            review={review}
            loading={reviewing}
            onRefresh={() => void runReview()}
            onSelectProcess={onSelectProcess}
            processes={processes}
          />
        )}

        {showVersions && (profile.mapVersions?.length ?? 0) > 0 && (
          <VersionsPanel
            versions={profile.mapVersions!}
            current={{ processes, people: tpl.people, health: currentHealth.score }}
            onRestore={(id) => {
              const v = profile.mapVersions?.find((x) => x.id === id);
              if (!v) return;
              if (!window.confirm(`Restore "${v.name}"? Your current map goes into undo history.`))
                return;
              restoreMapVersion(id);
              toast.success(`Restored "${v.name}"`, { description: "Ctrl+Z to go back." });
            }}
            onDelete={deleteMapVersion}
            onSelectProcess={onSelectProcess}
          />
        )}

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
                tpl,
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

        {showValidation && notAssessed && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-2.5 text-xs leading-relaxed text-fg">
            <p className="font-medium">Not assessed yet</p>
            <p className="mt-0.5 text-muted">
              {notAssessed}
              {starterMap
                ? " Each Fix below assigns a suggested owner; remove the processes that do not apply."
                : ""}
            </p>
          </div>
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
          <ChangesView
            processes={processes}
            people={tpl.people}
            onSelectProcess={onSelectProcess}
          />
        )}

        {showTeam && <TeamEditor people={tpl.people} onChange={(next) => setCustomPeople(next)} />}

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
                    "rounded-md border px-2 py-0.5 text-xs transition-colors",
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
