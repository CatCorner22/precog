import { evaluateAssignmentChange } from "./change-impact";
import { analyzeDutyCoverage } from "./coverage-analysis";
import type { EntitlementId } from "./conflict-rules";
import type { RoleAssignment } from "./detect";
import type { StaffComposition } from "../types";

export interface CoveragePlan {
  id: string;
  entitlement: EntitlementId;
  dutyLabel: string;
  reason: "unassigned" | "single_point";
  toPersonId: string;
  toPersonName: string;
  toRole: string;
  currentWorkload: number;
  continuityGain: number;
  nextAssignments: RoleAssignment[];
}

export interface CoverageProgram {
  steps: CoveragePlan[];
  nextAssignments: RoleAssignment[];
  startingScore: number;
  projectedScore: number;
  unresolvedGaps: number;
}

/** Recommend conflict-free owners/backups for current continuity weaknesses. */
export function buildCoveragePlans(
  assignments: RoleAssignment[],
  staff?: StaffComposition,
): CoveragePlan[] {
  const coverage = analyzeDutyCoverage(assignments);
  const targets = [...coverage.unassigned, ...coverage.singlePoints];
  return targets.flatMap((duty) => assignments
    .filter((person) => !person.entitlements.includes(duty.entitlementId))
    .map((person) => {
      const impact = evaluateAssignmentChange(assignments, person.personId, duty.entitlementId, staff);
      if (!impact || impact.conflictsCreated.length > 0) return undefined;
      return {
        id: `${duty.entitlementId}:${person.personId}`,
        entitlement: duty.entitlementId,
        dutyLabel: duty.label,
        reason: duty.status === "unassigned" ? "unassigned" as const : "single_point" as const,
        toPersonId: person.personId,
        toPersonName: person.personName,
        toRole: person.role,
        currentWorkload: person.entitlements.filter((id) => id !== "view_reports_only").length,
        continuityGain: impact.continuityChange,
        nextAssignments: impact.nextAssignments,
      };
    })
    .filter((plan): plan is CoveragePlan => Boolean(plan))
    .sort((a, b) => b.continuityGain - a.continuityGain || a.currentWorkload - b.currentWorkload || a.toPersonName.localeCompare(b.toPersonName))
    .slice(0, 3));
}

/** Build a safe sequence, recalculating after every assignment to avoid plan interactions. */
export function buildCoverageProgram(
  assignments: RoleAssignment[],
  staff?: StaffComposition,
): CoverageProgram {
  const startingScore = analyzeDutyCoverage(assignments).resilienceScore;
  let current = assignments;
  const steps: CoveragePlan[] = [];
  const assignmentsPerDuty = new Map<EntitlementId, number>();

  for (let index = 0; index < 25; index++) {
    const plans = buildCoveragePlans(current, staff).filter((plan) => (assignmentsPerDuty.get(plan.entitlement) ?? 0) < 2);
    const next = plans[0];
    if (!next) break;
    steps.push(next);
    assignmentsPerDuty.set(next.entitlement, (assignmentsPerDuty.get(next.entitlement) ?? 0) + 1);
    current = next.nextAssignments;
  }

  const finalCoverage = analyzeDutyCoverage(current);
  return {
    steps,
    nextAssignments: current,
    startingScore,
    projectedScore: finalCoverage.resilienceScore,
    unresolvedGaps: finalCoverage.unassigned.length + finalCoverage.singlePoints.length,
  };
}
