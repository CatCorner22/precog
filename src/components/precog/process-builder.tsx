import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Blocks,
  Camera,
  ChevronRight,
  ClipboardCheck,
  Clock,
  Download,
  FileSpreadsheet,
  Gauge,
  GitCompare,
  Hammer,
  HelpCircle,
  History,
  Link2,
  Plus,
  Redo2,
  RotateCcw,
  Scale,
  ShieldCheck,
  Undo2,
  Upload,
  UserMinus,
  Users,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { labelCls } from "@/components/ui/field-classes";
import { BlockLibrary } from "@/components/precog/builder/block-library";
import { ChangesView } from "@/components/precog/builder/changes-view";
import { DeparturePanel } from "@/components/precog/builder/departure-panel";
import { HealthPill } from "@/components/precog/builder/health-pill";
import { ProcessForm } from "@/components/precog/builder/process-form";
import { ReviewPanel } from "@/components/precog/builder/review-panel";
import { SharePanel } from "@/components/precog/builder/share-panel";
import { SpreadsheetPanel } from "@/components/precog/builder/spreadsheet-panel";
import { TeamEditor } from "@/components/precog/builder/team-editor";
import { BuilderTour } from "@/components/precog/builder/tour";
import { useBuilderTour } from "@/components/precog/builder/use-builder-tour";
import { ValidationPanel } from "@/components/precog/builder/validation-panel";
import { VersionsPanel } from "@/components/precog/builder/versions-panel";
import { WorkloadView } from "@/components/precog/builder/workload-view";
import { rankDepartureRisk } from "@/lib/precog/builder/departure";
import { summarizeEvidence } from "@/lib/precog/builder/evidence";
import { mapBackupJson, parseMapBackup, type MapBackup } from "@/lib/precog/builder/map-backup";
import { mapAssessed, mapNotAssessedNote, mapSource } from "@/lib/precog/builder/map-state";
import {
  blocksForIndustry,
  instantiateBlock,
  processToSavedBlock,
  type ProcessBlock,
  type SavedProcessBlock,
} from "@/lib/precog/builder/process-blocks";
import { suggestOwnerForProcess } from "@/lib/precog/builder/quick-fix";
import {
  applyQuickFix,
  applyQuickFixes,
  isQuickFixable,
} from "@/lib/precog/builder/quick-fix-plan";
import type { MapReview } from "@/lib/precog/builder/review";
import { reviewMap } from "@/lib/precog/builder/review-server";
import { scoreMap } from "@/lib/precog/builder/scored-map";
import { buildSharePayload } from "@/lib/precog/share/share-payload";
import { healthDelta, type HealthDelta } from "@/lib/precog/builder/what-if";
import { analyzeWorkload, LOAD_BANDS } from "@/lib/precog/builder/workload";
import { formatDayShort } from "@/lib/precog/dates";
import { downloadText } from "@/lib/download";
import { industryMeta } from "@/lib/precog/industry";
import type { MapValidationIssue } from "@/lib/precog/process-validation";
import { buildProcessMapGraph, enrichProcess } from "@/lib/precog/process-graph";
import { validateProcessMap } from "@/lib/precog/process-validation";
import { usePractice, useTemplate } from "@/lib/precog/practice-context";
import { count, slug, uniqueId } from "@/lib/precog/text";
import type { ProcessNode } from "@/lib/precog/types";
import { buildWeeklyActions } from "@/lib/precog/weekly-actions/build";
import { cn } from "@/lib/utils";

/** The builder's side panels; each toolbar button opens or closes one. */
export type BuilderPanel =
  | "blocks"
  | "changes"
  | "departure"
  | "review"
  | "share"
  | "spreadsheet"
  | "team"
  | "validate"
  | "versions"
  | "workload";

/**
 * The map builder beside the canvas: the toolbar, its panels, and the
 * selected process's form. `initialPanel` opens one panel on arrival (the
 * dashboard's "Fix N issues" opens Validate).
 */
export function ProcessBuilder({
  selectedProcessId,
  onSelectProcess,
  onClose,
  initialPanel,
}: {
  selectedProcessId: string | null;
  onSelectProcess: (id: string) => void;
  onClose: () => void;
  initialPanel?: BuilderPanel;
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
  const [panels, setPanels] = useState<ReadonlySet<BuilderPanel>>(
    () => new Set(initialPanel ? [initialPanel] : []),
  );
  const isOpen = (panel: BuilderPanel) => panels.has(panel);
  const setPanel = (panel: BuilderPanel, open: boolean) =>
    setPanels((current) => {
      const next = new Set(current);
      if (open) next.add(panel);
      else next.delete(panel);
      return next;
    });
  const toggle = (panel: BuilderPanel) => setPanel(panel, !panels.has(panel));
  const [review, setReview] = useState<MapReview | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const tour = useBuilderTour();
  const fileRef = useRef<HTMLInputElement>(null);

  // The starter map with nobody assigned, or an empty map, has no health to
  // show; the pill and the what-if deltas wait until the owner assigns an
  // owner or builds their own map.
  const mapReady = mapAssessed(profile);
  const notAssessed = mapNotAssessedNote(profile);
  const starterMap = mapSource(profile) === "starter";

  // Scored as the map page and the dashboard card score it: untouched
  // starter processes are left out (see scoreMap).
  const { industry, customPeople, staff, mapLayout } = profile;
  const scoreList = useCallback(
    (list: ProcessNode[], customized: boolean) =>
      scoreMap(tpl, list, staff, {
        profile: { industry, customPeople },
        people: tpl.people,
        layout: mapLayout ?? {},
        customized,
      }).health,
    [tpl, staff, industry, customPeople, mapLayout],
  );
  const currentHealth = useMemo(
    () => scoreList(processes, mapCustomized),
    [scoreList, processes, mapCustomized],
  );
  // Baseline when the builder opened — shows the session's net effect. It is
  // taken from the first assessed score, never from the starter map.
  const sessionBaseline = useRef<number | null>(null);
  if (sessionBaseline.current === null && mapReady) sessionBaseline.current = currentHealth.score;

  /** Score a hypothetical process list against the current one. */
  const whatIf = useCallback(
    (next: ProcessNode[]): HealthDelta =>
      mapReady
        ? healthDelta(currentHealth, scoreList(next, true))
        : { before: currentHealth.score, after: currentHealth.score, delta: 0 },
    [mapReady, currentHealth, scoreList],
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
  const errorCount = validationIssues.filter((i) => i.severity === "error").length;

  // Health previews are scored once per map change, and only while their
  // panel is open: each one scores the whole map again.
  const validateOpen = isOpen("validate");
  const fixPreviews = useMemo(() => {
    const previews = new Map<string, HealthDelta | null>();
    if (!validateOpen) return previews;
    for (const issue of validationIssues.filter(isQuickFixable)) {
      const fixed = applyQuickFix(issue, processes, tpl);
      previews.set(issue.id, fixed ? whatIf(fixed.next) : null);
    }
    return previews;
  }, [validateOpen, validationIssues, processes, tpl, whatIf]);

  const builtInBlocks = useMemo(() => blocksForIndustry(profile.industry), [profile.industry]);
  const savedBlocks = useMemo(() => profile.savedProcessBlocks ?? [], [profile.savedProcessBlocks]);
  const blocksOpen = isOpen("blocks");
  const blockPreviews = useMemo(() => {
    const previews = new Map<string, HealthDelta>();
    if (!blocksOpen) return previews;
    for (const block of [...builtInBlocks, ...savedBlocks]) {
      previews.set(block.id, whatIf([...processes, newBlockProcess(block, processes)]));
    }
    return previews;
  }, [blocksOpen, builtInBlocks, savedBlocks, processes, whatIf]);

  const departureOpen = isOpen("departure");
  const departures = useMemo(
    () => (departureOpen ? rankDepartureRisk(tpl, processes, tpl.people, profile.staff) : []),
    [departureOpen, tpl, processes, profile.staff],
  );
  const workloadOpen = isOpen("workload");
  const workload = useMemo(
    () =>
      workloadOpen
        ? analyzeWorkload(tpl, processes, tpl.people, profile.staff, profile.dualRelease)
        : [],
    [workloadOpen, tpl, processes, profile.staff, profile.dualRelease],
  );
  const evidenceSummary = useMemo(() => summarizeEvidence(processes), [processes]);
  const evidenceDue = evidenceSummary.overdue + evidenceSummary.never;
  const selected = processes.find((p) => p.id === selectedProcessId) ?? null;
  const versions = profile.mapVersions ?? [];

  function update(id: string, patch: Partial<ProcessNode>) {
    setCustomProcesses((cur) => cur.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  async function runReview() {
    setPanel("review", true);
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

  function saveVersion() {
    const name = window.prompt(
      "Name this version",
      `${formatDayShort(new Date())} · health ${currentHealth.score}`,
    );
    if (name === null) return;
    saveMapVersion(name, currentHealth.score);
    setPanel("versions", true);
    toast.success("Version saved", {
      description: "Restore or compare it any time from Versions.",
    });
  }

  function deleteVersion(id: string) {
    const version = versions.find((v) => v.id === id);
    if (!version) return;
    if (!window.confirm(`Delete version "${version.name}"? This cannot be undone.`)) return;
    deleteMapVersion(id);
    toast(`Deleted version "${version.name}"`);
  }

  function quickFix(issue: MapValidationIssue) {
    const fixed = applyQuickFix(issue, processes, tpl);
    if (!fixed) return;
    setCustomProcesses(fixed.next);
    toast.success(fixed.message);
  }

  function fixAllQuickWins() {
    // One state update, so one undo reverts the whole sweep.
    const { next, applied } = applyQuickFixes(validationIssues, processes, tpl);
    if (!applied) return;
    setCustomProcesses(next);
    toast.success(`Applied ${count(applied, "quick fix", "quick fixes")}`, {
      description: "Review the suggestions; undo if anything looks off.",
    });
  }

  function insertBlock(block: ProcessBlock | SavedProcessBlock) {
    const node = newBlockProcess(block, processes);
    setCustomProcesses((cur) => [...cur, node]);
    onSelectProcess(node.id);
    toast.success(`Inserted "${block.name}"`, {
      description: "Assign owners and wire dependencies on the canvas.",
    });
  }

  function addProcess() {
    const name = "New process";
    const id = uniqueId("proc", name, new Set(processes.map((p) => p.id)), "process");
    const node: ProcessNode = {
      id,
      name,
      layer: "process",
      description: "Describe what this process does and who touches it.",
      dependencies: [],
      controlIds: [],
      stage: lastStage(processes),
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
      ? "Go back to the sample process map? This discards your process map edits. Your team, register and journal stay."
      : "Discard your custom map and team, and restore the industry template?";
    if (!window.confirm(question)) return;
    setCustomProcesses(null);
    if (!ownTeam) setCustomPeople(null);
    setMapLayout({});
    toast.success("Back to the sample process map");
  }

  function exportMap() {
    downloadText(
      `${slug(profile.practiceName) || "process-map"}-map.json`,
      mapBackupJson({
        industry: profile.industry,
        businessName: profile.practiceName,
        processes,
        people: tpl.people,
        layout: profile.mapLayout ?? {},
      }),
      "application/json",
    );
    toast.success("Map exported");
  }

  async function importMap(file: File) {
    let backup: MapBackup;
    try {
      backup = parseMapBackup(JSON.parse(await file.text()));
    } catch (e) {
      toast.error("Import failed", {
        description:
          e instanceof SyntaxError
            ? "The file is not a JSON backup from this app."
            : e instanceof Error
              ? e.message
              : "The file could not be read.",
      });
      return;
    }
    // Every person field the backup carries comes back: department, last
    // day and employee id too, each checked.
    if (backup.people.length) setCustomPeople(backup.people);
    const importIssues = validateProcessMap(
      backup.processes,
      backup.people.length ? backup.people : tpl.people,
      new Set(tpl.controls.map((c) => c.id)),
      backup.layout,
    );
    setCustomProcesses(backup.processes);
    setMapLayout(backup.layout);
    onSelectProcess(backup.processes[0].id);
    const errors = importIssues.filter((i) => i.severity === "error").length;
    const notes = [
      errors > 0
        ? `${count(errors, "issue")} found; open Validate to review.`
        : importIssues.length
          ? `${count(importIssues.length, "warning")}; open Validate to review.`
          : "",
      backup.dropped
        ? `${count(backup.dropped, "malformed entry", "malformed entries")} left out.`
        : "",
    ].filter(Boolean);
    toast.success(`Imported ${count(backup.processes.length, "process", "processes")}`, {
      description: notes.length ? notes.join(" ") : undefined,
    });
  }

  /** Add a second owner so the process survives this person's departure. */
  function addStandIn(processId: string, leavingPersonId: string) {
    const proc = processes.find((p) => p.id === processId);
    if (!proc) return;
    const candidates = tpl.people.filter((p) => p.id !== leavingPersonId && p.active);
    const standIn = suggestOwnerForProcess(
      tpl,
      { ...proc, ownerPersonIds: [] },
      processes,
      candidates,
    );
    if (!standIn) return;
    update(processId, { ownerPersonIds: [...(proc.ownerPersonIds ?? []), standIn.id] });
    toast.success(`${standIn.name} added as a stand-in owner of ${proc.name}`);
  }

  function reassign(fromId: string, processId: string) {
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
      ownerPersonIds: [...(proc.ownerPersonIds ?? []).filter((o) => o !== fromId), candidate.id],
    });
    toast.success(`${proc.name} reassigned to ${candidate.name}`);
  }

  const panelButton = (panel: BuilderPanel) => ({
    size: "sm" as const,
    variant: isOpen(panel) ? ("default" as const) : ("secondary" as const),
    "aria-pressed": isOpen(panel),
    onClick: () => toggle(panel),
  });

  return (
    // The builder lays its panels out by its own width (container queries):
    // on a laptop it is a narrow column beside the canvas.
    <Card className="@container border-accent/30">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Hammer className="size-4 text-accent" />
              Map builder
              {mapCustomized && <Badge variant="accent">custom</Badge>}
            </CardTitle>
            <CardDescription>
              Build your real value stream. Every change re-scores residual risk, duty conflicts and
              map health at once.
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
            onAction={(action) => setPanel(action === "blocks" ? "blocks" : "validate", true)}
          />
        )}
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" onClick={addProcess}>
            <Plus className="size-3.5" /> Add process
          </Button>
          <Button {...panelButton("blocks")}>
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
            {...panelButton("spreadsheet")}
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
          <Button {...panelButton("team")}>
            <Users className="size-3.5" /> Team ({tpl.people.length})
          </Button>
          <Button {...panelButton("workload")}>
            <Scale className="size-3.5" /> Workload
          </Button>
          <Button
            {...panelButton("review")}
            onClick={() =>
              isOpen("review")
                ? setPanel("review", false)
                : review
                  ? setPanel("review", true)
                  : void runReview()
            }
          >
            <ClipboardCheck className="size-3.5" /> Review
          </Button>
          <Button {...panelButton("departure")} title="What breaks if someone leaves">
            <UserMinus className="size-3.5" /> Bus factor
          </Button>
          <Button
            {...panelButton("share")}
            title="Create a read-only link for an advisor or lender"
          >
            <Link2 className="size-3.5" /> Share
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={saveVersion}
            title="Save a named version of this map"
          >
            <Camera className="size-3.5" /> Save version
          </Button>
          {versions.length > 0 && (
            <Button {...panelButton("versions")}>
              <History className="size-3.5" /> Versions ({versions.length})
            </Button>
          )}
          <Button {...panelButton("validate")}>
            <ShieldCheck className="size-3.5" />
            Validate
            {errorCount > 0 && (
              <Badge variant="warn" className="ml-1 px-1 py-0 text-xs">
                {errorCount}
              </Badge>
            )}
          </Button>
          {mapCustomized && (
            <Button {...panelButton("changes")}>
              <GitCompare className="size-3.5" /> Changes
            </Button>
          )}
          {mapCustomized && (
            <Button size="sm" variant="ghost" onClick={resetToTemplate}>
              <RotateCcw className="size-3.5" /> Sample process map
            </Button>
          )}
        </div>

        {isOpen("departure") && (
          <DeparturePanel
            impacts={departures}
            onSelectProcess={onSelectProcess}
            onAddStandIn={addStandIn}
          />
        )}

        {isOpen("spreadsheet") && (
          <SpreadsheetPanel
            businessName={profile.practiceName}
            onApply={(next) => setCustomProcesses(next)}
            onSelectProcess={onSelectProcess}
          />
        )}

        {isOpen("share") && (
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

        {evidenceSummary.total > 0 && evidenceDue > 0 && !isOpen("validate") && (
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
                {count(evidenceDue, "evidence item needs", "evidence items need")} attention
              </span>
              <span className="text-muted">
                {" "}
                · {evidenceSummary.coverage}% of control evidence is current
              </span>
            </span>
            <ChevronRight className="size-3 shrink-0 text-subtle" />
          </button>
        )}

        {isOpen("review") && (
          <ReviewPanel
            review={review}
            loading={reviewing}
            onRefresh={() => void runReview()}
            onSelectProcess={onSelectProcess}
            processes={processes}
          />
        )}

        {isOpen("versions") && versions.length > 0 && (
          <VersionsPanel
            versions={versions}
            current={{ processes, people: tpl.people, health: currentHealth.score }}
            onRestore={(id) => {
              const v = versions.find((x) => x.id === id);
              if (!v) return;
              if (!window.confirm(`Restore "${v.name}"? Your current map goes into undo history.`))
                return;
              restoreMapVersion(id);
              toast.success(`Restored "${v.name}"`, { description: "Ctrl+Z to go back." });
            }}
            onDelete={deleteVersion}
            onSelectProcess={onSelectProcess}
          />
        )}

        {isOpen("workload") && (
          <WorkloadView
            rows={workload}
            processCount={processes.length}
            onSelectProcess={onSelectProcess}
            onReassign={reassign}
          />
        )}

        {isOpen("blocks") && (
          <BlockLibrary
            blocks={builtInBlocks}
            saved={savedBlocks}
            previews={blockPreviews}
            onInsert={insertBlock}
            onRemoveSaved={(id) =>
              setSavedProcessBlocks((blocks) => blocks.filter((b) => b.id !== id))
            }
          />
        )}

        {isOpen("validate") && notAssessed && (
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
        {isOpen("validate") && (
          <ValidationPanel
            issues={validationIssues}
            previews={fixPreviews}
            onSelectProcess={(id) => {
              onSelectProcess(id);
              setPanel("validate", false);
            }}
            onQuickFix={quickFix}
            onFixAll={fixAllQuickWins}
            onCleanLayout={() => {
              const ids = new Set(processes.map((p) => p.id));
              setMapLayout((l) =>
                Object.fromEntries(Object.entries(l).filter(([k]) => ids.has(k))),
              );
              toast.success("Removed stale layout positions");
            }}
          />
        )}

        {isOpen("changes") && mapCustomized && (
          <ChangesView
            processes={processes}
            people={tpl.people}
            onSelectProcess={onSelectProcess}
          />
        )}

        {isOpen("team") && (
          <TeamEditor people={tpl.people} onChange={(next) => setCustomPeople(next)} />
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
                  aria-pressed={p.id === selectedProcessId}
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

/** A block as the next process on the map, in a stage lane after the last one. */
function newBlockProcess(block: ProcessBlock | SavedProcessBlock, processes: ProcessNode[]) {
  return instantiateBlock(block, new Set(processes.map((p) => p.id)), lastStage(processes) + 1);
}

function lastStage(processes: ProcessNode[]): number {
  return Math.max(0, ...processes.map((p) => p.stage ?? 0));
}
