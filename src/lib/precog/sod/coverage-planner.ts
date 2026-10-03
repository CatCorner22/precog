/**
 * Backups for high-risk duties only one person holds, chosen so no backup
 * picks up a duty conflict.
 *
 * How the planner avoids re-scanning the whole team: the conflict scan works
 * one person at a time, from that person's own duties and whether that person
 * is the team's sole owner (the one fact a scan reads from the rest of the
 * team), so granting or revoking a duty changes only that person's conflicts.
 * The question the planner asks ("would this grant create a conflict?") is
 * therefore answered by scanning that one person, not the team, and each scan
 * is kept by duty list: most of a team shares a handful of duty lists (every
 * server holds the same ones). Before scanning at all, the rulebook's pair
 * matrix is read: a duty that pairs safely with every duty the person holds
 * can neither create a conflict nor crowd one out.
 *
 * The answers are the same as comparing whole-team scans before and after the
 * change, which is what the test oracle `evaluateAssignmentChange`
 * (src/test/change-impact.ts) does; coverage-planner.test.ts checks both ways
 * side by side.
 */
import { withEntitlement, type RoleAssignment } from "./assignments";
import { entitlementById, isOperatingDuty, type EntitlementId } from "./conflict-rules";
import { analyzeDutyCoverage, type DutyCoverage } from "./coverage-analysis";
import { detectAssignments } from "./detect";
import { teamOwnerId } from "./owner-role";
import { canonicalPair, sodMatrix } from "./rule-match";

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
  /** High-risk duties still held by one person after the program. */
  unresolvedGaps: number;
}

/**
 * Suggest backups for high-risk duties only one person holds: up to three per
 * duty, from people in that duty's process, none adding a detected conflict.
 * A duty nobody holds is not handed to anyone: the business may not do it at
 * all, so it is a question for the owner, not a suggestion. The line of
 * business says whether the team has an owner at all (a nonprofit has none).
 */
export function buildCoveragePlans(
  assignments: RoleAssignment[],
  industry: string | undefined,
): CoveragePlan[] {
  const coverage = analyzeDutyCoverage(assignments);
  return coverage.singlePoints.flatMap((duty) =>
    plansForDuty(assignments, duty, coverage.resilienceScore, PLANS_PER_DUTY, industry),
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
  industry: string | undefined,
): CoverageProgram {
  const startingScore = analyzeDutyCoverage(assignments).resilienceScore;
  let current = assignments;
  const steps: CoveragePlan[] = [];
  const assignmentsPerDuty = new Map<EntitlementId, number>();

  for (let index = 0; index < MAX_PROGRAM_STEPS; index++) {
    const coverage = analyzeDutyCoverage(current);
    let next: CoveragePlan | undefined;
    for (const duty of coverage.singlePoints) {
      if ((assignmentsPerDuty.get(duty.entitlementId) ?? 0) >= MAX_ASSIGNMENTS_PER_DUTY) continue;
      [next] = plansForDuty(current, duty, coverage.resilienceScore, 1, industry);
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
    unresolvedGaps: finalCoverage.singlePoints.length,
  };
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
  industry: string | undefined,
): CoveragePlan[] {
  const ownerId = teamOwnerId(assignments, industry);
  const candidates = assignments
    .filter((person) => !person.entitlements.includes(duty.entitlementId))
    .filter((person) => inDutyChain(person, duty.entitlementId, ownerId))
    // Someone who already holds a conflict is the problem, not the backup:
    // more power there adds concentration even when no new pair appears.
    .filter(
      (person) =>
        person.personId === ownerId || personConflictIds(person.entitlements, false).length === 0,
    )
    .sort((a, b) => workload(a) - workload(b) || a.personName.localeCompare(b.personName));
  const plans: CoveragePlan[] = [];
  let gain: number | undefined;
  for (const person of candidates) {
    if (plans.length >= limit) break;
    if (createsConflict(person, duty.entitlementId, ownerId)) continue;
    const nextAssignments = withEntitlement(assignments, person.personId, duty.entitlementId, true);
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
 * Who may be suggested as a backup for a duty: someone who already holds a
 * financially significant duty in a process the duty belongs to (the AP clerk
 * for releasing payments, not a cashier or a stock associate), or the
 * business's sole owner. A suggestion that only avoids a detected conflict can
 * still hand a front-line cash handler supplier setup or payment release;
 * staying in the duty's own process keeps suggestions to people who plausibly
 * do that work already.
 */
function inDutyChain(person: RoleAssignment, entitlement: EntitlementId, ownerId: string | null) {
  if (person.personId === ownerId) return true;
  const target = new Set(entitlementById(entitlement)?.processIds ?? []);
  return person.entitlements.some((held) => {
    const duty = entitlementById(held);
    return (
      duty !== undefined &&
      duty.riskWeight >= CHAIN_WEIGHT &&
      duty.processIds.some((processId) => target.has(processId))
    );
  });
}

/** Whether granting `entitlement` would give the person a conflict they do not already have. */
function createsConflict(
  person: RoleAssignment,
  entitlement: EntitlementId,
  ownerId: string | null,
): boolean {
  if (pairsSafely(person.entitlements, entitlement)) return false;
  const soleOwner = person.personId === ownerId;
  const before = new Set(personConflictIds(person.entitlements, soleOwner));
  return personConflictIds([...person.entitlements, entitlement], soleOwner).some(
    (id) => !before.has(id),
  );
}

/**
 * Conflict ids of one person holding `entitlements` in this order (the order
 * the whole-team scan sees), one entry per finding. With the sole owner
 * passed explicitly, the job title does not change the ids, so it is not part
 * of the key.
 */
function personConflictIds(entitlements: EntitlementId[], soleOwner: boolean): string[] {
  const key = `${soleOwner ? 1 : 0}\u0000${entitlements.join(",")}`;
  let ids = scanCache.get(key);
  if (!ids) {
    ids = detectAssignments({
      assignments: [{ personId: "person", personName: "person", role: "person", entitlements }],
      soleOwnerId: soleOwner ? "person" : null,
    }).conflicts.map((conflict) => conflict.id);
    if (scanCache.size >= MAX_CACHED_SCANS) scanCache.clear();
    scanCache.set(key, ids);
  }
  return ids;
}

/** Whether adding `entitlement` meets no flagged pair among the duties already held. */
function pairsSafely(held: readonly EntitlementId[], entitlement: EntitlementId): boolean {
  const flagged = flaggedPairs();
  return !held.some((id) => flagged.has(pairKey(id, entitlement)));
}

/** Unordered duty pairs the rulebook flags, by name or by duty family. The rulebook is fixed. */
function flaggedPairs(): Set<string> {
  flaggedPairCache ??= new Set(
    sodMatrix()
      .filter((cell) => cell.status === "conflict")
      .map((cell) => pairKey(cell.row, cell.col)),
  );
  return flaggedPairCache;
}

function pairKey(a: EntitlementId, b: EntitlementId): string {
  return canonicalPair(a, b).join("|");
}

function workload(person: RoleAssignment): number {
  return person.entitlements.filter(isOperatingDuty).length;
}

let flaggedPairCache: Set<string> | undefined;
const scanCache = new Map<string, string[]>();
const MAX_CACHED_SCANS = 2_000;

/**
 * A duty counts toward the chain only when it is financially significant
 * (weight 4 or 5): ordering and receiving supplies sit in the payables
 * process too, but a kitchen lead who orders is not a backup for releasing
 * payments.
 */
const CHAIN_WEIGHT = 4;
/** Plans kept per duty in `buildCoveragePlans`. */
const PLANS_PER_DUTY = 3;
/** Most steps in one coverage program. */
const MAX_PROGRAM_STEPS = 25;
/** Most times the program hands the same duty to someone new. */
const MAX_ASSIGNMENTS_PER_DUTY = 2;
