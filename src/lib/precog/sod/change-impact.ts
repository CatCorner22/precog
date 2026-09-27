import type { EntitlementId } from "./conflict-rules";
import { analyzeDutyCoverage } from "./coverage-analysis";
import { withEntitlement, type RoleAssignment } from "./assignments";
import { detectAssignments, type DetectedConflict } from "./detect";
import type { StaffComposition } from "../types";

interface AssignmentChangeImpact {
  action: "assign" | "remove";
  nextAssignments: RoleAssignment[];
  conflictsCreated: DetectedConflict[];
  conflictsResolved: DetectedConflict[];
  sodHealthChange: number;
  continuityChange: number;
}

/** Preview the exact risk effect of one assignment toggle before committing it. */
export function evaluateAssignmentChange(
  assignments: RoleAssignment[],
  personId: string,
  entitlement: EntitlementId,
  staff?: StaffComposition,
): AssignmentChangeImpact | undefined {
  const person = assignments.find((item) => item.personId === personId);
  if (!person) return undefined;
  const active = person.entitlements.includes(entitlement);
  const nextAssignments = withEntitlement(assignments, personId, entitlement, !active);
  const before = detectAssignments({ assignments }, staff);
  const after = detectAssignments({ assignments: nextAssignments }, staff);
  const beforeIds = new Set(before.conflicts.map((item) => item.id));
  const afterIds = new Set(after.conflicts.map((item) => item.id));
  const beforeCoverage = analyzeDutyCoverage(assignments);
  const afterCoverage = analyzeDutyCoverage(nextAssignments);

  return {
    action: active ? "remove" : "assign",
    nextAssignments,
    conflictsCreated: after.conflicts.filter((item) => !beforeIds.has(item.id)),
    conflictsResolved: before.conflicts.filter((item) => !afterIds.has(item.id)),
    sodHealthChange: after.summary.segregationHealth - before.summary.segregationHealth,
    continuityChange: afterCoverage.resilienceScore - beforeCoverage.resilienceScore,
  };
}
