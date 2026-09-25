import { type DutyFamily, entitlementById } from "./conflict-rules";
import { detectAssignments, OVERSIGHT_DUTIES, type RoleAssignment } from "./detect";
import { teamOwnerId } from "./owner-role";

export interface PersonPowerIndex {
  personId: string;
  personName: string;
  role: string;
  authorityIndex: number;
  riskWeight: number;
  familyCount: number;
  exclusiveDutyCount: number;
  conflictCount: number;
}

/**
 * Rank authority concentration using risk, breadth, exclusivity, and conflicts.
 *
 * A sole owner's signing, approving and reconciling are the oversight the
 * index looks for, not concentration, so they do not count toward the owner's
 * index; what the owner handles or records still does.
 */
export function calculatePowerIndex(assignments: RoleAssignment[]): PersonPowerIndex[] {
  const conflicts = detectAssignments({ assignments }).conflicts;
  const ownerId = teamOwnerId(assignments);
  const raws = new Map<string, number>();
  return assignments
    .map((person) => {
      const duties = person.entitlements
        .filter((id) => person.personId !== ownerId || !OVERSIGHT_DUTIES.has(id))
        .map((id) => entitlementById(id))
        .filter((item) => item && item.id !== "view_reports_only");
      const riskWeight = duties.reduce((sum, duty) => sum + duty!.riskWeight, 0);
      const familyCount = new Set(duties.map((duty) => duty!.family as DutyFamily)).size;
      const exclusiveDutyCount = duties.filter(
        (duty) =>
          assignments.filter((candidate) => candidate.entitlements.includes(duty!.id)).length === 1,
      ).length;
      const conflictCount = conflicts.filter(
        (conflict) => conflict.personId === person.personId,
      ).length;
      // Risk dominates, while cross-family breadth, exclusive powers, and active
      // conflicts identify authority that deserves stronger oversight.
      const raw = riskWeight * 2 + familyCount * 5 + exclusiveDutyCount * 8 + conflictCount * 6;
      raws.set(person.personId, raw);
      return {
        personId: person.personId,
        personName: person.personName,
        role: person.role,
        authorityIndex: Math.min(100, raw),
        riskWeight,
        familyCount,
        exclusiveDutyCount,
        conflictCount,
      };
    })
    .sort(
      // The index shows at most 100; two people at 100 still rank by the full value.
      (a, b) =>
        (raws.get(b.personId) ?? 0) - (raws.get(a.personId) ?? 0) ||
        a.personName.localeCompare(b.personName),
    );
}
