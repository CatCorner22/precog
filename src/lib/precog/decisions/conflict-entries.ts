import { dateAfter } from "../dates";
import {
  DISPOSITION_REASON_LABEL,
  MAX_DISPOSITION_NOTE,
  type DecisionKind,
  type DispositionReason,
} from "../practice-profile";
import type { DecisionInput } from "../profile-actions";
import type { DetectedConflict } from "../sod/detect";

/** The finding a card logs against: its rule, the pair and who holds it. */
export type CardFinding = Pick<DetectedConflict, "ruleId" | "title" | "personName"> &
  Partial<Pick<DetectedConflict, "personId">>;

/**
 * "Log a decision" on a duty-conflict card: the kind, the owner's note and a
 * review date, linked to the finding's rule so every count that reads the
 * shared `decidedOn` sees it. `addDecision` stamps the industry.
 */
export function conflictDecisionEntry(
  c: CardFinding,
  kind: DecisionKind,
  note: string,
  reviewDays: number,
  now = new Date(),
): DecisionInput {
  return {
    subject: `${c.title} (${c.personName})`,
    kind,
    note: note.trim(),
    reviewBy: dateAfter(now, reviewDays),
    linkedTab: "sod",
    linkedId: c.ruleId,
  };
}

/** Whether "Not valid" has what it needs: a reason, and for "Other" a note saying why. */
export function notValidReady(reason: DispositionReason | null, note: string): boolean {
  if (!reason) return false;
  return reason !== "other" || note.trim().length > 0;
}

/**
 * "Not valid" on a duty-conflict card. It is written as an undated "monitor"
 * entry carrying the judgement, so an older copy of Precog shows it as an
 * ordinary "Watch it" entry and it never falls due for review. `by` names the
 * signed-in person who judged it; signed out, the entry names nobody.
 */
export function notValidEntry(
  c: CardFinding,
  reason: DispositionReason,
  note: string,
  by: { userId: string; name: string } | null,
  now = new Date(),
): DecisionInput {
  const said = note.trim().slice(0, MAX_DISPOSITION_NOTE);
  return {
    subject: `Not valid: ${c.title} (${c.personName})`,
    kind: "monitor",
    note: said || DISPOSITION_REASON_LABEL[reason],
    linkedTab: "sod",
    linkedId: c.ruleId,
    // A judgement is about this one person's finding, not every holder of the pair.
    ...(c.personId ? { linkedPersonId: c.personId } : {}),
    disposition: {
      verdict: "not_valid",
      reason,
      ...(said ? { note: said } : {}),
      ...(by ? { by } : {}),
      at: now.toISOString(),
    },
  };
}
