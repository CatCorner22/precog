import { MarkerType, type Edge, type Node } from "@xyflow/react";
import { ENTITLEMENTS, type DutyFamily } from "@/lib/precog/sod/conflict-rules";
import type { DetectedConflict, RoleAssignment } from "@/lib/precog/sod/detect";
import { locationText } from "@/lib/precog/person-location";
import { downloadText } from "@/lib/download";

export const FAMILY_META: Record<
  DutyFamily,
  { label: string; color: string; description: string }
> = {
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

export const downloadFile = (content: string, type: string, filename: string) =>
  downloadText(filename, content, type);

/** "Keyholder · Oakridge Mall and Riverside": a job title with where the person works, when that is known. */
export function withPlaces(role: string, places: readonly string[] | undefined): string {
  return places && places.length > 0 ? `${role} · ${locationText(places)}` : role;
}

export function buildGraph(
  assignments: RoleAssignment[],
  conflicts: DetectedConflict[],
  conflictsOnly: boolean,
  processId = "all",
  placesOf: ReadonlyMap<string, string[]> = new Map(),
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
    data: {
      label: [
        person.personName,
        person.role,
        ...(placesOf.has(person.personId)
          ? [locationText(placesOf.get(person.personId) ?? [])]
          : []),
      ].join("\n"),
    },
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
          fontSize: 12,
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
