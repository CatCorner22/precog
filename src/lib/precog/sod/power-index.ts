import { ENTITLEMENTS, type DutyFamily } from "./conflict-rules";
import { detectSodConflicts, type RoleAssignment } from "./detect";

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

/** Rank authority concentration using risk, breadth, exclusivity, and conflicts. */
export function calculatePowerIndex(assignments: RoleAssignment[]): PersonPowerIndex[] {
  const conflicts = detectSodConflicts(undefined, { assignments }).conflicts;
  return assignments.map((person) => {
    const duties = person.entitlements
      .map((id) => ENTITLEMENTS.find((item) => item.id === id))
      .filter((item) => item && item.id !== "view_reports_only");
    const riskWeight = duties.reduce((sum, duty) => sum + duty!.riskWeight, 0);
    const familyCount = new Set(duties.map((duty) => duty!.family as DutyFamily)).size;
    const exclusiveDutyCount = duties.filter((duty) => assignments.filter((candidate) => candidate.entitlements.includes(duty!.id)).length === 1).length;
    const conflictCount = conflicts.filter((conflict) => conflict.personId === person.personId).length;
    // Risk dominates, while cross-family breadth, exclusive powers, and active
    // conflicts identify authority that deserves stronger oversight.
    const raw = riskWeight * 2 + familyCount * 5 + exclusiveDutyCount * 8 + conflictCount * 6;
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
  }).sort((a, b) => b.authorityIndex - a.authorityIndex || a.personName.localeCompare(b.personName));
}
