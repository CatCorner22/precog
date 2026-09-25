import { type EntitlementId, entitlementLabel } from "./conflict-rules";
import { detectSodConflicts, type DetectedConflict, type RoleAssignment } from "./detect";

export interface ResolutionPlan {
  id: string;
  conflictId: string;
  fromPersonId: string;
  fromPersonName: string;
  toPersonId?: string;
  toPersonName?: string;
  entitlement: EntitlementId;
  entitlementLabel: string;
  conflictsResolved: number;
  conflictsCreated: number;
  summary: string;
}

/**
 * Produces safe, deterministic transfer/removal options for a conflict.
 * A transfer is only offered when it creates no new conflicts. The planner
 * never silently edits assignments; callers explicitly apply a proposed plan.
 */
export function buildResolutionPlans(
  assignments: RoleAssignment[],
  conflict: DetectedConflict,
): ResolutionPlan[] {
  const baseline = detectSodConflicts(undefined, { assignments }).conflicts;
  const baselineIds = new Set(baseline.map((item) => item.id));
  const source = assignments.find((item) => item.personId === conflict.personId);
  if (!source) return [];

  const options = [conflict.entitlementA, conflict.entitlementB].flatMap((entitlement) => {
    const without = removeEntitlement(assignments, source.personId, entitlement);
    const removalReport = detectSodConflicts(undefined, { assignments: without }).conflicts;
    const plans: ResolutionPlan[] = [];

    for (const candidate of assignments) {
      if (candidate.personId === source.personId || candidate.entitlements.includes(entitlement))
        continue;
      const transferred = addEntitlement(without, candidate.personId, entitlement);
      const next = detectSodConflicts(undefined, { assignments: transferred }).conflicts;
      const created = next.filter((item) => !baselineIds.has(item.id)).length;
      if (created > 0) continue;
      plans.push(makePlan(conflict, source, entitlement, baseline, next, candidate));
    }

    // A removal is retained as the explicit fallback when no clean transfer is possible.
    plans.push(makePlan(conflict, source, entitlement, baseline, removalReport));
    return plans;
  });

  return options
    .filter((plan) => plan.conflictsResolved > 0)
    .sort(
      (a, b) =>
        Number(Boolean(b.toPersonId)) - Number(Boolean(a.toPersonId)) ||
        b.conflictsResolved - a.conflictsResolved,
    )
    .slice(0, 6);
}

export function applyResolutionPlan(
  assignments: RoleAssignment[],
  plan: ResolutionPlan,
): RoleAssignment[] {
  const without = removeEntitlement(assignments, plan.fromPersonId, plan.entitlement);
  return plan.toPersonId ? addEntitlement(without, plan.toPersonId, plan.entitlement) : without;
}

function makePlan(
  conflict: DetectedConflict,
  source: RoleAssignment,
  entitlement: EntitlementId,
  baseline: DetectedConflict[],
  nextReport: DetectedConflict[],
  candidate?: RoleAssignment,
): ResolutionPlan {
  const label = entitlementLabel(entitlement);
  const nextIds = new Set(nextReport.map((item) => item.id));
  const resolved = baseline.filter((item) => !nextIds.has(item.id)).length;
  return {
    id: `${conflict.id}:${entitlement}:${candidate?.personId ?? "remove"}`,
    conflictId: conflict.id,
    fromPersonId: source.personId,
    fromPersonName: source.personName,
    toPersonId: candidate?.personId,
    toPersonName: candidate?.personName,
    entitlement,
    entitlementLabel: label,
    conflictsResolved: Math.max(1, resolved),
    conflictsCreated: 0,
    summary: candidate
      ? `Transfer ${label} to ${candidate.personName}`
      : `Remove ${label} from ${source.personName}`,
  };
}

function removeEntitlement(
  assignments: RoleAssignment[],
  personId: string,
  entitlement: EntitlementId,
) {
  return assignments.map((person) =>
    person.personId === personId
      ? { ...person, entitlements: person.entitlements.filter((item) => item !== entitlement) }
      : person,
  );
}

function addEntitlement(
  assignments: RoleAssignment[],
  personId: string,
  entitlement: EntitlementId,
) {
  return assignments.map((person) =>
    person.personId === personId
      ? { ...person, entitlements: [...person.entitlements, entitlement] }
      : person,
  );
}
