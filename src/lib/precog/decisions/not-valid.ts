import type { IndustryId } from "../industry";
import {
  DISPOSITION_REASON_LABEL,
  type DecisionDisposition,
  type DecisionKind,
} from "../practice-profile";
import { CONFLICT_RULES } from "../sod/conflict-rules";
import type { DetectedConflict } from "../sod/detect";
import { openFindings } from "../sod/open-findings";
import { decidedOn, isNotValid, type DecidedEntry, type DecidedFinding } from "./decided-on";
import { linkedToIndustry } from "./follow-through";

/** Every kind of decision: any of them answers a finding for "No decision yet". */
const ANY_KIND: ReadonlySet<DecisionKind> = new Set<DecisionKind>([
  "accept_residual",
  "remediate",
  "monitor",
  "insure",
]);

/** The parts of a logged entry the not-valid rule reads. */
export type NotValidEntry = DecidedEntry;

/**
 * The newest entry judging this finding not valid: linked to its rule or
 * control under this industry. Null when nobody judged it.
 */
export function notValidEntryFor<T extends NotValidEntry>(
  finding: DecidedFinding,
  decisions: readonly T[],
  industry: IndustryId,
): (T & { disposition: DecisionDisposition }) | null {
  let newest: (T & { disposition: DecisionDisposition }) | null = null;
  for (const d of decisions) {
    if (!isNotValid(d) || !d.disposition || !d.linkedId || !linkedToIndustry(d, industry)) {
      continue;
    }
    if (d.linkedId !== finding.ruleId && d.linkedId !== finding.linkedControlId) continue;
    const entry = d as T & { disposition: DecisionDisposition };
    if (!newest || entry.disposition.at > newest.disposition.at) newest = entry;
  }
  return newest;
}

/**
 * Whether a "Not valid" judgement on a finding of this severity counts.
 * One person may not set aside a critical finding on their own (decision
 * 19): until a second person confirms it, a critical finding judged not
 * valid reads "Awaiting a second person" and counts as undecided.
 */
export function notValidCounts(severity: DetectedConflict["severity"]): boolean {
  return severity !== "critical";
}

/** The severity of the named rule an entry links to, or null for a family or unknown rule. */
export function ruleSeverity(ruleId: string | undefined): DetectedConflict["severity"] | null {
  if (!ruleId) return null;
  return CONFLICT_RULES.find((r) => r.id === ruleId)?.severity ?? null;
}

/** The reason a finding was judged not valid, in words: the owner's own note for "Other". */
export function notValidReasonText(disposition: DecisionDisposition): string {
  return disposition.reason === "other" && disposition.note
    ? disposition.note
    : DISPOSITION_REASON_LABEL[disposition.reason];
}

/**
 * Open findings with no logged decision: the "No decision yet" tile. A
 * finding is answered by a decision of any kind logged against its rule or
 * control (the shared `decidedOn`), by an accepted residual risk on its
 * control, or by a "Not valid" judgement that counts (`notValidCounts`).
 */
export function findingsWithoutDecision<
  T extends DecidedFinding &
    Pick<
      DetectedConflict,
      "ownerHeld" | "dualReleaseMitigated" | "residualRiskAccepted" | "severity"
    >,
>(
  conflicts: readonly T[],
  partial: ReadonlyMap<string, number>,
  decisions: readonly NotValidEntry[],
  industry: IndustryId,
): T[] {
  return openFindings(conflicts, partial).filter(
    (c) =>
      !c.residualRiskAccepted &&
      !decidedOn(c, ANY_KIND, decisions, industry) &&
      !(notValidCounts(c.severity) && notValidEntryFor(c, decisions, industry)),
  );
}

/** What a duty-conflict card says was logged against it, from the newest linked entry. */
export type CardDecision<T> =
  | { type: "decision"; entry: T }
  | { type: "not_valid"; entry: T & { disposition: DecisionDisposition } };

/**
 * The newest entry logged against this finding's rule or control under this
 * industry: a decision, or a "Not valid" judgement. Null when none is.
 */
export function cardDecision<T extends NotValidEntry & { createdAt: string }>(
  finding: DecidedFinding,
  decisions: readonly T[],
  industry: IndustryId,
): CardDecision<T> | null {
  let newest: T | null = null;
  for (const d of decisions) {
    if (!d.linkedId || !linkedToIndustry(d, industry)) continue;
    if (d.linkedId !== finding.ruleId && d.linkedId !== finding.linkedControlId) continue;
    if (!newest || d.createdAt > newest.createdAt) newest = d;
  }
  if (!newest) return null;
  return isNotValid(newest) && newest.disposition
    ? { type: "not_valid", entry: newest as T & { disposition: DecisionDisposition } }
    : { type: "decision", entry: newest };
}
