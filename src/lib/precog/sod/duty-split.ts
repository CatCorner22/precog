import type { RoleAssignment } from "./assignments";
import { SUBSUMED_BY, entitlementLabel, type EntitlementId } from "./conflict-rules";
import type { DetectedConflict } from "./detect";
import { familyPair, findRule, rulesHeldTogether } from "./rule-match";

/**
 * One person giving up one duty. `closed` is the open findings that lose a
 * side. This is an exact count of those findings, not a chance of a loss.
 */
export interface DutySplit {
  personId: string;
  personName: string;
  duty: EntitlementId;
  dutyLabel: string;
  closed: DetectedConflict[];
}

/**
 * The same split after asking who can take the duty. `opened` is the named
 * rules, plus family pairs the detector would add, that the recipient would
 * gain. `net` is how many the open count falls by. A recipient is named only
 * when `net` is positive. No probability is computed here.
 */
export interface FeasibleDutySplit extends DutySplit {
  recipientId: string | null;
  recipientName: string | null;
  opened: number;
  net: number;
}

/** The duties a split reads. The rest of a role assignment is ignored. */
export type SplitAssignment = Pick<RoleAssignment, "personId" | "personName" | "entitlements">;

/**
 * Every duty one person can give up, in the order of `open`.
 * A tie keeps that order.
 */
export function dutySplits(open: readonly DetectedConflict[]): DutySplit[] {
  const byPerson = new Map<string, DetectedConflict[]>();
  for (const conflict of open) {
    const held = byPerson.get(conflict.personId);
    if (held) held.push(conflict);
    else byPerson.set(conflict.personId, [conflict]);
  }
  const splits: DutySplit[] = [];
  for (const held of byPerson.values()) {
    const duties = new Map<EntitlementId, DetectedConflict[]>();
    for (const conflict of held) {
      for (const duty of [conflict.entitlementA, conflict.entitlementB]) {
        const closed = duties.get(duty);
        if (closed) closed.push(conflict);
        else duties.set(duty, [conflict]);
      }
    }
    for (const [duty, closed] of duties) {
      splits.push({
        personId: held[0].personId,
        personName: held[0].personName,
        duty,
        dutyLabel: entitlementLabel(duty),
        closed,
      });
    }
  }
  return splits;
}

function criticalCount(split: DutySplit): number {
  return split.closed.filter((conflict) => conflict.severity === "critical").length;
}

/** Named rules left after a covering finding drops the rule it repeats. */
function visibleRules(duties: readonly EntitlementId[]): Set<string> {
  const rules = rulesHeldTogether(duties);
  for (const [under, over] of Object.entries(SUBSUMED_BY)) {
    if (rules.has(under) && rules.has(over)) rules.delete(under);
  }
  return rules;
}

/**
 * Named rules `person` would gain by taking `duty`. Infinite when they
 * already hold it, so they are not a recipient.
 */
export function openedRules(duties: readonly EntitlementId[], duty: EntitlementId): number {
  if (duties.includes(duty)) return Number.POSITIVE_INFINITY;
  const before = visibleRules(duties);
  const after = visibleRules([...duties, duty]);
  let opened = 0;
  for (const id of after) if (!before.has(id)) opened += 1;
  return opened;
}

/**
 * Family pairs the detector would add for this new duty. A team of three or
 * fewer has none. A duty already in a named pair is not a family finding.
 */
function openedFamily(
  duties: readonly EntitlementId[],
  duty: EntitlementId,
  teamSize: number | undefined,
): number {
  if (teamSize !== undefined && teamSize <= 3) return 0;
  const all = [...duties, duty];
  const named = new Set<EntitlementId>();
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      if (findRule(all[i], all[j])) named.add(all[i]).add(all[j]);
    }
  }
  let opened = 0;
  for (const other of duties) {
    if (named.has(duty) || named.has(other) || !familyPair(duty, other)) continue;
    opened += 1;
  }
  return opened;
}

function compareSplits(
  open: readonly DetectedConflict[],
  a: FeasibleDutySplit,
  b: FeasibleDutySplit,
): number {
  return (
    b.net - a.net ||
    b.closed.length - a.closed.length ||
    criticalCount(b) - criticalCount(a) ||
    Number(b.duty === "bank_reconcile") - Number(a.duty === "bank_reconcile") ||
    open.findIndex((conflict) => conflict.personId === a.personId) -
      open.findIndex((conflict) => conflict.personId === b.personId) ||
    a.duty.localeCompare(b.duty) ||
    (a.recipientName ?? "").localeCompare(b.recipientName ?? "")
  );
}

/**
 * The one duty move that lowers the open count the most once someone else
 * takes the duty. Ties break toward more critical pairs, then a bank
 * reconciliation, then the person already first in `open`. When every
 * recipient would open as many findings as the move closes, `net` is 0 and
 * no recipient is named: the duty cannot move onto this team.
 */
export function chooseDutySplit(
  open: readonly DetectedConflict[],
  assignments: readonly SplitAssignment[],
  teamSize?: number,
): FeasibleDutySplit | null {
  const scored = dutySplits(open).map((split): FeasibleDutySplit => {
    let opened = Number.POSITIVE_INFINITY;
    let recipient: SplitAssignment | null = null;
    for (const person of assignments) {
      if (person.personId === split.personId) continue;
      const named = openedRules(person.entitlements, split.duty);
      if (!Number.isFinite(named)) continue;
      const extra = named + openedFamily(person.entitlements, split.duty, teamSize);
      const fewerDuties =
        recipient !== null && person.entitlements.length < recipient.entitlements.length;
      const sameDuties =
        recipient !== null &&
        person.entitlements.length === recipient.entitlements.length &&
        person.personName.localeCompare(recipient.personName) < 0;
      if (extra < opened || (extra === opened && (fewerDuties || sameDuties))) {
        opened = extra;
        recipient = person;
      }
    }
    const canMove = Number.isFinite(opened);
    const openedCount = canMove ? opened : split.closed.length;
    const net = split.closed.length - openedCount;
    return {
      ...split,
      recipientId: canMove && net > 0 ? recipient!.personId : null,
      recipientName: canMove && net > 0 ? recipient!.personName : null,
      opened: canMove ? opened : 0,
      net: Math.max(0, net),
    };
  });
  scored.sort((a, b) => compareSplits(open, a, b));
  return scored[0] ?? null;
}

/** Assignments after the split: the duty leaves one person and, when named, lands on the recipient. */
export function assignmentsAfterSplit(
  assignments: readonly SplitAssignment[],
  split: FeasibleDutySplit,
): SplitAssignment[] {
  return assignments.map((person) => {
    if (person.personId === split.personId) {
      return {
        ...person,
        entitlements: person.entitlements.filter((duty) => duty !== split.duty),
      };
    }
    if (split.recipientId && person.personId === split.recipientId) {
      return { ...person, entitlements: [...person.entitlements, split.duty] };
    }
    return person;
  });
}
