import { withEntitlement, type RoleAssignment } from "./assignments";
import { type EntitlementId, entitlementLabel } from "./conflict-rules";
import { detectAssignments, type DetectedConflict } from "./detect";
import { teamOwnerId } from "./owner-role";

export interface ResolutionPlan {
  id: string;
  conflictId: string;
  fromPersonId: string;
  fromPersonName: string;
  toPersonId?: string;
  toPersonName?: string;
  entitlement: EntitlementId;
  entitlementLabel: string;
  /** Findings on the team today that the plan closes. */
  conflictsResolved: number;
  /** Findings the plan would add; always 0 for a plan that is offered. */
  conflictsCreated: number;
  summary: string;
}

/**
 * Safe, deterministic ways to close one conflict: move one of its two duties
 * to someone else, or take it away. A plan is offered only when it closes at
 * least one finding and creates none, removals included: taking a duty away
 * can unmask a pair another finding had covered. The planner never edits
 * assignments; callers apply a plan explicitly.
 *
 * A duty move changes the findings of the two people it touches and nobody
 * else's (a scan reads one person's duties and whether they are the sole
 * owner), so each option scans those two people, not the whole team. The line
 * of business says whether the team has an owner at all (a nonprofit has none).
 */
export function buildResolutionPlans(
  assignments: RoleAssignment[],
  conflict: DetectedConflict,
  industry: string | undefined,
): ResolutionPlan[] {
  const source = assignments.find((item) => item.personId === conflict.personId);
  if (!source) return [];
  const ownerId = teamOwnerId(assignments, industry);
  const scan = (person: RoleAssignment) =>
    detectAssignments({ assignments: [person], soleOwnerId: ownerId }).conflicts.map((c) => c.id);
  const before = new Map(assignments.map((person) => [person.personId, scan(person)]));

  const options = [conflict.entitlementA, conflict.entitlementB].flatMap((entitlement) => {
    const [without] = withEntitlement([source], source.personId, entitlement, false);
    const sourceEffect = effect(before.get(source.personId) ?? [], scan(without));
    const plans: ResolutionPlan[] = [];
    for (const candidate of assignments) {
      if (candidate.personId === source.personId || candidate.entitlements.includes(entitlement))
        continue;
      const [taking] = withEntitlement([candidate], candidate.personId, entitlement, true);
      const candidateEffect = effect(before.get(candidate.personId) ?? [], scan(taking));
      plans.push(
        makePlan(conflict, source, entitlement, {
          resolved: sourceEffect.resolved + candidateEffect.resolved,
          created: sourceEffect.created + candidateEffect.created,
          candidate,
        }),
      );
    }
    // A removal is the explicit fallback when no clean transfer is possible.
    plans.push(makePlan(conflict, source, entitlement, sourceEffect));
    return plans;
  });

  return options
    .filter((plan) => plan.conflictsResolved > 0 && plan.conflictsCreated === 0)
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
  const without = withEntitlement(assignments, plan.fromPersonId, plan.entitlement, false);
  return plan.toPersonId
    ? withEntitlement(without, plan.toPersonId, plan.entitlement, true)
    : without;
}

/** How one person's findings change: how many of today's go, how many new ones appear. */
function effect(
  before: readonly string[],
  after: readonly string[],
): { resolved: number; created: number } {
  const beforeIds = new Set(before);
  const afterIds = new Set(after);
  return {
    resolved: before.filter((id) => !afterIds.has(id)).length,
    created: after.filter((id) => !beforeIds.has(id)).length,
  };
}

function makePlan(
  conflict: DetectedConflict,
  source: RoleAssignment,
  entitlement: EntitlementId,
  outcome: { resolved: number; created: number; candidate?: RoleAssignment },
): ResolutionPlan {
  const label = entitlementLabel(entitlement);
  const { candidate } = outcome;
  return {
    id: `${conflict.id}:${entitlement}:${candidate?.personId ?? "remove"}`,
    conflictId: conflict.id,
    fromPersonId: source.personId,
    fromPersonName: source.personName,
    toPersonId: candidate?.personId,
    toPersonName: candidate?.personName,
    entitlement,
    entitlementLabel: label,
    conflictsResolved: outcome.resolved,
    conflictsCreated: outcome.created,
    summary: candidate
      ? `Transfer ${label} to ${candidate.personName}`
      : `Remove ${label} from ${source.personName}`,
  };
}
