import { entitlementLabel, type EntitlementId } from "@/lib/precog/sod/conflict-rules";
import type { RoleAssignment } from "@/lib/precog/sod/detect";
import type { AccessReconciliation, AccessUserRow, QueueStatus } from "@/lib/precog/firm/reconcile";
import { joinWithAnd } from "@/lib/precog/text";
import { midSentence } from "@/lib/precog/text";

/** The reconciliation with one user row set to `status`; back in the queue, the row forgets its duty. */
export function withUserStatus(
  rec: AccessReconciliation,
  id: string,
  status: QueueStatus,
  assigned?: EntitlementId,
): AccessReconciliation {
  return {
    ...rec,
    users: rec.users.map((row) => {
      if (row.id !== id) return row;
      const { assigned: _previous, ...rest } = row;
      return status === "mapped" && assigned ? { ...rest, status, assigned } : { ...rest, status };
    }),
  };
}

/** The assignments with `duty` added to one person, or null when they are not on the map or already hold it. */
export function grantDuty(
  assignments: readonly RoleAssignment[],
  personId: string,
  duty: EntitlementId,
): RoleAssignment[] | null {
  const person = assignments.find((item) => item.personId === personId);
  if (!person || person.entitlements.includes(duty)) return null;
  return assignments.map((item) =>
    item.personId === personId ? { ...item, entitlements: [...item.entitlements, duty] } : item,
  );
}

/** How a user row differs from the duty map, in duty names rather than ids. */
export function rowDifferences(row: AccessUserRow): string {
  const duties = (ids: readonly EntitlementId[]) => joinWithAnd(ids.map(entitlementLabel));
  return [
    row.leftBusiness ? "Precog has this person as left: remove this login from the books." : "",
    row.personId ? "" : "No one on this team has this name.",
    row.unmatchedTokens.length
      ? `Role words we could not match to a duty: ${row.unmatchedTokens.join(", ")}.`
      : "",
    row.extra.length
      ? `The books let them ${midSentence(duties(row.extra))}, which the Duty map does not show.`
      : "",
    row.missingFromBooks.length
      ? `The Duty map gives them ${midSentence(duties(row.missingFromBooks))}, which this export does not show.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
}
