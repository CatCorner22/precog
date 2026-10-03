import { useWorkspace } from "@/lib/precog/workspace-context";
import { useEffect, useMemo, useState } from "react";
import { buildGraph } from "./power-map-graph";
import { useEdgesState, useNodesState } from "@xyflow/react";
import {
  OPERATING_DUTIES,
  type DutyFamily,
  type EntitlementId,
} from "@/lib/precog/sod/conflict-rules";
import {
  applyAssignmentsToPeople,
  isSimulatedPersonId,
  newSimulatedPersonId,
} from "@/lib/precog/sod/apply-assignments";
import { withEntitlement } from "@/lib/precog/sod/assignments";
import { JOB_CATALOG, jobCatalogEntry, seatDuties } from "@/lib/precog/onboarding/job-catalog";
import {
  buildAssignments,
  detectSodConflicts,
  sodDetectionOptions,
  type RoleAssignment,
} from "@/lib/precog/sod/detect";
import { usePractice, useTemplate } from "@/lib/precog/practice-context";
import { powerGuidance } from "@/lib/precog/sod/power-guidance";
import { analyzeAbsenceImpact, analyzeDutyCoverage } from "@/lib/precog/sod/coverage-analysis";
import {
  createPowerMapFile,
  createResponsibilityMatrixCsv,
  normalizeRoleAssignments,
  readRoleAssignments,
} from "@/lib/precog/sod/model-io";
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
import { downloadText, downloadCsv } from "@/lib/download";
import { localDateKey } from "@/lib/precog/dates";
import { DEFAULT_BUSINESS_ID } from "@/lib/precog/business-id";
import { count } from "@/lib/precog/text";

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
  const baselineKey = `precog.power-map-baseline.v1:${profile.businessId ?? DEFAULT_BUSINESS_ID}`;
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
  const powerIndex = useMemo(() => calculatePowerIndex(assignments, tpl.id), [assignments, tpl.id]);
  const absenceImpact = useMemo(
    () => (absentPersonId ? analyzeAbsenceImpact(assignments, absentPersonId) : undefined),
    [absentPersonId, assignments],
  );
  const selected = shownAssignment(assignments, selectedId);
  // The person on screen, which differs from `selectedId` once that person is
  // gone (an undone hire, an import, a removal).
  const shownId = selected?.personId ?? "";
  const selectedConflicts = useMemo(
    () => report.conflicts.filter((item) => item.personId === shownId),
    [report.conflicts, shownId],
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
    return OPERATING_DUTIES.filter((item) => family === "all" || item.family === family)
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
            OPERATING_DUTIES.map((item) => item.id),
            assignments,
          )
        : new Map<EntitlementId, DutyToggleEffect>(),
    [selected, assignments],
  );

  function toggle(entitlement: EntitlementId) {
    if (selected) toggleForPerson(selected.personId, entitlement);
  }

  function toggleForPerson(personId: string, entitlement: EntitlementId) {
    const person = assignments.find((item) => item.personId === personId);
    if (!person) return;
    setSelectedId(personId);
    const holds = person.entitlements.includes(entitlement);
    commit(withEntitlement(assignments, personId, entitlement, !holds));
  }

  function addSimulationRole() {
    const job = jobCatalogEntry(newJobId);
    if (!job) return;
    const id = newSimulatedPersonId();
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
    // An owner's own team goes back to the baseline; its people carry the
    // duties the owner entered, and a job's usual duties would overwrite them.
    // The sample goes back to its role defaults. A sample's people carry
    // duties of their own once the map writes any change, so the wording
    // cannot promise a baseline the owner accepted: the first one is stored
    // when the map is first opened.
    const ownTeam = tpl.people.some((person) => (person.entitlements?.length ?? 0) > 0);
    if (
      !window.confirm(
        ownTeam
          ? "Put every person's duties back to the ones recorded when you first opened this map (or last accepted them), and remove simulated hires? Changes since then are undone."
          : "Put every person back to the duties their job title implies, and remove simulated hires?",
      )
    ) {
      return;
    }
    if (ownTeam) {
      const accepted = baseline.filter((person) => !isSimulatedPersonId(person.personId));
      commit(accepted);
      setSelectedId(accepted[0]?.personId ?? "");
      setConflictsOnly(false);
      return;
    }
    const defaults = buildAssignments({
      ...tpl,
      people: tpl.people
        .filter((person) => !isSimulatedPersonId(person.id))
        .map((person) => ({ ...person, entitlements: undefined })),
    });
    commit(defaults);
    setSelectedId(defaults[0]?.personId ?? "");
    setConflictsOnly(false);
  }

  function removeSelected() {
    if (!selected || !isSimulatedPersonId(selected.personId)) return;
    commit(assignments.filter((person) => person.personId !== selected.personId));
    setSelectedId(
      assignments.find((person) => !isSimulatedPersonId(person.personId))?.personId ?? "",
    );
  }

  // Counted by the one open rule (sod/open-findings), as every other screen counts it.
  const criticalCount = report.summary.critical;

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
      `precog-duty-map-${localDateKey(new Date())}.json`,
      JSON.stringify(createPowerMapFile(assignments), null, 2),
      "application/json",
    );
  }

  function exportMatrixCsv() {
    downloadCsv(
      `precog-duty-matrix-${localDateKey(new Date())}.csv`,
      createResponsibilityMatrixCsv(assignments),
    );
  }

  function exportGovernanceReport() {
    downloadText(
      `precog-governance-report-${localDateKey(new Date())}.md`,
      createGovernanceReport(assignments, profile.staff, new Date(), profile.industry),
      "text/markdown;charset=utf-8",
    );
  }

  /**
   * Replaces the map with a downloaded map file. The accepted baseline stays,
   * so the change review shows what the file changed until the owner accepts
   * it. Rows the file cannot supply are left out and named.
   */
  async function importModel(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      setImportMessage("That file is larger than a duty assignments file can be (256 KB).");
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      setImportMessage("That file is not a Precog duty assignments file.");
      return;
    }
    const read = readRoleAssignments(parsed);
    if (read.problem || read.assignments.length === 0) {
      setImportMessage(read.problem ?? "No row in that file names a person with a job title.");
      return;
    }
    commit(read.assignments);
    setSelectedId(read.assignments[0].personId);
    const leftOut = read.issues.map((issue) => `row ${issue.row} (${issue.reason})`).join("; ");
    setImportMessage(
      `Imported ${count(read.assignments.length, "person", "people")}. Review the changes, then accept them.${
        leftOut ? ` Left out ${leftOut}.` : ""
      }`,
    );
  }

  return {
    tpl,
    placesOf,
    profile,
    assignments,
    guidanceByDuty,
    selectedId: shownId,
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

/** The largest power-map file an import reads. */
const MAX_IMPORT_BYTES = 256_000;

/**
 * The person the editor shows: the one picked, else the first. The picked id
 * can name someone no longer on the map, and every figure beside the select
 * (conflicts, held duties, the resolution planner) follows this person.
 */
export function shownAssignment(
  assignments: readonly RoleAssignment[],
  selectedId: string,
): RoleAssignment | undefined {
  return assignments.find((item) => item.personId === selectedId) ?? assignments[0];
}
