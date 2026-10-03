import { decidedOn, isNotValid } from "../decisions/decided-on";
import { isDecisionOpen } from "../decisions/follow-through";
import type { IndustryId } from "../industry";
import type { DecisionEntry, DecisionKind, DispositionReason } from "../practice-profile";
import type { DetectedConflict } from "../sod/detect";

/** The decision logged against one duty-conflict finding, as report layout 3 prints it. */
export interface FindingResponse {
  kind: DecisionKind;
  /** Printed only while the decision is open. */
  reviewBy?: string;
}

/** A finding judged not valid, with who judged it and why. */
export interface NotValidFinding {
  /** The `DetectedConflict.id` of the finding. */
  conflictId: string;
  /** A critical finding waits for a second person before it counts as not valid. */
  critical: boolean;
  reason: DispositionReason;
  note?: string;
  /** Absent when the person was not signed in. */
  byName?: string;
  at: string;
}

/**
 * The responses printed beside each finding and the findings judged not
 * valid. Plain JSON, so a locked version stores and prints it as it was.
 */
export interface FindingResponses {
  /** Keyed by `DetectedConflict.id`; a finding with no decision has no entry. */
  byConflict: Record<string, FindingResponse>;
  notValid: NotValidFinding[];
}

export const NO_FINDING_RESPONSES: FindingResponses = { byConflict: {}, notValid: [] };

const ANY_KIND: ReadonlySet<string> = new Set<DecisionKind>([
  "accept_residual",
  "remediate",
  "monitor",
  "insure",
]);

/** The newest of `entries`, by when each was logged. */
function newest(entries: readonly DecisionEntry[]): DecisionEntry | undefined {
  return entries.reduce<DecisionEntry | undefined>(
    (best, d) => (!best || d.createdAt > best.createdAt ? d : best),
    undefined,
  );
}

/**
 * Joins the decision log to the duty-conflict findings by the shared rule in
 * `decided-on.ts`: an entry answers a finding when it links to the finding's
 * rule or control under this industry. Entries judging a finding not valid
 * are split out with `isNotValid`; the same link rule matches them.
 */
export function findingResponses(
  conflicts: readonly DetectedConflict[],
  decisions: readonly DecisionEntry[],
  industry: IndustryId,
): FindingResponses {
  const judged = decisions.filter(isNotValid);
  const byConflict: Record<string, FindingResponse> = {};
  const notValid: NotValidFinding[] = [];
  for (const finding of conflicts) {
    const decision = newest(decisions.filter((d) => decidedOn(finding, ANY_KIND, [d], industry)));
    if (decision) {
      byConflict[finding.id] = {
        kind: decision.kind,
        ...(decision.reviewBy && isDecisionOpen(decision) ? { reviewBy: decision.reviewBy } : {}),
      };
    }
    // decidedOn skips not-valid entries, so match each one with its judgement set aside.
    const verdict = newest(
      judged.filter((d) =>
        decidedOn(finding, ANY_KIND, [{ ...d, disposition: undefined }], industry),
      ),
    )?.disposition;
    if (verdict) {
      notValid.push({
        conflictId: finding.id,
        critical: finding.severity === "critical",
        reason: verdict.reason,
        ...(verdict.note ? { note: verdict.note } : {}),
        ...(verdict.by?.name ? { byName: verdict.by.name } : {}),
        at: verdict.at,
      });
    }
  }
  return { byConflict, notValid };
}
