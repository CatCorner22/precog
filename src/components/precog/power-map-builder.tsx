import { memo, useEffect, useMemo, useState } from "react";
import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Download,
  FileText,
  Network,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Table2,
  Trash2,
  Undo2,
  Upload,
  UserRoundCheck,
  Users,
} from "lucide-react";
import { ENTITLEMENTS, type DutyFamily, type EntitlementId } from "@/lib/precog/sod/conflict-rules";
import { applyAssignmentsToPeople } from "@/lib/precog/sod/apply-assignments";
import { JOB_CATALOG, jobCatalogEntry, seatDuties } from "@/lib/precog/onboarding/job-catalog";
import {
  buildAssignments,
  detectSodConflicts,
  sodDetectionOptions,
  type DetectedConflict,
  type RoleAssignment,
} from "@/lib/precog/sod/detect";
import { usePractice } from "@/lib/precog/practice-context";
import { useTemplate } from "@/lib/precog/use-template";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { powerGuidance } from "@/lib/precog/sod/power-guidance";
import {
  applyResolutionPlan,
  buildResolutionPlans,
  type ResolutionPlan,
} from "@/lib/precog/sod/resolution-planner";
import { analyzeAbsenceImpact, analyzeDutyCoverage } from "@/lib/precog/sod/coverage-analysis";
import {
  createPowerMapFile,
  createResponsibilityMatrixCsv,
  normalizeRoleAssignments,
  POWER_MAP_STORAGE_KEY,
} from "@/lib/precog/sod/model-io";
import { evaluateAssignmentChange } from "@/lib/precog/sod/change-impact";
import {
  buildCoveragePlans,
  buildCoverageProgram,
  dutyToggleEffects,
  type CoveragePlan,
  type DutyToggleEffect,
} from "@/lib/precog/sod/coverage-planner";
import { createGovernanceReport } from "@/lib/precog/sod/governance-report";
import { diffAssignments } from "@/lib/precog/sod/assignment-diff";
import { calculatePowerIndex } from "@/lib/precog/sod/power-index";
import { DUTY_CONTROL_MEASURES } from "@/lib/precog/sod/control-measures";

const FAMILY_META: Record<DutyFamily, { label: string; color: string; description: string }> = {
  authorization: {
    label: "Authorization",
    color: "#a78bfa",
    description: "Approve or direct a transaction",
  },
  custody: {
    label: "Custody",
    color: "#fb7185",
    description: "Hold money, data, goods, or release capability",
  },
  recording: {
    label: "Recording",
    color: "#60a5fa",
    description: "Enter transactions or alter records",
  },
  reconciliation: {
    label: "Reconciliation",
    color: "#34d399",
    description: "Independently verify what occurred",
  },
  master_data: {
    label: "Master data",
    color: "#fbbf24",
    description: "Change standing data, users, vendors, or prices",
  },
};

export function PowerMapBuilder() {
  const tpl = useTemplate();
  const { profile, setCustomPeople } = usePractice();
  // The map is a view of the people register: every grant, revocation, hire,
  // or import writes through to the profile, so the conflict list, the
  // matrix, and the dashboard summary all read the same assignments.
  const assignments = useMemo(() => buildAssignments(tpl), [tpl]);
  const guidanceByDuty = powerGuidance(profile.industry);
  const [selectedId, setSelectedId] = useState(assignments[0]?.personId ?? "");
  const [search, setSearch] = useState("");
  const [family, setFamily] = useState<DutyFamily | "all">("all");
  const [conflictsOnly, setConflictsOnly] = useState(false);
  // Simulated hires come from the same job catalog the setup grid uses, seated
  // for this line of business; the sample's dental role list suits no one else.
  const [newJobId, setNewJobId] = useState(JOB_CATALOG[0]?.id ?? "");
  const [simulationName, setSimulationName] = useState("");
  const [history, setHistory] = useState<RoleAssignment[][]>([]);
  const [absentPersonId, setAbsentPersonId] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [mapView, setMapView] = useState<"graph" | "matrix">("graph");
  // The accepted baseline is kept per business in this browser, so leaving
  // the tab with changes pending does not quietly approve them: reopening
  // the map still shows them against the last baseline the owner accepted.
  const baselineKey = `precog.power-map-baseline.v1:${profile.businessId ?? "biz_default"}`;
  const [baseline, setBaseline] = useState<RoleAssignment[]>(() => {
    try {
      const stored = window.localStorage.getItem(baselineKey);
      const restored = stored ? normalizeRoleAssignments(JSON.parse(stored)) : undefined;
      if (restored) return restored;
    } catch {
      /* storage unavailable or corrupt: start from today's assignments */
    }
    return assignments;
  });
  const [processId, setProcessId] = useState("all");

  useEffect(() => {
    // The first time a business opens the map, today's assignments become the
    // baseline and are stored, so edits made now still show as pending after
    // the owner leaves the tab and comes back.
    try {
      if (window.localStorage.getItem(baselineKey) === null) {
        window.localStorage.setItem(baselineKey, JSON.stringify(baseline));
      }
    } catch {
      /* storage unavailable */
    }
  }, [baselineKey, baseline]);

  function acceptBaseline(next: RoleAssignment[]) {
    setBaseline(next);
    try {
      window.localStorage.setItem(baselineKey, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  }

  useEffect(() => {
    // Earlier builds kept a separate sandbox copy of the map in this browser.
    // The profile is the only copy now, so drop the orphaned key.
    try {
      window.localStorage.removeItem(POWER_MAP_STORAGE_KEY);
    } catch {
      /* storage unavailable */
    }
  }, []);

  const report = useMemo(
    () =>
      detectSodConflicts(tpl, profile.staff, {
        ...sodDetectionOptions(tpl, profile.dualRelease),
        assignments,
      }),
    [assignments, profile.dualRelease, profile.staff, tpl],
  );
  const coverage = useMemo(() => analyzeDutyCoverage(assignments), [assignments]);
  const coveragePlans = useMemo(
    () => buildCoveragePlans(assignments, profile.staff),
    [assignments, profile.staff],
  );
  const coverageProgram = useMemo(
    () => buildCoverageProgram(assignments, profile.staff),
    [assignments, profile.staff],
  );
  const pendingChanges = useMemo(
    () => diffAssignments(baseline, assignments),
    [assignments, baseline],
  );
  const powerIndex = useMemo(() => calculatePowerIndex(assignments), [assignments]);
  const absenceImpact = useMemo(
    () => (absentPersonId ? analyzeAbsenceImpact(assignments, absentPersonId) : undefined),
    [absentPersonId, assignments],
  );
  const selected = assignments.find((item) => item.personId === selectedId) ?? assignments[0];
  const selectedConflicts = useMemo(
    () => report.conflicts.filter((item) => item.personId === selectedId),
    [report.conflicts, selectedId],
  );
  const conflictEntitlements = useMemo(
    () => new Set(selectedConflicts.flatMap((item) => [item.entitlementA, item.entitlementB])),
    [selectedConflicts],
  );
  const graph = useMemo(
    () => buildGraph(assignments, report.conflicts, conflictsOnly, processId),
    [assignments, report.conflicts, conflictsOnly, processId],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState(graph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(graph.edges);

  useEffect(() => {
    setNodes((current) => {
      const positions = new Map(current.map((node) => [node.id, node.position]));
      return graph.nodes.map((node) => ({
        ...node,
        position: positions.get(node.id) ?? node.position,
      }));
    });
    setEdges(graph.edges);
  }, [graph, setEdges, setNodes]);

  const visibleEntitlements = useMemo(() => {
    const query = search.trim().toLowerCase();
    return ENTITLEMENTS.filter((item) => item.id !== "view_reports_only")
      .filter((item) => family === "all" || item.family === family)
      .filter((item) => processId === "all" || item.processIds.includes(processId))
      .filter(
        (item) =>
          !query ||
          `${item.label} ${item.family} ${item.processIds.join(" ")}`.toLowerCase().includes(query),
      );
  }, [family, processId, search]);
  const toggleEffects = useMemo(
    () =>
      selected
        ? dutyToggleEffects(
            selected,
            ENTITLEMENTS.filter((item) => item.id !== "view_reports_only").map((item) => item.id),
            assignments,
          )
        : new Map<EntitlementId, DutyToggleEffect>(),
    [selected, assignments],
  );

  function toggle(entitlement: EntitlementId) {
    if (!selected) return;
    const impact = evaluateAssignmentChange(
      assignments,
      selected.personId,
      entitlement,
      profile.staff,
    );
    if (impact) commit(impact.nextAssignments);
  }

  function toggleForPerson(personId: string, entitlement: EntitlementId) {
    const impact = evaluateAssignmentChange(assignments, personId, entitlement, profile.staff);
    if (!impact) return;
    setSelectedId(personId);
    commit(impact.nextAssignments);
  }

  function addSimulationRole() {
    const job = jobCatalogEntry(newJobId);
    if (!job) return;
    const id = `sim-${Date.now().toString(36)}`;
    commit([
      ...assignments,
      {
        personId: id,
        personName: simulationName.trim().slice(0, 40) || `Proposed ${job.title}`,
        role: job.title,
        entitlements: seatDuties(job, profile.industry),
      },
    ]);
    setSelectedId(id);
    setSimulationName("");
  }

  function reset() {
    // An owner's own team goes back to the baseline they last accepted; its
    // people carry the duties the owner entered, and a job's usual duties
    // would overwrite them. The sample goes back to its role defaults.
    const ownTeam = tpl.people.some((person) => (person.entitlements?.length ?? 0) > 0);
    if (
      !window.confirm(
        ownTeam
          ? "Put every person's duties back to the baseline you last accepted, and remove simulated hires? Changes since then are undone."
          : "Put every person back to the duties their role implies, and remove simulated hires?",
      )
    ) {
      return;
    }
    if (ownTeam) {
      const accepted = baseline.filter((person) => !person.personId.startsWith("sim-"));
      commit(accepted);
      setSelectedId(accepted[0]?.personId ?? "");
      setConflictsOnly(false);
      return;
    }
    const defaults = buildAssignments({
      ...tpl,
      people: tpl.people
        .filter((person) => !person.id.startsWith("sim-"))
        .map((person) => ({ ...person, entitlements: undefined })),
    });
    commit(defaults);
    setSelectedId(defaults[0]?.personId ?? "");
    setConflictsOnly(false);
  }

  function removeSelected() {
    if (!selected?.personId.startsWith("sim-")) return;
    commit(assignments.filter((person) => person.personId !== selected.personId));
    setSelectedId(
      assignments.find((person) => !person.personId.startsWith("sim-"))?.personId ?? "",
    );
  }

  const criticalCount = report.conflicts.filter(
    (item) => item.severity === "critical" && !item.dualReleaseMitigated,
  ).length;

  function write(next: RoleAssignment[]) {
    setCustomPeople((people) => applyAssignmentsToPeople(people, next));
  }

  function commit(next: RoleAssignment[]) {
    setHistory((items) => [...items.slice(-19), assignments]);
    write(next);
  }

  function undo() {
    const previous = history.at(-1);
    if (!previous) return;
    write(previous);
    setHistory((items) => items.slice(0, -1));
  }

  function exportModel() {
    const blob = new Blob([JSON.stringify(createPowerMapFile(assignments), null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `precog-power-map-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportMatrixCsv() {
    downloadFile(
      createResponsibilityMatrixCsv(assignments),
      "text/csv;charset=utf-8",
      `precog-responsibility-matrix-${new Date().toISOString().slice(0, 10)}.csv`,
    );
  }

  function exportGovernanceReport() {
    downloadFile(
      createGovernanceReport(assignments, profile.staff, new Date(), profile.industry),
      "text/markdown;charset=utf-8",
      `precog-governance-report-${new Date().toISOString().slice(0, 10)}.md`,
    );
  }

  async function importModel(file: File | undefined) {
    if (!file) return;
    try {
      if (file.size > 256_000) throw new Error("File exceeds 256 KB");
      const restored = normalizeRoleAssignments(JSON.parse(await file.text()));
      if (!restored) throw new Error("No valid assignment model found");
      commit(restored);
      setSelectedId(restored[0]?.personId ?? "");
      acceptBaseline(restored);
      setImportMessage(`Imported ${restored.length} people`);
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : "Import failed");
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          icon={Users}
          label="People / jobs"
          value={assignments.length}
          detail={`${JOB_CATALOG.length} job titles to simulate a hire`}
        />
        <Metric
          icon={UserRoundCheck}
          label="Duty backup (this app's index, 0 to 100)"
          value={coverage.resilienceScore}
          detail={`${coverage.singlePoints.length} high-risk duties with one holder · ${coverage.unassigned.length} duties nobody holds (some may not apply)`}
          danger={coverage.unassigned.length > 0}
        />
        <Metric
          icon={AlertTriangle}
          label="Open conflicts"
          value={report.conflicts.length}
          detail={`${report.summary.peopleWithConflicts} people affected`}
          danger={report.conflicts.length > 0}
        />
        <Metric
          icon={ShieldCheck}
          label="Critical open"
          value={criticalCount}
          detail={`SoD health ${report.summary.segregationHealth}/100`}
          danger={criticalCount > 0}
        />
      </div>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">Change review</CardTitle>
            <CardDescription>
              Review proposed grants, revocations, hires, and removals against the loaded baseline
              before treating the model as approved.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                commit(baseline);
                setSelectedId(baseline[0]?.personId ?? "");
              }}
              disabled={!pendingChanges.length}
            >
              <RotateCcw className="size-3.5" />
              Discard
            </Button>
            <Button
              size="sm"
              onClick={() => {
                acceptBaseline(assignments);
                setHistory([]);
              }}
              disabled={!pendingChanges.length}
            >
              <Check className="size-3.5" />
              Accept baseline
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {pendingChanges.length ? (
            <>
              <div className="mb-3 flex flex-wrap gap-2">
                <Badge variant="accent">{pendingChanges.length} pending</Badge>
                <Badge>
                  {pendingChanges.filter((item) => item.kind === "duty_granted").length} grants
                </Badge>
                <Badge>
                  {pendingChanges.filter((item) => item.kind === "duty_revoked").length} revocations
                </Badge>
              </div>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {pendingChanges.slice(0, 12).map((change) => (
                  <div
                    key={change.id}
                    className="rounded-lg border border-border bg-elevated p-2.5"
                  >
                    <p className="text-xs font-medium">{change.personName}</p>
                    <p
                      className={cn(
                        "mt-0.5 text-[10px]",
                        change.kind === "duty_granted" || change.kind === "person_added"
                          ? "text-primary"
                          : "text-warn",
                      )}
                    >
                      {change.kind.replaceAll("_", " ")}{" "}
                      {change.dutyLabel ? `· ${change.dutyLabel}` : `· ${change.role}`}
                    </p>
                  </div>
                ))}
              </div>
              {pendingChanges.length > 12 && (
                <p className="mt-2 text-xs text-subtle">
                  +{pendingChanges.length - 12} additional pending changes.
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-ok">
              No pending model changes. Current assignments match the accepted baseline.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Authority concentration</CardTitle>
          <CardDescription>
            A comparative index of risk-weighted powers, duty-family breadth, exclusive
            capabilities, and active conflicts. Use it to prioritize oversight—not as a finding by
            itself.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 lg:grid-cols-2">
          {powerIndex.slice(0, 8).map((person) => (
            <button
              key={person.personId}
              type="button"
              onClick={() => setSelectedId(person.personId)}
              className={cn(
                "rounded-xl border p-3 text-left",
                selectedId === person.personId
                  ? "border-primary/50 bg-primary/10"
                  : "border-border bg-elevated",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{person.personName}</p>
                  <p className="text-[10px] text-subtle">{person.role}</p>
                </div>
                <span
                  className={cn(
                    "text-lg font-semibold tabular",
                    person.authorityIndex >= 75
                      ? "text-danger"
                      : person.authorityIndex >= 50
                        ? "text-warn"
                        : "text-primary",
                  )}
                >
                  {person.authorityIndex}
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-bg">
                <div
                  className={cn(
                    "h-full rounded-full",
                    person.authorityIndex >= 75
                      ? "bg-danger"
                      : person.authorityIndex >= 50
                        ? "bg-warn"
                        : "bg-primary",
                  )}
                  style={{ width: `${person.authorityIndex}%` }}
                />
              </div>
              <p className="mt-2 text-[10px] text-subtle">
                {person.familyCount} duty families · {person.exclusiveDutyCount} exclusive powers ·{" "}
                {person.conflictCount} conflicts
              </p>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Coverage & continuity</CardTitle>
          <CardDescription>
            SoD asks whether powers are safely separated. Continuity asks whether essential work has
            an owner and a trained backup. Address both before implementing the model.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 lg:grid-cols-3">
          <CoverageList
            title="Unassigned duties"
            empty="Every duty has an owner."
            items={coverage.unassigned.map((item) => ({
              id: item.entitlementId,
              label: item.label,
              detail: `Risk ${item.riskWeight}/5 · assign a primary owner`,
            }))}
            danger
          />
          <CoverageList
            title="Critical single points"
            empty="High-risk duties have backup coverage."
            items={coverage.singlePoints.map((item) => ({
              id: item.entitlementId,
              label: item.label,
              detail: `${item.assignees[0]?.personName} is the only assignee · designate a trained backup`,
            }))}
          />
          <CoverageList
            title="Power concentration"
            empty="No person holds four or more high-risk powers."
            items={coverage.highRiskConcentration.map((item) => ({
              id: item.personId,
              label: item.personName,
              detail: `${item.count} high-risk powers · review scope and monitoring`,
            }))}
          />
        </CardContent>
      </Card>

      {coveragePlans.length > 0 && (
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="text-base">Backup suggestions</CardTitle>
              <CardDescription>
                For high-risk duties only one person holds: people who already hold a significant
                duty in the same process and hold no conflict, where adding the duty creates no
                conflict the rules detect. Check each person can actually do the work before you
                assign it; undo is one click.
              </CardDescription>
            </div>
            {coverageProgram.steps.length > 1 && (
              <Button
                size="sm"
                onClick={() => {
                  if (
                    window.confirm(
                      `Assign all ${coverageProgram.steps.length} suggested backups? Check each person can do the work; you can undo.`,
                    )
                  ) {
                    commit(coverageProgram.nextAssignments);
                  }
                }}
              >
                <ShieldCheck className="size-3.5" />
                Assign all suggested backups
              </Button>
            )}
          </CardHeader>
          {coverageProgram.steps.length > 1 && (
            <CardContent className="grid gap-2 border-t border-border py-3 sm:grid-cols-3">
              <ImpactMetric
                label="Suggested backups"
                value={String(coverageProgram.steps.length)}
                detail="Recalculated after each one"
              />
              <ImpactMetric
                label="Projected duty backup"
                value={`${coverageProgram.projectedScore}/100`}
                detail={`+${coverageProgram.projectedScore - coverageProgram.startingScore} points`}
              />
              <ImpactMetric
                label="Still one holder"
                value={String(coverageProgram.unresolvedGaps)}
                detail="Need someone outside, or a control"
                danger={coverageProgram.unresolvedGaps > 0}
              />
            </CardContent>
          )}
          <CardContent className="space-y-3">
            {Array.from(new Set(coveragePlans.map((plan) => plan.entitlement)))
              .slice(0, 6)
              .map((entitlement) => {
                const options = coveragePlans.filter((plan) => plan.entitlement === entitlement);
                const first = options[0];
                return (
                  <div
                    key={entitlement}
                    className="grid gap-3 rounded-xl border border-border bg-elevated p-3 lg:grid-cols-[minmax(220px,0.8fr)_minmax(0,2fr)]"
                  >
                    <div>
                      <Badge variant={first.reason === "unassigned" ? "danger" : "warn"}>
                        {first.reason === "unassigned" ? "Owner needed" : "Backup needed"}
                      </Badge>
                      <p className="mt-2 text-sm font-medium">{first.dutyLabel}</p>
                      <p className="mt-1 text-xs text-subtle">
                        Each candidate works in this duty&apos;s process already and adds no
                        conflict the rules detect.
                      </p>
                    </div>
                    <div className="grid gap-2 xl:grid-cols-3">
                      {options.map((plan) => (
                        <CoveragePlanOption
                          key={plan.id}
                          plan={plan}
                          onApply={() => {
                            setSelectedId(plan.toPersonId);
                            commit(plan.nextAssignments);
                          }}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
          </CardContent>
        </Card>
      )}

      {coveragePlans.length === 0 && coverage.singlePoints.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Backup suggestions</CardTitle>
            <CardDescription>
              No backup to suggest. Everyone who works in these duties&apos; processes already holds
              a conflict, or would gain one by taking the duty on. Separate a conflict first, or
              write the procedure down so a stand-in or your outside accountant can follow it.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {coverage.singlePoints.map((duty) => (
              <Badge key={duty.entitlementId} variant="warn">
                {duty.label} · only {duty.assignees[0]?.personName ?? "one person"}
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Absence stress test</CardTitle>
          <CardDescription>
            Temporarily remove one person from the model to see which duties stop and which lose
            backup coverage. This simulation does not change assignments.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 lg:grid-cols-[280px_1fr]">
          <label className="block text-sm">
            <span className="text-muted">Who is unavailable?</span>
            <select
              value={absentPersonId}
              onChange={(event) => setAbsentPersonId(event.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-elevated px-3 py-2"
            >
              <option value="">Select a person…</option>
              {assignments.map((person) => (
                <option key={person.personId} value={person.personId}>
                  {person.personName} · {person.role}
                </option>
              ))}
            </select>
          </label>
          {absenceImpact ? (
            <div className="grid gap-2 sm:grid-cols-3">
              <ImpactMetric
                label="Continuity after absence"
                value={`${absenceImpact.remainingResilienceScore}/100`}
                detail={`${absenceImpact.scoreChange} points`}
                danger={absenceImpact.scoreChange < 0}
              />
              <ImpactMetric
                label="Duties stopped"
                value={String(absenceImpact.newlyUnassigned.length)}
                detail="No remaining assignee"
                danger={absenceImpact.newlyUnassigned.length > 0}
              />
              <ImpactMetric
                label="Backups lost"
                value={String(absenceImpact.newlySinglePoint.length)}
                detail="Now dependent on one person"
                danger={absenceImpact.newlySinglePoint.length > 0}
              />
            </div>
          ) : (
            <div className="flex min-h-20 items-center rounded-xl border border-dashed border-border px-4 text-sm text-subtle">
              Choose any employee, owner, or contractor to run a no-change continuity simulation.
            </div>
          )}
        </CardContent>
        {absenceImpact &&
          (absenceImpact.newlyUnassigned.length > 0 ||
            absenceImpact.newlySinglePoint.length > 0) && (
            <CardContent className="grid gap-3 border-t border-border pt-4 lg:grid-cols-2">
              <CoverageList
                title="Work that stops"
                empty="No duties stop."
                items={absenceImpact.newlyUnassigned.map((item) => ({
                  id: item.entitlementId,
                  label: item.label,
                  detail: "No remaining authorized owner",
                }))}
                danger
              />
              <CoverageList
                title="Work now at risk"
                empty="No new single points."
                items={absenceImpact.newlySinglePoint.map((item) => ({
                  id: item.entitlementId,
                  label: item.label,
                  detail: `${item.assignees[0]?.personName} becomes the only remaining assignee`,
                }))}
              />
            </CardContent>
          )}
      </Card>

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
              <span aria-live="polite" className="ml-auto text-[11px] text-subtle">
                {importMessage || "Saved with your business"}
              </span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-lg border border-border bg-elevated p-2">
              {Object.entries(FAMILY_META).map(([id, meta]) => (
                <span
                  key={id}
                  className="flex items-center gap-1.5 text-[10px] text-muted"
                  title={meta.description}
                >
                  <span className="size-2 rounded-full" style={{ background: meta.color }} />
                  {meta.label}
                </span>
              ))}
              <label className="ml-auto flex items-center gap-2 text-[10px] text-muted">
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
                      {person.personName} · {person.role}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-border bg-elevated p-2">
                  <p className="text-[10px] text-subtle">POWERS</p>
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
                  <p className="text-[10px] text-subtle">CONFLICTS</p>
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
                      "shrink-0 rounded-full border px-2 py-0.5 text-[10px] capitalize",
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
                          "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border text-[10px]",
                          active && "border-primary bg-primary text-primary-fg",
                        )}
                      >
                        {active ? "✓" : ""}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-xs font-medium">{entitlement.label}</span>
                        <span className="text-[10px] capitalize text-subtle">
                          {FAMILY_META[entitlement.family].label} · risk {entitlement.riskWeight}/5
                        </span>
                        <span className="mt-1 block text-[10px] leading-relaxed text-subtle">
                          {guidance.purpose}
                        </span>
                        {creates > 0 && (
                          <span className="mt-1 block text-[10px] font-medium text-danger">
                            Assigning creates {creates} conflict{creates === 1 ? "" : "s"}
                          </span>
                        )}
                        {resolves > 0 && (
                          <span className="mt-1 block text-[10px] font-medium text-ok">
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

      {selectedConflicts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resolution planner · {selected?.personName}</CardTitle>
            <CardDescription>
              Compare conflict-safe transfers before changing the model. Suggestions never create a
              new detected conflict; apply one, inspect the new health score, and undo at any time.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {selectedConflicts.map((conflict) => (
              <div
                key={conflict.id}
                className="grid gap-2 rounded-xl border border-border bg-elevated p-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]"
              >
                <ConflictCard conflict={conflict} />
                <ResolutionOptions
                  assignments={assignments}
                  conflict={conflict}
                  onApply={(plan) => commit(applyResolutionPlan(assignments, plan))}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <ControlMeasuresMatrix duties={visibleEntitlements} />

      {selected && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Responsibility charter · {selected.personName}
            </CardTitle>
            <CardDescription>
              A review-ready definition of each assigned power, its expected evidence, and its
              boundary.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 lg:grid-cols-2">
            {selected.entitlements
              .filter((id) => id !== "view_reports_only")
              .map((id) => {
                const entitlement = ENTITLEMENTS.find((item) => item.id === id);
                const guidance = guidanceByDuty[id];
                return (
                  <div key={id} className="rounded-xl border border-border bg-elevated p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium">{entitlement?.label}</p>
                      <Badge>{entitlement ? FAMILY_META[entitlement.family].label : "Duty"}</Badge>
                    </div>
                    <p className="mt-2 text-xs text-muted">{guidance.purpose}</p>
                    <p className="mt-2 text-[11px] text-subtle">
                      <strong className="text-muted">Evidence:</strong> {guidance.evidence}
                    </p>
                    <p className="mt-1 text-[11px] text-subtle">
                      <strong className="text-muted">Boundary:</strong> {guidance.boundary}
                    </p>
                  </div>
                );
              })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/**
 * The catalog is fixed advice for every visible duty, several hundred rows of
 * it. It opens on request, so the Power map does not lay out a 1,280-pixel
 * table nobody asked for, and it re-renders only when the duty filter
 * changes, not on every grant or selection.
 */
const ControlMeasuresMatrix = memo(function ControlMeasuresMatrix({
  duties,
}: {
  duties: typeof ENTITLEMENTS;
}) {
  const [open, setOpen] = useState(false);
  const categories = ["directive", "preventive", "detective", "corrective"] as const;
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-base">Internal control action catalog</CardTitle>
          <CardDescription>
            A menu of directive, preventive, detective, and corrective measures for every visible
            duty. Pick proportionate primary controls and documented alternatives; no single action
            replaces accountable review.
          </CardDescription>
        </div>
        <Button
          size="sm"
          variant="secondary"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          {open ? "Hide the catalog" : `Show the catalog (${duties.length} duties)`}
        </Button>
      </CardHeader>
      {open && (
        <CardContent>
          <div className="max-h-[760px] overflow-auto rounded-xl border border-border">
            <table className="min-w-[1280px] border-separate border-spacing-0 text-xs">
              <caption className="sr-only">
                Internal control measures for each duty, organized by directive, preventive,
                detective, and corrective category.
              </caption>
              <thead className="sticky top-0 z-20 bg-surface">
                <tr>
                  <th
                    scope="col"
                    className="sticky left-0 z-30 w-64 border-b border-r border-border bg-surface p-3 text-left"
                  >
                    Power / duty
                  </th>
                  {categories.map((category) => (
                    <th
                      key={category}
                      scope="col"
                      className="w-64 border-b border-r border-border p-3 text-left capitalize"
                    >
                      {category}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {duties.map((duty) => {
                  const controls = DUTY_CONTROL_MEASURES[duty.id];
                  return (
                    <tr key={duty.id} className="align-top">
                      <th
                        scope="row"
                        className="sticky left-0 z-10 border-b border-r border-border bg-surface p-3 text-left"
                      >
                        <span className="block font-medium text-fg">{duty.label}</span>
                        <span className="mt-1 block text-[10px] font-normal text-subtle">
                          {FAMILY_META[duty.family].label} · risk {duty.riskWeight}/5
                        </span>
                      </th>
                      {categories.map((category) => (
                        <td key={category} className="border-b border-r border-border bg-bg p-3">
                          <ul className="space-y-2 text-muted">
                            {controls[category].map((action) => (
                              <li key={action} className="flex gap-2">
                                <span aria-hidden="true" className="text-primary">
                                  •
                                </span>
                                <span>{action}</span>
                              </li>
                            ))}
                          </ul>
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      )}
    </Card>
  );
});

function ResponsibilityMatrix({
  assignments,
  conflicts,
  conflictsOnly,
  processId,
  onToggle,
}: {
  assignments: RoleAssignment[];
  conflicts: DetectedConflict[];
  conflictsOnly: boolean;
  processId: string;
  onToggle: (personId: string, entitlement: EntitlementId) => void;
}) {
  const conflictKeys = new Set(
    conflicts.flatMap((item) => [
      `${item.personId}:${item.entitlementA}`,
      `${item.personId}:${item.entitlementB}`,
    ]),
  );
  const conflictedPeople = new Set(conflicts.map((item) => item.personId));
  const conflictedDuties = new Set(
    conflicts.flatMap((item) => [item.entitlementA, item.entitlementB]),
  );
  const shownPeople = conflictsOnly
    ? assignments.filter((item) => conflictedPeople.has(item.personId))
    : assignments;
  const duties = ENTITLEMENTS.filter(
    (item) =>
      item.id !== "view_reports_only" &&
      (!conflictsOnly || conflictedDuties.has(item.id)) &&
      (processId === "all" || item.processIds.includes(processId)),
  );
  return (
    <div className="max-h-[720px] overflow-auto rounded-xl border border-border bg-bg">
      <table className="min-w-max border-separate border-spacing-0 text-xs">
        <caption className="sr-only">
          Responsibility assignment matrix. Rows are duties and columns are people. Select a cell to
          add or remove an assignment.
        </caption>
        <thead className="sticky top-0 z-20 bg-surface">
          <tr>
            <th
              scope="col"
              className="sticky left-0 z-30 min-w-64 border-b border-r border-border bg-surface p-3 text-left"
            >
              Power / duty
            </th>
            {shownPeople.map((person) => (
              <th
                key={person.personId}
                scope="col"
                className="h-36 w-16 border-b border-border p-2 align-bottom"
              >
                <span
                  className="block max-w-32 -rotate-45 origin-bottom-left whitespace-nowrap text-left font-medium text-muted"
                  title={`${person.personName} · ${person.role}`}
                >
                  {person.personName}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {duties.map((duty) => (
            <tr key={duty.id}>
              <th
                scope="row"
                className="sticky left-0 z-10 border-b border-r border-border bg-surface p-2 text-left"
              >
                <span className="block font-medium">{duty.label}</span>
                <span className="text-[10px] font-normal text-subtle">
                  {FAMILY_META[duty.family].label} · risk {duty.riskWeight}/5
                </span>
              </th>
              {shownPeople.map((person) => {
                const active = person.entitlements.includes(duty.id);
                const conflict = conflictKeys.has(`${person.personId}:${duty.id}`);
                return (
                  <td key={person.personId} className="border-b border-border p-1 text-center">
                    <button
                      type="button"
                      aria-label={`${active ? "Remove" : "Assign"} ${duty.label} ${active ? "from" : "to"} ${person.personName}${conflict ? "; participates in a conflict" : ""}`}
                      aria-pressed={active}
                      onClick={() => onToggle(person.personId, duty.id)}
                      className={cn(
                        "mx-auto flex size-8 items-center justify-center rounded-md border text-sm",
                        conflict
                          ? "border-danger bg-danger/20 text-danger"
                          : active
                            ? "border-primary/50 bg-primary/15 text-primary"
                            : "border-border text-transparent hover:border-primary/40 hover:text-subtle",
                      )}
                      title={`${person.personName} · ${duty.label}${conflict ? " · conflict" : ""}`}
                    >
                      {conflict ? "!" : active ? "✓" : "+"}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function downloadFile(content: string, type: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function CoverageList({
  title,
  empty,
  items,
  danger,
}: {
  title: string;
  empty: string;
  items: Array<{ id: string; label: string; detail: string }>;
  danger?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-elevated p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{title}</p>
        <Badge variant={items.length ? (danger ? "danger" : "warn") : "ok"}>{items.length}</Badge>
      </div>
      {items.length ? (
        <div className="max-h-48 space-y-2 overflow-y-auto">
          {items.map((item) => (
            <div key={item.id} className="rounded-lg border border-border bg-bg p-2">
              <p className="text-xs font-medium">{item.label}</p>
              <p className="mt-0.5 text-[10px] leading-relaxed text-subtle">{item.detail}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-ok">{empty}</p>
      )}
    </div>
  );
}

function CoveragePlanOption({ plan, onApply }: { plan: CoveragePlan; onApply: () => void }) {
  return (
    <button
      type="button"
      onClick={onApply}
      className="rounded-lg border border-border bg-bg p-2.5 text-left hover:border-primary/50"
    >
      <span className="block text-xs font-medium">{plan.toPersonName}</span>
      <span className="block text-[10px] text-subtle">
        {plan.toRole} · {plan.currentWorkload} current duties
      </span>
      <span className="mt-1 block text-[10px] font-medium text-ok">
        +{plan.continuityGain} continuity · no new conflicts
      </span>
    </button>
  );
}

function ImpactMetric({
  label,
  value,
  detail,
  danger,
}: {
  label: string;
  value: string;
  detail: string;
  danger?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-elevated p-3",
        danger ? "border-danger/40" : "border-ok/30",
      )}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-subtle">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular">{value}</p>
      <p className={cn("text-[11px]", danger ? "text-danger" : "text-ok")}>{detail}</p>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  detail,
  danger,
}: {
  icon: typeof Users;
  label: string;
  value: number;
  detail: string;
  danger?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-surface p-3",
        danger ? "border-danger/30" : "border-border",
      )}
    >
      <div className="flex items-center gap-2 text-xs text-muted">
        <Icon className={cn("size-3.5", danger ? "text-danger" : "text-primary")} />
        {label}
      </div>
      <p className="mt-1 text-2xl font-semibold tabular">{value}</p>
      <p className="text-[11px] text-subtle">{detail}</p>
    </div>
  );
}

function ConflictCard({ conflict }: { conflict: DetectedConflict }) {
  return (
    <div
      className={cn(
        "rounded-xl border p-3",
        conflict.dualReleaseMitigated
          ? "border-ok/30 bg-ok/5"
          : conflict.severity === "critical"
            ? "border-danger/30 bg-danger/5"
            : "border-warn/30 bg-warn/5",
      )}
    >
      <div className="flex flex-wrap gap-2">
        <Badge
          variant={
            conflict.dualReleaseMitigated
              ? "ok"
              : conflict.severity === "critical"
                ? "danger"
                : "warn"
          }
        >
          {conflict.severity} · {conflict.score}
        </Badge>
        {conflict.dualReleaseMitigated && <Badge variant="ok">dual-release mitigated</Badge>}
      </div>
      <p className="mt-2 text-sm font-medium">{conflict.title}</p>
      <p className="mt-1 text-xs text-muted">
        {conflict.labelA} × {conflict.labelB}
      </p>
      <p className="mt-1 text-xs text-subtle">{conflict.why}</p>
      <p className="mt-2 text-xs text-ok">
        Fallback: {conflict.compensatingControls.slice(0, 2).join("; ")}
      </p>
    </div>
  );
}

function ResolutionOptions({
  assignments,
  conflict,
  onApply,
}: {
  assignments: RoleAssignment[];
  conflict: DetectedConflict;
  onApply: (plan: ResolutionPlan) => void;
}) {
  const plans = buildResolutionPlans(assignments, conflict);
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-subtle">
        Clean resolution paths
      </p>
      {plans.length ? (
        plans.slice(0, 3).map((plan, index) => (
          <div
            key={plan.id}
            className="flex items-center gap-3 rounded-lg border border-border bg-bg p-2.5"
          >
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium">{plan.summary}</p>
              <p className="mt-0.5 text-[10px] text-subtle">
                Resolves {plan.conflictsResolved} conflict{plan.conflictsResolved === 1 ? "" : "s"}{" "}
                · creates no new conflicts
                {plan.toPersonName
                  ? " · preserves duty coverage"
                  : " · verify coverage before implementation"}
              </p>
            </div>
            <Button
              size="sm"
              variant={index === 0 ? "default" : "secondary"}
              onClick={() => onApply(plan)}
            >
              Apply <ArrowRight className="size-3.5" />
            </Button>
          </div>
        ))
      ) : (
        <p className="rounded-lg border border-warn/30 bg-warn/5 p-3 text-xs text-muted">
          No clean reassignment is available. Use an independent reviewer or the compensating
          control shown for this conflict.
        </p>
      )}
    </div>
  );
}

function buildGraph(
  assignments: RoleAssignment[],
  conflicts: DetectedConflict[],
  conflictsOnly: boolean,
  processId = "all",
): { nodes: Node[]; edges: Edge[] } {
  const conflictKeys = new Set(
    conflicts.flatMap((item) => [
      `${item.personId}:${item.entitlementA}`,
      `${item.personId}:${item.entitlementB}`,
    ]),
  );
  const conflictedDutyIds = new Set(
    conflicts.flatMap((item) => [item.entitlementA, item.entitlementB]),
  );
  const conflictedPeople = new Set(conflicts.map((item) => item.personId));
  const families = Object.keys(FAMILY_META) as DutyFamily[];
  const shownAssignments = conflictsOnly
    ? assignments.filter((person) => conflictedPeople.has(person.personId))
    : assignments;
  const shownDuties = ENTITLEMENTS.filter(
    (item) =>
      item.id !== "view_reports_only" &&
      (!conflictsOnly || conflictedDutyIds.has(item.id)) &&
      (processId === "all" || item.processIds.includes(processId)),
  );
  const nodes: Node[] = shownAssignments.map((person, index) => ({
    id: `person:${person.personId}`,
    position: { x: 10, y: 80 + index * 110 },
    data: { label: `${person.personName}\n${person.role}` },
    style: {
      width: 205,
      border: `1px solid ${conflictedPeople.has(person.personId) ? "#f87171" : "#3d9cfd"}`,
      borderColor: conflictedPeople.has(person.personId) ? "#f87171" : "#3d9cfd",
      background: "#151820",
      color: "#e8eaef",
      whiteSpace: "pre-line",
      borderRadius: 10,
    },
  }));
  for (const [familyIndex, family] of families.entries()) {
    const duties = shownDuties.filter((item) => item.family === family);
    for (const [index, entitlement] of duties.entries())
      nodes.push({
        id: `duty:${entitlement.id}`,
        position: { x: 320 + familyIndex * 245, y: 70 + index * 100 },
        data: {
          label: `${entitlement.label}\n${FAMILY_META[family].label} · risk ${entitlement.riskWeight}/5`,
        },
        style: {
          width: 215,
          border: `1px solid ${FAMILY_META[family].color}`,
          borderColor: FAMILY_META[family].color,
          background: "#1a1d26",
          color: "#e8eaef",
          whiteSpace: "pre-line",
          fontSize: 11,
          borderRadius: 9,
        },
      });
  }
  const visibleNodeIds = new Set(nodes.map((node) => node.id));
  const edges: Edge[] = shownAssignments.flatMap((person) =>
    person.entitlements
      .filter((id) => id !== "view_reports_only")
      .map((id) => {
        const conflict = conflictKeys.has(`${person.personId}:${id}`);
        return {
          id: `${person.personId}-${id}`,
          source: `person:${person.personId}`,
          target: `duty:${id}`,
          animated: conflict,
          markerEnd: { type: MarkerType.ArrowClosed },
          style: {
            stroke: conflict ? "#f87171" : "#3d9cfd",
            strokeWidth: conflict ? 2.4 : 1,
            opacity: conflict ? 0.95 : 0.3,
          },
        };
      })
      .filter((edge) => visibleNodeIds.has(edge.target)),
  );
  return { nodes, edges };
}
