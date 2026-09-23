import type { Person } from "../types";
import type { RoleAssignment } from "./detect";

/** The same duties, in any order; "view reports only" is not a duty that changes anything. */
function sameDuties(a: readonly string[] | undefined, b: readonly string[]): boolean {
  const held = (list: readonly string[]) =>
    new Set(list.filter((duty) => duty !== "view_reports_only"));
  const left = held(a ?? []);
  const right = held(b);
  return left.size === right.size && [...left].every((duty) => right.has(duty));
}

/** Simulated hires the power map adds carry this id prefix; they are the only people it may remove. */
export const SIMULATED_PERSON_PREFIX = "sim-";

/**
 * Writes a power-map assignment list back onto the people register, so the
 * map and every other duty-conflict view read one model.
 *
 *   - A person with an assignment takes its name, role, and duties; once
 *     the duties differ from theirs, they are no longer the job title's guess.
 *   - An assignment for an unknown id becomes a new active person (a
 *     simulated hire or an imported file's addition).
 *   - A simulated person with no assignment is dropped.
 *   - A real person with no assignment is kept unchanged: an edit or an
 *     imported file never silently deletes someone from the business.
 *   - People marked as left are kept as they are; the map does not show them.
 */
export function applyAssignmentsToPeople(
  people: readonly Person[],
  assignments: readonly RoleAssignment[],
): Person[] {
  const byId = new Map(assignments.map((a) => [a.personId, a]));
  const known = new Set(people.map((p) => p.id));
  const next: Person[] = [];
  for (const person of people) {
    const assignment = byId.get(person.id);
    if (assignment) {
      const updated: Person = {
        ...person,
        name: assignment.personName.trim() || person.name,
        role: assignment.role.trim() || person.role,
        entitlements: [...assignment.entitlements],
      };
      // Duties the owner changed on the map are theirs, not the job title's guess.
      if (person.dutiesFromTitle && !sameDuties(person.entitlements, assignment.entitlements)) {
        delete updated.dutiesFromTitle;
      }
      next.push(updated);
    } else if (person.active && person.id.startsWith(SIMULATED_PERSON_PREFIX)) {
      continue;
    } else {
      next.push(person);
    }
  }
  for (const assignment of assignments) {
    if (known.has(assignment.personId)) continue;
    next.push({
      id: assignment.personId,
      name: assignment.personName.trim() || `Proposed ${assignment.role}`,
      role: assignment.role,
      active: true,
      entitlements: [...assignment.entitlements],
      ...(typeof assignment.owner === "boolean" ? { owner: assignment.owner } : {}),
    });
  }
  return next;
}
