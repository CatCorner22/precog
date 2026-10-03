import { useEffect, useMemo, useState } from "react";
import { useDutyBaseline } from "./use-duty-baseline";
import { buildGraph } from "./power-map-graph";
import { useEdgesState, useNodesState } from "@xyflow/react";
import { OPERATING_DUTIES } from "@/lib/precog/sod/conflict-rules";
import {
  applyAssignmentsToPeople,
  isSimulatedPersonId,
  newSimulatedPersonId,
} from "@/lib/precog/sod/apply-assignments";
import { JOB_CATALOG, jobCatalogEntry, seatDuties } from "@/lib/precog/onboarding/job-catalog";
import {
  buildAssignments,
  detectSodConflicts,
  sodDetectionOptions,
  type RoleAssignment,
} from "@/lib/precog/sod/detect";
import { usePractice, useTemplate } from "@/lib/precog/practice-context";
import { powerGuidance } from "@/lib/precog/sod/power-guidance";
import { analyzeDutyCoverage } from "@/lib/precog/sod/coverage-analysis";
import {
  createPowerMapFile,
  createResponsibilityMatrixCsv,
  readRoleAssignments,
} from "@/lib/precog/sod/model-io";
import { createGovernanceReport } from "@/lib/precog/sod/governance-report";
import { calculatePowerIndex } from "@/lib/precog/sod/power-index";
import { locationsById } from "@/lib/precog/person-location";
import { downloadText, downloadCsv } from "@/lib/download";
import { localDateKey } from "@/lib/precog/dates";
import { count } from "@/lib/precog/text";

export function usePowerMapBuilder() {
  const tpl = useTemplate();
  // Where each person works, when the business has two or more locations.
  const placesOf = useMemo(() => locationsById(tpl.people), [tpl.people]);
  const { profile, setCustomPeople } = usePractice();
  // The map is a view of the people register, which Team edits. A simulated
  // hire, an applied resolution, an import or a reset writes through to the
  // profile, so the conflict list, the matrix and every other screen read the
  // same assignments.
  const assignments = useMemo(() => buildAssignments(tpl), [tpl]);
  const guidanceByDuty = powerGuidance(profile.industry);
  const [selectedId, setSelectedId] = useState(assignments[0]?.personId ?? "");
  const [conflictsOnly, setConflictsOnly] = useState(false);
  // Simulated hires come from the same job catalog the setup grid uses, seated
  // for this line of business; the sample's dental role list suits no one else.
  const [newJobId, setNewJobId] = useState(JOB_CATALOG[0]?.id ?? "");
  const [simulationName, setSimulationName] = useState("");
  const [history, setHistory] = useState<RoleAssignment[][]>([]);
  const [importMessage, setImportMessage] = useState("");
  const [mapView, setMapView] = useState<"graph" | "matrix">("graph");
  // The baseline the owner last accepted under Team, Change review: Reset
  // duties returns an owner's own team to it.
  const { baseline } = useDutyBaseline(assignments, profile.businessId);
  const [processId, setProcessId] = useState("all");

  const report = useMemo(
    () =>
      detectSodConflicts(tpl, profile.staff, {
        ...sodDetectionOptions(tpl, profile.dualRelease),
        assignments,
      }),
    [assignments, profile.dualRelease, profile.staff, tpl],
  );
  const coverage = useMemo(() => analyzeDutyCoverage(assignments), [assignments]);
  const powerIndex = useMemo(() => calculatePowerIndex(assignments, tpl.id), [assignments, tpl.id]);
  const selected = shownAssignment(assignments, selectedId);
  // The person on screen, which differs from `selectedId` once that person is
  // gone (an undone hire, an import, a removal).
  const shownId = selected?.personId ?? "";
  const selectedConflicts = useMemo(
    () => report.conflicts.filter((item) => item.personId === shownId),
    [report.conflicts, shownId],
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

  // The duties the process lens shows, for the control measures below the map.
  const visibleEntitlements = useMemo(
    () =>
      OPERATING_DUTIES.filter((item) => processId === "all" || item.processIds.includes(processId)),
    [processId],
  );

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
   * so Change review under Team shows what the file changed until the owner
   * accepts it. Rows the file cannot supply are left out and named.
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
    coverage,
    powerIndex,
    selected,
    selectedConflicts,
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    visibleEntitlements,
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
