import type { RoleAssignment } from "./assignments";
import { SUBSUMED_BY, entitlementLabel, type EntitlementId } from "./conflict-rules";
import type { DetectedConflict } from "./detect";
import { entitlementFamily, familyPair, findRule, rulesHeldTogether } from "./rule-match";

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
 * The move to make, then the best move on what remains.
 * `pairBeatsSingle` is true when this first move is not the best move on its
 * own: the two together close more open conflicts than that best move.
 */
export interface DutySplitPlan {
  first: FeasibleDutySplit;
  next: FeasibleDutySplit | null;
  pairBeatsSingle: boolean;
}

/** Past this many people, the second move is the residual of the best single move. */
const PAIR_TEAM = 40;

/** How many clean first moves the pair search compares. */
const PAIR_MOVES = 12;

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

/** Duties the recipient already holds in the same family as the duty they would take. */
function sameFamilyCount(duties: readonly EntitlementId[], duty: EntitlementId): number {
  const family = entitlementFamily(duty);
  let count = 0;
  for (const held of duties) if (entitlementFamily(held) === family) count += 1;
  return count;
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

interface RankedRecipient {
  person: SplitAssignment;
  extra: number;
  duties: number;
  sameFamily: number;
  index: number;
}

/** Lower opened count, then fewer duties, then fewer in this duty's family, then an earlier name, then an earlier place in `assignments`. */
function recipientBeats(a: RankedRecipient, b: RankedRecipient): boolean {
  if (a.extra !== b.extra) return a.extra < b.extra;
  if (a.duties !== b.duties) return a.duties < b.duties;
  if (a.sameFamily !== b.sameFamily) return a.sameFamily < b.sameFamily;
  const name = a.person.personName.localeCompare(b.person.personName);
  if (name !== 0) return name < 0;
  return a.index < b.index;
}

/**
 * Who can take `duty`, best first. Ranked once per duty: the best person does
 * not depend on who gives the duty up. The giver is skipped afterwards, so a
 * team of 1,000 is one pass over the people, not one pass per person who holds
 * the duty.
 */
function recipientsForDuty(
  assignments: readonly SplitAssignment[],
  duty: EntitlementId,
  teamSize: number | undefined,
): RankedRecipient[] {
  const ranked: RankedRecipient[] = [];
  for (let index = 0; index < assignments.length; index++) {
    const person = assignments[index];
    const named = openedRules(person.entitlements, duty);
    if (!Number.isFinite(named)) continue;
    ranked.push({
      person,
      extra: named + openedFamily(person.entitlements, duty, teamSize),
      duties: person.entitlements.length,
      sameFamily: sameFamilyCount(person.entitlements, duty),
      index,
    });
  }
  ranked.sort((a, b) => (recipientBeats(a, b) ? -1 : recipientBeats(b, a) ? 1 : 0));
  return ranked;
}

function scoreSplits(
  open: readonly DetectedConflict[],
  assignments: readonly SplitAssignment[],
  teamSize?: number,
): FeasibleDutySplit[] {
  const byDuty = new Map<EntitlementId, RankedRecipient[]>();
  const recipients = (duty: EntitlementId) => {
    let ranked = byDuty.get(duty);
    if (!ranked) {
      ranked = recipientsForDuty(assignments, duty, teamSize);
      byDuty.set(duty, ranked);
    }
    return ranked;
  };
  const scored = dutySplits(open).map((split): FeasibleDutySplit => {
    const ranked = recipients(split.duty);
    const first = ranked[0];
    const pick =
      first === undefined
        ? null
        : first.person.personId === split.personId
          ? (ranked[1] ?? null)
          : first;
    const canMove = pick !== null;
    const openedCount = canMove ? pick.extra : split.closed.length;
    const net = split.closed.length - openedCount;
    return {
      ...split,
      recipientId: canMove && net > 0 ? pick.person.personId : null,
      recipientName: canMove && net > 0 ? pick.person.personName : null,
      opened: canMove ? pick.extra : 0,
      net: Math.max(0, net),
    };
  });
  scored.sort((a, b) => compareSplits(open, a, b));
  return scored;
}

/**
 * The one duty move that lowers the open count the most once someone else
 * takes the duty. Ties break toward more critical pairs, then a bank
 * reconciliation, then the person already first in `open`, then a recipient
 * who holds fewer duties in that duty's family. When every recipient would
 * open as many findings as the move closes, `net` is 0 and no recipient is
 * named: the duty cannot move onto this team.
 */
export function chooseDutySplit(
  open: readonly DetectedConflict[],
  assignments: readonly SplitAssignment[],
  teamSize?: number,
): FeasibleDutySplit | null {
  return scoreSplits(open, assignments, teamSize)[0] ?? null;
}

/** The best move on the conflicts `first` leaves open. Null when none lowers the count. */
function followUp(
  open: readonly DetectedConflict[],
  assignments: readonly SplitAssignment[],
  first: FeasibleDutySplit,
  teamSize?: number,
): FeasibleDutySplit | null {
  if (first.opened !== 0 || first.net <= 0) return null;
  const remain = open.filter(
    (conflict) => !first.closed.some((closed) => closed.id === conflict.id),
  );
  if (remain.length === 0) return null;
  const next = chooseDutySplit(remain, assignmentsAfterSplit(assignments, first), teamSize);
  return next && next.net > 0 ? next : null;
}

/**
 * The first move, then the next. On a team of at most 40 people, a clean
 * first move that is weaker on its own is used when that move plus the next
 * one closes more than the best single move. Larger teams keep the best
 * single move and the one move after it. The counts are duty pairs, not a
 * chance of a loss.
 */
export function chooseSplitSequence(
  open: readonly DetectedConflict[],
  assignments: readonly SplitAssignment[],
  teamSize?: number,
): DutySplitPlan | null {
  const ranked = scoreSplits(open, assignments, teamSize);
  const single = ranked[0];
  if (!single) return null;
  const baseNext = followUp(open, assignments, single, teamSize);
  if (assignments.length > PAIR_TEAM) {
    return { first: single, next: baseNext, pairBeatsSingle: false };
  }
  let bestFirst = single;
  let bestNext = baseNext;
  let bestTotal = single.net + (baseNext?.net ?? 0);
  const pool = ranked.filter((split) => split.net > 0 && split.opened === 0).slice(0, PAIR_MOVES);
  for (const candidate of pool) {
    if (candidate === single) continue;
    const next = followUp(open, assignments, candidate, teamSize);
    const total = candidate.net + (next?.net ?? 0);
    if (total > bestTotal) {
      bestFirst = candidate;
      bestNext = next;
      bestTotal = total;
    }
  }
  return {
    first: bestFirst,
    next: bestNext,
    pairBeatsSingle: bestFirst !== single,
  };
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
