import { useWorkspace } from "@/lib/precog/workspace-context";
import { useEffect, useMemo, useState } from "react";
import { buildGraph } from "./power-map-graph";
import { useEdgesState, useNodesState } from "@xyflow/react";
import { ENTITLEMENTS, type DutyFamily, type EntitlementId } from "@/lib/precog/sod/conflict-rules";
import { applyAssignmentsToPeople } from "@/lib/precog/sod/apply-assignments";
import { JOB_CATALOG, jobCatalogEntry, seatDuties } from "@/lib/precog/onboarding/job-catalog";
import {
  buildAssignments,
  detectSodConflicts,
  sodDetectionOptions,
  type RoleAssignment,
} from "@/lib/precog/sod/detect";
import { usePractice } from "@/lib/precog/practice-context";
import { useTemplate } from "@/lib/precog/use-template";
import { powerGuidance } from "@/lib/precog/sod/power-guidance";
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
  type DutyToggleEffect,
} from "@/lib/precog/sod/coverage-planner";
import { createGovernanceReport } from "@/lib/precog/sod/governance-report";
import { diffAssignments } from "@/lib/precog/sod/assignment-diff";
import { calculatePowerIndex } from "@/lib/precog/sod/power-index";
import { locationsById } from "@/lib/precog/person-location";
import { downloadText } from "@/lib/download";
import { downloadFile } from "./power-map-graph";

export function usePowerMapBuilder() {
  const workspace = useWorkspace();
  const tpl = useTemplate();
  // Where each person works, when the business has two or more locations.
  const placesOf = useMemo(() => locationsById(tpl.people), [tpl.people]);
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
      const stored = workspace.local?.getItem(baselineKey);
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
      if (workspace.local?.getItem(baselineKey) === null) {
        workspace.local?.setItem(baselineKey, JSON.stringify(baseline));
      }
    } catch {
      /* storage unavailable */
    }
  }, [baselineKey, baseline, workspace.local]);

  function acceptBaseline(next: RoleAssignment[]) {
    setBaseline(next);
    try {
      workspace.local?.setItem(baselineKey, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  }

  useEffect(() => {
    // Earlier builds kept a separate sandbox copy of the map in this browser.
    // The profile is the only copy now, so drop the orphaned key.
    try {
      workspace.local?.removeItem(POWER_MAP_STORAGE_KEY);
    } catch {
      /* storage unavailable */
    }
  }, [workspace.local]);

  const report = useMemo(
    () =>
      detectSodConflicts(tpl, profile.staff, {
        ...sodDetectionOptions(tpl, profile.dualRelease),
        assignments,
      }),
    [assignments, profile.dualRelease, profile.staff, tpl],
  );
  const coverage = useMemo(() => analyzeDutyCoverage(assignments), [assignments]);
  const coveragePlans = useMemo(() => buildCoveragePlans(assignments), [assignments]);
  const coverageProgram = useMemo(() => buildCoverageProgram(assignments), [assignments]);
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
    () => buildGraph(assignments, report.conflicts, conflictsOnly, processId, placesOf),
    [assignments, report.conflicts, conflictsOnly, processId, placesOf],
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
    downloadText(
      `precog-power-map-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(createPowerMapFile(assignments), null, 2),
      "application/json",
    );
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

  return {
    tpl,
    placesOf,
    profile,
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
    absentPersonId,
    setAbsentPersonId,
    importMessage,
    mapView,
    setMapView,
    baseline,
    processId,
    setProcessId,
    acceptBaseline,
    report,
    coverage,
    coveragePlans,
    coverageProgram,
    pendingChanges,
    powerIndex,
    absenceImpact,
    selected,
    selectedConflicts,
    conflictEntitlements,
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    visibleEntitlements,
    toggleEffects,
    toggle,
    toggleForPerson,
    addSimulationRole,
    reset,
    removeSelected,
    criticalCount,
    commit,
    undo,
    exportModel,
    exportMatrixCsv,
    exportGovernanceReport,
    importModel,
    setHistory,
  };
}

export type PowerMapBuilderModel = ReturnType<typeof usePowerMapBuilder>;
