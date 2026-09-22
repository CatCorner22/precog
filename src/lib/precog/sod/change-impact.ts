import type { EntitlementId } from "./conflict-rules";
import { analyzeDutyCoverage } from "./coverage-analysis";
import { detectSodConflicts, type DetectedConflict, type RoleAssignment } from "./detect";
import type { StaffComposition } from "../types";

export interface AssignmentChangeImpact {
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
  const nextAssignments = assignments.map((item) => item.personId !== personId ? item : ({
    ...item,
    entitlements: active
      ? item.entitlements.filter((id) => id !== entitlement)
      : [...item.entitlements, entitlement],
  }));
  const before = detectSodConflicts(staff, { assignments });
  const after = detectSodConflicts(staff, { assignments: nextAssignments });
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
