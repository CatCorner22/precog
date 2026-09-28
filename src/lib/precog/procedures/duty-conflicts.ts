import type { DualReleasePolicy } from "../controls/dual-release";
import { buildAssignments, withEntitlement } from "../sod/assignments";
import { detectAssignments, sodDetectionOptions, type DetectedConflict } from "../sod/detect";
import type { IndustryTemplate } from "../templates/types";
import type { StaffComposition } from "../types";
import type { Procedure } from "./types";

/**
 * The duty conflicts `personId` would newly hold if they took over the duties
 * this procedure exercises: for example a backup who already records
 * payments being asked to reconcile the bank. The comparison runs the same
 * engine as Who controls what, before and after granting the duties, so a
 * conflict they already hold is not repeated and one the owner holds (an
 * owner cannot steal from themselves) is not raised.
 */
export function procedureDutyConflicts(
  tpl: IndustryTemplate,
  dualRelease: DualReleasePolicy,
  procedure: Pick<Procedure, "dutyIds">,
  personId: string,
  staff?: StaffComposition,
): DetectedConflict[] {
  const duties = procedure.dutyIds ?? [];
  if (duties.length === 0) return [];
  const assignments = buildAssignments(tpl);
  if (!assignments.some((a) => a.personId === personId)) return [];
  const options = { ...sodDetectionOptions(tpl, dualRelease), industry: tpl.id };
  const before = detectAssignments({ ...options, assignments }, staff);
  const granted = duties.reduce(
    (acc, duty) => withEntitlement(acc, personId, duty, true),
    assignments,
  );
  const after = detectAssignments({ ...options, assignments: granted }, staff);
  const held = new Set(before.conflicts.map((c) => c.id));
  return after.conflicts.filter((c) => c.personId === personId && !c.ownerHeld && !held.has(c.id));
}
