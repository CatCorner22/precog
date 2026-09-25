import { type EntitlementId, entitlementLabel } from "./conflict-rules";
import type { RoleAssignment } from "./detect";

export interface AssignmentChange {
  id: string;
  personId: string;
  personName: string;
  role: string;
  entitlement?: EntitlementId;
  dutyLabel?: string;
  kind: "person_added" | "person_removed" | "duty_granted" | "duty_revoked";
}

export function diffAssignments(
  baseline: RoleAssignment[],
  current: RoleAssignment[],
): AssignmentChange[] {
  const before = new Map(baseline.map((person) => [person.personId, person]));
  const after = new Map(current.map((person) => [person.personId, person]));
  const changes: AssignmentChange[] = [];

  for (const person of current) {
    const prior = before.get(person.personId);
    if (!prior) {
      changes.push({
        id: `person_added:${person.personId}`,
        personId: person.personId,
        personName: person.personName,
        role: person.role,
        kind: "person_added",
      });
      continue;
    }
    const priorDuties = new Set(prior.entitlements);
    for (const entitlement of person.entitlements) {
      if (!priorDuties.has(entitlement))
        changes.push(makeDutyChange(person, entitlement, "duty_granted"));
    }
    const currentDuties = new Set(person.entitlements);
    for (const entitlement of prior.entitlements) {
      if (!currentDuties.has(entitlement))
        changes.push(makeDutyChange(person, entitlement, "duty_revoked"));
    }
  }
  for (const person of baseline) {
    if (!after.has(person.personId))
      changes.push({
        id: `person_removed:${person.personId}`,
        personId: person.personId,
        personName: person.personName,
        role: person.role,
        kind: "person_removed",
      });
  }
  return changes.sort(
    (a, b) =>
      a.personName.localeCompare(b.personName) ||
      a.kind.localeCompare(b.kind) ||
      (a.dutyLabel ?? "").localeCompare(b.dutyLabel ?? ""),
  );
}

function makeDutyChange(
  person: RoleAssignment,
  entitlement: EntitlementId,
  kind: "duty_granted" | "duty_revoked",
): AssignmentChange {
  return {
    id: `${kind}:${person.personId}:${entitlement}`,
    personId: person.personId,
    personName: person.personName,
    role: person.role,
    entitlement,
    dutyLabel: entitlementLabel(entitlement),
    kind,
  };
}
