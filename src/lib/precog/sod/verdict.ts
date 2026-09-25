import { CONFLICT_RULES, type EntitlementId, entitlementLabel } from "./conflict-rules";
import type { DetectedConflict, RoleAssignment } from "./detect";

/** One person who holds most of the open gaps, and the single move that closes the most of them. */
export interface ConcentrationHeadline {
  personId: string;
  personName: string;
  role: string;
  /** Distinct open gaps this person holds. */
  gaps: number;
  /** Distinct open gaps across the team. */
  totalGaps: number;
  /** The duty whose move to someone else closes the most of this person's gaps. */
  duty: EntitlementId;
  dutyLabel: string;
  /** How many of this person's gaps that move closes. */
  closes: number;
}

/** Lower-cases a label's first word for use mid-sentence, unless it is an acronym ("ACH initiation"). */
export function midSentence(label: string): string {
  return /^[A-Z][a-z]/.test(label) ? label[0].toLowerCase() + label.slice(1) : label;
}

const dutyLabel = entitlementLabel;

/** Open means a finding the owner still has to act on: not owner-held, not accepted. */
function openFindings(conflicts: readonly DetectedConflict[]): DetectedConflict[] {
  return conflicts.filter((c) => !c.ownerHeld && !c.residualRiskAccepted);
}

/**
 * The person who holds at least half of the open gaps (and at least three),
 * with the one duty whose move closes the most of them. Null when no one does:
 * the gaps are spread across the team and each is its own fix.
 */
export function concentrationHeadline(
  conflicts: readonly DetectedConflict[],
): ConcentrationHeadline | null {
  const open = openFindings(conflicts);
  const gapKey = (c: DetectedConflict) =>
    c.severity === "family" ? `family:${c.entitlementA}:${c.entitlementB}` : c.ruleId;
  const totalGaps = new Set(open.map(gapKey)).size;
  const byPerson = new Map<string, DetectedConflict[]>();
  for (const c of open) byPerson.set(c.personId, [...(byPerson.get(c.personId) ?? []), c]);
  let best: ConcentrationHeadline | null = null;
  for (const held of byPerson.values()) {
    const gaps = new Set(held.map(gapKey)).size;
    if (gaps < 3 || gaps * 2 < totalGaps) continue;
    const perDuty = new Map<EntitlementId, Set<string>>();
    for (const c of held) {
      for (const duty of [c.entitlementA, c.entitlementB]) {
        perDuty.set(duty, (perDuty.get(duty) ?? new Set()).add(gapKey(c)));
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
        dutyLabel: dutyLabel(duty),
        closes: closed.size,
      };
    }
  }
  return best;
}

/** A named rule whose two duties are both held on the team, by different people. */
export interface SeparatedPair {
  ruleId: string;
  title: string;
}

/**
 * The rules the team gets right: both duties are held by someone, and no one
 * holds both (no finding of any kind for the rule, owner-held included). The
 * owner reads what is working as well as what is not.
 */
export function separatedPairs(
  conflicts: readonly DetectedConflict[],
  assignments: readonly RoleAssignment[],
): SeparatedPair[] {
  const flagged = new Set(conflicts.map((c) => c.ruleId));
  const held = (duty: EntitlementId) => assignments.some((a) => a.entitlements.includes(duty));
  return CONFLICT_RULES.filter((r) => !flagged.has(r.id) && held(r.a) && held(r.b)).map((r) => ({
    ruleId: r.id,
    title: r.title,
  }));
}
