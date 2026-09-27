import { MarkerType, type Edge, type Node } from "@xyflow/react";
import {
  OPERATING_DUTIES,
  isOperatingDuty,
  type DutyFamily,
  type EntitlementId,
} from "@/lib/precog/sod/conflict-rules";
import { FAMILY_META } from "@/lib/precog/sod/duty-families";
import type { DetectedConflict, RoleAssignment } from "@/lib/precog/sod/detect";
import { joinWithAnd } from "@/lib/precog/text";

/** The part of the map a view shows: its people and duties, and which of them sit in a conflict. */
interface MapSlice {
  shownPeople: RoleAssignment[];
  shownDuties: typeof OPERATING_DUTIES;
  /** "personId:duty" for every duty a person holds inside a conflict. */
  conflictKeys: Set<string>;
  conflictedPeople: Set<string>;
}

/**
 * The people and duties the graph and the matrix both show: everyone and
 * every duty, or with `conflictsOnly` only those in a conflict, narrowed to
 * one process when `processId` is set.
 */
export function mapSlice(
  assignments: RoleAssignment[],
  conflicts: DetectedConflict[],
  conflictsOnly: boolean,
  processId = "all",
): MapSlice {
  const conflictKeys = new Set(
    conflicts.flatMap((item) => [
      `${item.personId}:${item.entitlementA}`,
      `${item.personId}:${item.entitlementB}`,
    ]),
  );
  const conflictedDuties = new Set<EntitlementId>(
    conflicts.flatMap((item) => [item.entitlementA, item.entitlementB]),
  );
  const conflictedPeople = new Set(conflicts.map((item) => item.personId));
  return {
    shownPeople: conflictsOnly
      ? assignments.filter((person) => conflictedPeople.has(person.personId))
      : assignments,
    shownDuties: OPERATING_DUTIES.filter(
      (item) =>
        (!conflictsOnly || conflictedDuties.has(item.id)) &&
        (processId === "all" || item.processIds.includes(processId)),
    ),
    conflictKeys,
    conflictedPeople,
  };
}

export function buildGraph(
  assignments: RoleAssignment[],
  conflicts: DetectedConflict[],
  conflictsOnly: boolean,
  processId = "all",
  placesOf: ReadonlyMap<string, string[]> = new Map(),
): { nodes: Node[]; edges: Edge[] } {
  const { shownPeople, shownDuties, conflictKeys, conflictedPeople } = mapSlice(
    assignments,
    conflicts,
    conflictsOnly,
    processId,
  );
  const families = Object.keys(FAMILY_META) as DutyFamily[];
  const nodes: Node[] = shownPeople.map((person, index) => ({
    id: `person:${person.personId}`,
    position: { x: 10, y: 80 + index * 110 },
    data: {
      label: [
        person.personName,
        person.role,
        ...(placesOf.has(person.personId)
          ? [joinWithAnd(placesOf.get(person.personId) ?? [])]
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
          label: `${entitlement.label}\n${FAMILY_META[family].label} · weight ${entitlement.riskWeight} of 5`,
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
  const edges: Edge[] = shownPeople.flatMap((person) =>
    person.entitlements
      .filter(isOperatingDuty)
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
