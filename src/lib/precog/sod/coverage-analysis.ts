import { ENTITLEMENTS, type EntitlementId } from "./conflict-rules";
import type { RoleAssignment } from "./detect";

export interface DutyCoverage {
  entitlementId: EntitlementId;
  label: string;
  riskWeight: number;
  assignees: Array<{ personId: string; personName: string; role: string }>;
  status: "unassigned" | "single_point" | "covered";
}

export interface CoverageAnalysis {
  duties: DutyCoverage[];
  unassigned: DutyCoverage[];
  singlePoints: DutyCoverage[];
  highRiskConcentration: Array<{
    personId: string;
    personName: string;
    count: number;
    duties: string[];
  }>;
  resilienceScore: number;
}

export interface AbsenceImpact {
  personId: string;
  personName: string;
  newlyUnassigned: DutyCoverage[];
  newlySinglePoint: DutyCoverage[];
  remainingResilienceScore: number;
  scoreChange: number;
}

/**
 * Measures continuity separately from segregation of duties. A conflict-free
 * model can still fail when nobody, or only one person, can perform a critical
 * duty. Read-only reporting is excluded because it is not an operating duty.
 */
export function analyzeDutyCoverage(assignments: RoleAssignment[]): CoverageAnalysis {
  const duties = ENTITLEMENTS.filter((item) => item.id !== "view_reports_only").map(
    (entitlement) => {
      const assignees = assignments
        .filter((person) => person.entitlements.includes(entitlement.id))
        .map(({ personId, personName, role }) => ({ personId, personName, role }));
      return {
        entitlementId: entitlement.id,
        label: entitlement.label,
        riskWeight: entitlement.riskWeight,
        assignees,
        status:
          assignees.length === 0
            ? ("unassigned" as const)
            : assignees.length === 1
              ? ("single_point" as const)
              : ("covered" as const),
      };
    },
  );

  const highRiskConcentration = assignments
    .map((person) => {
      const highRisk = person.entitlements
        .map((id) => ENTITLEMENTS.find((item) => item.id === id))
        .filter((item) => item && item.riskWeight >= 4);
      return {
        personId: person.personId,
        personName: person.personName,
        count: highRisk.length,
        duties: highRisk.map((item) => item!.label),
      };
    })
    .filter((item) => item.count >= 4)
    .sort((a, b) => b.count - a.count || a.personName.localeCompare(b.personName));

  const unassigned = duties.filter((item) => item.status === "unassigned");
  const singlePoints = duties.filter(
    (item) => item.status === "single_point" && item.riskWeight >= 4,
  );
  const maximumPenalty = duties.reduce((sum, item) => sum + item.riskWeight * 2, 0);
  const penalty =
    unassigned.reduce((sum, item) => sum + item.riskWeight * 2, 0) +
    singlePoints.reduce((sum, item) => sum + item.riskWeight, 0);

  return {
    duties,
    unassigned,
    singlePoints,
    highRiskConcentration,
    resilienceScore: Math.max(0, Math.round(100 * (1 - penalty / maximumPenalty))),
  };
}

/** Models a temporary absence without altering the assignment plan. */
export function analyzeAbsenceImpact(
  assignments: RoleAssignment[],
  personId: string,
): AbsenceImpact | undefined {
  const person = assignments.find((item) => item.personId === personId);
  if (!person) return undefined;

  const before = analyzeDutyCoverage(assignments);
  const after = analyzeDutyCoverage(assignments.filter((item) => item.personId !== personId));
  const beforeById = new Map(before.duties.map((item) => [item.entitlementId, item]));
  const newlyUnassigned = after.duties.filter(
    (item) =>
      item.status === "unassigned" && beforeById.get(item.entitlementId)?.status !== "unassigned",
  );
  const newlySinglePoint = after.duties.filter(
    (item) =>
      item.status === "single_point" &&
      beforeById.get(item.entitlementId)?.status === "covered" &&
      item.riskWeight >= 4,
  );

  return {
    personId,
    personName: person.personName,
    newlyUnassigned,
    newlySinglePoint,
    remainingResilienceScore: after.resilienceScore,
    scoreChange: after.resilienceScore - before.resilienceScore,
  };
}
