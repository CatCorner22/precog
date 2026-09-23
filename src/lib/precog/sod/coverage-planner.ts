import { analyzeDutyCoverage, type DutyCoverage } from "./coverage-analysis";
import type { EntitlementId } from "./conflict-rules";
import { detectSodConflicts, type RoleAssignment } from "./detect";
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

/** Plans kept per duty in `buildCoveragePlans`. */
const PLANS_PER_DUTY = 3;
/** Most steps in one coverage program. */
const MAX_PROGRAM_STEPS = 25;
/** Most times the program hands the same duty to someone new. */
const MAX_ASSIGNMENTS_PER_DUTY = 2;

/*
 * How the planner avoids re-scanning the whole team.
 *
 * The conflict scan works one person at a time, from that person's own duties
 * and role, so granting or revoking a duty changes only that person's
 * conflicts. Every question the planner and the Power map ask ("would this
 * grant create a conflict?", "how many would this toggle create or resolve?")
 * is therefore answered by scanning that one person, not the team, and each
 * scan is kept by role and duty list: most of a team shares a handful of duty
 * lists (every server holds the same ones). Before scanning at all, the
 * rulebook's pair matrix is read: a duty that pairs safely with every duty the
 * person holds can neither create a conflict nor crowd one out.
 *
 * The answers are the same as comparing whole-team scans before and after the
 * change, which is what `evaluateAssignmentChange` does (coverage-planner.test.ts
 * checks both ways side by side).
 */

let flaggedPairCache: Set<string> | undefined;

/** Unordered duty pairs the rulebook flags, by name or by duty family. The rulebook is fixed. */
function flaggedPairs(): Set<string> {
  flaggedPairCache ??= new Set(
    detectSodConflicts(undefined, { assignments: [] })
      .matrix.filter((cell) => cell.status === "conflict")
      .map((cell) => pairKey(cell.row, cell.col)),
  );
  return flaggedPairCache;
}

function pairKey(a: EntitlementId, b: EntitlementId): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Whether adding `entitlement` meets no flagged pair among the duties already held. */
function pairsSafely(held: readonly EntitlementId[], entitlement: EntitlementId): boolean {
  const flagged = flaggedPairs();
  return !held.some((id) => flagged.has(pairKey(id, entitlement)));
}

const MAX_CACHED_SCANS = 2_000;
const scanCache = new Map<string, string[]>();

/**
 * Conflict ids of one person holding `entitlements` in this order (the order
 * the whole-team scan sees), one entry per finding.
 */
function personConflictIds(role: string, entitlements: EntitlementId[]): string[] {
  const key = `${role}\u0000${entitlements.join(",")}`;
  let ids = scanCache.get(key);
  if (!ids) {
    ids = detectSodConflicts(undefined, {
      assignments: [{ personId: "person", personName: "person", role, entitlements }],
    }).conflicts.map((conflict) => conflict.id);
    if (scanCache.size >= MAX_CACHED_SCANS) scanCache.clear();
    scanCache.set(key, ids);
  }
  return ids;
}

/** Whether granting `entitlement` would give the person a conflict they do not already have. */
function createsConflict(person: RoleAssignment, entitlement: EntitlementId): boolean {
  if (pairsSafely(person.entitlements, entitlement)) return false;
  const before = new Set(personConflictIds(person.role, person.entitlements));
  return personConflictIds(person.role, [...person.entitlements, entitlement]).some(
    (id) => !before.has(id),
  );
}

/** How many conflicts one duty toggle creates and resolves for the person. */
export interface DutyToggleEffect {
  created: number;
  resolved: number;
}

/**
 * For one person, what granting or revoking each duty would do to their
 * conflicts: the same counts as `evaluateAssignmentChange`'s conflictsCreated
 * and conflictsResolved, read from scans of that person alone.
 */
export function dutyToggleEffects(
  person: RoleAssignment,
  entitlements: readonly EntitlementId[],
): Map<EntitlementId, DutyToggleEffect> {
  const before = personConflictIds(person.role, person.entitlements);
  const beforeIds = new Set(before);
  const effects = new Map<EntitlementId, DutyToggleEffect>();
  for (const entitlement of entitlements) {
    const held = person.entitlements.includes(entitlement);
    if (!held && pairsSafely(person.entitlements, entitlement)) {
      effects.set(entitlement, { created: 0, resolved: 0 });
      continue;
    }
    const after = personConflictIds(
      person.role,
      held
        ? person.entitlements.filter((id) => id !== entitlement)
        : [...person.entitlements, entitlement],
    );
    const afterIds = new Set(after);
    effects.set(entitlement, {
      created: after.filter((id) => !beforeIds.has(id)).length,
      resolved: before.filter((id) => !afterIds.has(id)).length,
    });
  }
  return effects;
}

function workload(person: RoleAssignment): number {
  return person.entitlements.filter((id) => id !== "view_reports_only").length;
}

function withDuty(
  assignments: RoleAssignment[],
  personId: string,
  entitlement: EntitlementId,
): RoleAssignment[] {
  return assignments.map((item) =>
    item.personId !== personId
      ? item
      : { ...item, entitlements: [...item.entitlements, entitlement] },
  );
}

/**
 * The best conflict-free people to take on one duty, at most `limit` of them.
 *
 * Candidates are everyone who does not hold the duty yet, lightest workload
 * first, then by name. Giving the duty to any one of them moves the
 * continuity score by the same amount (the score counts holders per duty, not
 * who they are; person ids are unique), so this is the order the plans sort
 * into, and the walk stops as soon as it has enough.
 */
function plansForDuty(
  assignments: RoleAssignment[],
  duty: DutyCoverage,
  startingScore: number,
  limit: number,
): CoveragePlan[] {
  const candidates = assignments
    .filter((person) => !person.entitlements.includes(duty.entitlementId))
    .sort((a, b) => workload(a) - workload(b) || a.personName.localeCompare(b.personName));
  const plans: CoveragePlan[] = [];
  let gain: number | undefined;
  for (const person of candidates) {
    if (plans.length >= limit) break;
    if (createsConflict(person, duty.entitlementId)) continue;
    const nextAssignments = withDuty(assignments, person.personId, duty.entitlementId);
    gain ??= analyzeDutyCoverage(nextAssignments).resilienceScore - startingScore;
    plans.push({
      id: `${duty.entitlementId}:${person.personId}`,
      entitlement: duty.entitlementId,
      dutyLabel: duty.label,
      reason: duty.status === "unassigned" ? "unassigned" : "single_point",
      toPersonId: person.personId,
      toPersonName: person.personName,
      toRole: person.role,
      currentWorkload: workload(person),
      continuityGain: gain,
      nextAssignments,
    });
  }
  return plans;
}

/**
 * Recommend conflict-free owners/backups for current continuity weaknesses:
 * up to three per duty nobody holds or only one person holds. `staff` is
 * accepted for callers' sake; it only ever changed conflict scores, never
 * which conflicts exist, so no plan depends on it.
 */
export function buildCoveragePlans(
  assignments: RoleAssignment[],
  _staff?: StaffComposition,
): CoveragePlan[] {
  const coverage = analyzeDutyCoverage(assignments);
  return [...coverage.unassigned, ...coverage.singlePoints].flatMap((duty) =>
    plansForDuty(assignments, duty, coverage.resilienceScore, PLANS_PER_DUTY),
  );
}

/**
 * Build a safe sequence, recalculating after every assignment to avoid plan
 * interactions. Each step takes the best plan for the first duty, in
 * `buildCoveragePlans` order, that has one and has not already been handed
 * out twice.
 */
export function buildCoverageProgram(
  assignments: RoleAssignment[],
  _staff?: StaffComposition,
): CoverageProgram {
  const startingScore = analyzeDutyCoverage(assignments).resilienceScore;
  let current = assignments;
  const steps: CoveragePlan[] = [];
  const assignmentsPerDuty = new Map<EntitlementId, number>();

  for (let index = 0; index < MAX_PROGRAM_STEPS; index++) {
    const coverage = analyzeDutyCoverage(current);
    let next: CoveragePlan | undefined;
    for (const duty of [...coverage.unassigned, ...coverage.singlePoints]) {
      if ((assignmentsPerDuty.get(duty.entitlementId) ?? 0) >= MAX_ASSIGNMENTS_PER_DUTY) continue;
      [next] = plansForDuty(current, duty, coverage.resilienceScore, 1);
      if (next) break;
    }
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
