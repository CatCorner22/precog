import type { RoleAssignment } from "./assignments";
import {
  ENTITLEMENTS,
  OPERATING_DUTIES,
  type EntitlementId,
  entitlementById,
} from "./conflict-rules";

export interface DutyCoverage {
  entitlementId: EntitlementId;
  label: string;
  riskWeight: number;
  assignees: Array<{ personId: string; personName: string; role: string }>;
  status: "unassigned" | "single_point" | "covered";
}

interface CoverageAnalysis {
  duties: DutyCoverage[];
  unassigned: DutyCoverage[];
  singlePoints: DutyCoverage[];
  highRiskConcentration: Array<{
    personId: string;
    personName: string;
    count: number;
    duties: string[];
  }>;
  /**
   * Duties to keep to as few people as possible, with who holds each. They
   * are left out of the index: a second holder is wider access, not cover.
   */
  keepFew: DutyCoverage[];
  resilienceScore: number;
}

interface DutyAbsenceImpact {
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
 * duty. Read-only reporting is excluded because it is not an operating duty,
 * and so are the keep-few duties (KEEP_FEW_DUTIES): the index scores only
 * duties that need a stand-in.
 */
export function analyzeDutyCoverage(
  assignments: RoleAssignment[],
  /**
   * Optional duties to score even when nobody holds them: the ones someone
   * held before an absence, whose work then stops.
   */
  scoreOptional: ReadonlySet<EntitlementId> = new Set(),
): CoverageAnalysis {
  const duties = OPERATING_DUTIES.map((entitlement) => {
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
  });

  const highRiskConcentration = assignments
    .map((person) => {
      const highRisk = person.entitlements
        .map((id) => entitlementById(id))
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

  // An optional control step nobody holds (approving bills, say) is a choice
  // the business made, not a gap: it is left out of the index entirely. A
  // keep-few duty is left out whoever holds it.
  const scored = duties.filter(
    (item) =>
      !KEEP_FEW_DUTIES.has(item.entitlementId) &&
      (item.status !== "unassigned" ||
        !OPTIONAL_DUTIES.has(item.entitlementId) ||
        scoreOptional.has(item.entitlementId)),
  );
  const unassigned = scored.filter((item) => item.status === "unassigned");
  const singlePoints = scored.filter(
    (item) => item.status === "single_point" && item.riskWeight >= 4,
  );
  const maximumPenalty = scored.reduce((sum, item) => sum + item.riskWeight * 2, 0);
  const penalty =
    unassigned.reduce((sum, item) => sum + item.riskWeight * 2, 0) +
    singlePoints.reduce((sum, item) => sum + item.riskWeight, 0);

  return {
    duties,
    unassigned,
    singlePoints,
    highRiskConcentration,
    keepFew: duties.filter(
      (item) => KEEP_FEW_DUTIES.has(item.entitlementId) && item.status !== "unassigned",
    ),
    resilienceScore: Math.max(0, Math.round(100 * (1 - penalty / maximumPenalty))),
  };
}

/** Models a temporary absence without altering the assignment plan. */
export function analyzeAbsenceImpact(
  assignments: RoleAssignment[],
  personId: string,
): DutyAbsenceImpact | undefined {
  const person = assignments.find((item) => item.personId === personId);
  if (!person) return undefined;

  const before = analyzeDutyCoverage(assignments);
  // An optional duty held before the absence still has work that stops.
  const heldOptional = new Set(
    before.duties
      .filter((item) => item.status !== "unassigned" && OPTIONAL_DUTIES.has(item.entitlementId))
      .map((item) => item.entitlementId),
  );
  const after = analyzeDutyCoverage(
    assignments.filter((item) => item.personId !== personId),
    heldOptional,
  );
  const beforeById = new Map(before.duties.map((item) => [item.entitlementId, item]));
  const newlyUnassigned = after.duties.filter(
    (item) =>
      item.status === "unassigned" && beforeById.get(item.entitlementId)?.status !== "unassigned",
  );
  const newlySinglePoint = after.duties.filter(
    (item) =>
      item.status === "single_point" &&
      !KEEP_FEW_DUTIES.has(item.entitlementId) &&
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

/**
 * Duties to keep to as few people as possible: bulk export, granting access,
 * administering the system, backups and reading the access logs. Each one
 * held by more people is more ways in, so stand-in cover never rewards a
 * second holder and never marks one without a holder as a gap. Screens show
 * who holds them instead.
 */
export const KEEP_FEW_DUTIES: ReadonlySet<EntitlementId> = new Set<EntitlementId>([
  "export_bulk_data",
  "manage_user_access",
  "pms_admin_roles",
  "manage_backups",
  "review_audit_logs",
]);

const OPTIONAL_DUTIES: ReadonlySet<EntitlementId> = new Set(
  ENTITLEMENTS.filter((item) => item.optional).map((item) => item.id),
);
