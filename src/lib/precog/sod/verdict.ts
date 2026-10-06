import type { RoleAssignment } from "./assignments";
import { CONFLICT_RULES, type EntitlementId, entitlementLabel } from "./conflict-rules";
import type { DetectedConflict } from "./detect";
import { rulesHeldTogether, teamHeldDuties } from "./rule-match";
import { gapKey } from "./score";

/** One person who holds most of the open gaps, and the single move that closes the most of them. */
interface ConcentrationHeadline {
  personId: string;
  personName: string;
  role: string;
  /** Open gaps this person holds, in the unit counted. */
  gaps: number;
  /** Open gaps across the team, in the unit counted. */
  totalGaps: number;
  /** The duty whose move to someone else closes the most of this person's gaps. */
  duty: EntitlementId;
  dutyLabel: string;
  /** How many of this person's gaps that move closes. */
  closes: number;
}

/**
 * What one open gap is when the shares are counted. "gap": a rule held
 * together anywhere on the team, once however many people hold it (Start
 * here's "N of the M open gaps"). "finding": one person's hold of one rule,
 * a row of the report's conflict table, so the share reads against the open
 * duty conflicts the report counts.
 */
export type ConcentrationUnit = "gap" | "finding";

/**
 * The person who holds at least half of the open gaps (and at least three),
 * with the one duty whose move closes the most of them, every figure counted
 * in `unit`. Null when no one does: the gaps are spread across the team and
 * each is its own fix. The person named always holds the largest share.
 *
 * `open` is the open findings as sod/open-findings counts them, so the
 * headline, Start here and the printed report count the same gaps.
 */
export function concentrationHeadline(
  open: readonly DetectedConflict[],
  unit: ConcentrationUnit = "gap",
): ConcentrationHeadline | null {
  const keyOf = unit === "finding" ? (c: DetectedConflict) => c.id : gapKey;
  const totalGaps = new Set(open.map(keyOf)).size;
  const byPerson = new Map<string, DetectedConflict[]>();
  for (const c of open) byPerson.set(c.personId, [...(byPerson.get(c.personId) ?? []), c]);
  let best: ConcentrationHeadline | null = null;
  for (const held of byPerson.values()) {
    const gaps = new Set(held.map(keyOf)).size;
    if (gaps < 3 || gaps * 2 < totalGaps) continue;
    const perDuty = new Map<EntitlementId, Set<string>>();
    for (const c of held) {
      for (const duty of [c.entitlementA, c.entitlementB]) {
        perDuty.set(duty, (perDuty.get(duty) ?? new Set()).add(keyOf(c)));
      }
    }
    // Ties go to the bank reconciliation: moving it to someone independent is
    // the one move that also checks everything the person still holds.
    const [duty, closed] = [...perDuty.entries()].sort(
      (a, b) =>
        b[1].size - a[1].size ||
        Number(b[0] === "bank_reconcile") - Number(a[0] === "bank_reconcile") ||
        a[0].localeCompare(b[0]),
    )[0];
    if (!best || gaps > best.gaps) {
      best = {
        personId: held[0].personId,
        personName: held[0].personName,
        role: held[0].role,
        gaps,
        totalGaps,
        duty,
        dutyLabel: entitlementLabel(duty),
        closes: closed.size,
      };
    }
  }
  return best;
}

/** A named rule whose two duties are both held on the team, by different people. */
interface SeparatedPair {
  ruleId: string;
  title: string;
}

/**
 * The rules the team gets right: both duties are held by someone (counting
 * ACH initiation and check signing as sending money out), and no one holds
 * both, whether or not a finding says so: a pair another finding covers, or
 * an owner's own oversight pair, is still held together.
 * The owner reads what is working as well as what is not.
 */
export function separatedPairs(
  conflicts: readonly DetectedConflict[],
  assignments: readonly RoleAssignment[],
): SeparatedPair[] {
  const together = new Set(conflicts.map((c) => c.ruleId));
  for (const person of assignments) {
    for (const ruleId of rulesHeldTogether(person.entitlements)) together.add(ruleId);
  }
  const held = teamHeldDuties(assignments);
  return CONFLICT_RULES.filter((r) => !together.has(r.id) && held.has(r.a) && held.has(r.b)).map(
    (r) => ({ ruleId: r.id, title: r.title }),
  );
}
