/**
 * What else stops when one person is out, beyond the register: the money
 * duties nobody else holds and the processes nobody else owns. "If someone
 * is out" on Who knows what lists these for each ticked person, beside the
 * register items with no one else (absenceImpact). Pure.
 */
import { analyzeAbsenceImpact, type DutyCoverage } from "../sod/coverage-analysis";
import type { RoleAssignment } from "../sod/detect";
import type { IndustryTemplate } from "../templates";
import type { ProcessNode } from "../types";

export interface PersonOutDetail {
  personId: string;
  /** Duties nobody else holds: they stop while this person is out. */
  dutiesStop: DutyCoverage[];
  /** Weighty duties that drop to one remaining holder. */
  dutiesOneHolder: DutyCoverage[];
  /** Processes this person owns with no other active owner. */
  processes: ProcessNode[];
}

/** Duties and processes that stop, or thin out, while this one person is out. */
export function personOutDetail(
  tpl: IndustryTemplate,
  assignments: RoleAssignment[],
  personId: string,
): PersonOutDetail {
  const duties = analyzeAbsenceImpact(assignments, personId);
  const active = new Set(tpl.people.filter((p) => p.active).map((p) => p.id));
  const processes = tpl.processes.filter((p) => {
    const owners = p.ownerPersonIds ?? [];
    return owners.includes(personId) && !owners.some((id) => id !== personId && active.has(id));
  });
  return {
    personId,
    dutiesStop: duties?.newlyUnassigned ?? [],
    dutiesOneHolder: duties?.newlySinglePoint ?? [],
    processes,
  };
}
