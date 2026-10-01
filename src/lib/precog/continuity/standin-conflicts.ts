import type { DualReleasePolicy } from "../controls/dual-release";
import type { PracticeProfile } from "../practice-profile";
import { procedureDutyConflicts } from "../procedures/duty-conflicts";
import { isWrittenProcedure } from "../procedures/lifecycle";
import type { Procedure } from "../procedures/types";
import type { EntitlementId } from "../sod/conflict-rules";
import type { DetectedConflict } from "../sod/detect";
import type { IndustryTemplate } from "../templates";
import type { StaffComposition } from "../types";
import { firstName } from "../text";

/**
 * The duty conflicts `personId` would newly hold by covering register item
 * `itemId`. Empty when covering it creates none, or when Precog cannot tell:
 * a register item carries no duties of its own, so only the duties its
 * written procedures exercise are read.
 */
export type StandInConflicts = (personId: string, itemId: string) => DetectedConflict[];

/**
 * Checks stand-ins with the engine the procedure editor warns with
 * (procedureDutyConflicts): the duties of every written procedure for the
 * item, granted to the stand-in, compared before and after. Answers are kept
 * per person and item, since the continuity views ask in loops.
 */
export function standInConflictChecker(input: {
  tpl: IndustryTemplate;
  dualRelease: DualReleasePolicy;
  staff?: StaffComposition;
  procedures: readonly Procedure[] | null | undefined;
}): StandInConflicts {
  const dutiesByItem = new Map<string, Set<EntitlementId>>();
  for (const p of input.procedures ?? []) {
    if (p.industry !== input.tpl.id || !isWrittenProcedure(p) || !p.dutyIds?.length) continue;
    for (const id of p.knowledgeIds) {
      const duties = dutiesByItem.get(id) ?? new Set<EntitlementId>();
      for (const duty of p.dutyIds) duties.add(duty);
      dutiesByItem.set(id, duties);
    }
  }
  const seen = new Map<string, DetectedConflict[]>();
  return (personId, itemId) => {
    const duties = dutiesByItem.get(itemId);
    if (!duties) return [];
    const key = `${personId}\u0000${itemId}`;
    let found = seen.get(key);
    if (!found) {
      found = procedureDutyConflicts(
        input.tpl,
        input.dualRelease,
        { dutyIds: [...duties] },
        personId,
        input.staff,
      );
      seen.set(key, found);
    }
    return found;
  };
}

/** The checker for a business's own team, duty settings and procedures. */
export function profileStandInConflicts(
  tpl: IndustryTemplate,
  profile: Pick<PracticeProfile, "dualRelease" | "staff" | "procedures">,
): StandInConflicts {
  return standInConflictChecker({
    tpl,
    dualRelease: profile.dualRelease,
    staff: profile.staff,
    procedures: profile.procedures,
  });
}

/** "Covering this, Cass would both reconcile the bank account and take payment from customers, a duty conflict (…)." */
export function standInConflictNote(name: string, conflicts: readonly DetectedConflict[]): string {
  const c = conflicts[0];
  if (!c) return "";
  return `Covering this, ${firstName(name)} would both ${c.labelA.toLowerCase()} and ${c.labelB.toLowerCase()}, a duty conflict (${c.title.toLowerCase()}).`;
}
