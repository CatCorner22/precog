import type { IndustryId } from "../industry";
import {
  DISPOSITION_REASON_LABEL,
  type DecisionDisposition,
  type DecisionEntry,
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

/**
 * The parts of a logged entry the not-valid rule reads. `linkedPersonId`
 * names the one person a judgement is about; `createdAt` dates a decision
 * logged after it.
 */
export type NotValidEntry = DecidedEntry &
  Partial<Pick<DecisionEntry, "linkedPersonId" | "createdAt">>;

/** The parts of a finding the not-valid rule reads: its rule or control, and who holds it. */
export type NotValidFinding = DecidedFinding & Partial<Pick<DetectedConflict, "personId">>;

/** Whether an entry links to this finding's rule or control under this industry. */
function linksTo(d: NotValidEntry, finding: DecidedFinding, industry: IndustryId): boolean {
  return (
    Boolean(d.linkedId) &&
    linkedToIndustry(d, industry) &&
    (d.linkedId === finding.ruleId || d.linkedId === finding.linkedControlId)
  );
}

/**
 * Whether a judgement is about this finding: it links to the finding's rule
 * or control and, when it names a person, that person holds the finding.
 * Judging one person's finding never sets aside another person's finding on
 * the same rule.
 */
function judges(d: NotValidEntry, finding: NotValidFinding, industry: IndustryId): boolean {
  if (!isNotValid(d) || !d.disposition || !linksTo(d, finding, industry)) return false;
  return !d.linkedPersonId || d.linkedPersonId === finding.personId;
}

/**
 * The judgement standing on this finding: the newest entry judging it not
 * valid (`judges`). A decision logged against the finding after that
 * judgement supersedes it, so the finding no longer counts as not valid.
 * Null when no judgement stands.
 */
export function notValidEntryFor<T extends NotValidEntry>(
  finding: NotValidFinding,
  decisions: readonly T[],
  industry: IndustryId,
): (T & { disposition: DecisionDisposition }) | null {
  let newest: (T & { disposition: DecisionDisposition }) | null = null;
  for (const d of decisions) {
    if (!judges(d, finding, industry)) continue;
    const entry = d as T & { disposition: DecisionDisposition };
    if (!newest || entry.disposition.at > newest.disposition.at) newest = entry;
  }
  if (!newest) return null;
  const judgedAt = newest.disposition.at;
  const superseded = decisions.some(
    (d) =>
      !isNotValid(d) &&
      linksTo(d, finding, industry) &&
      typeof d.createdAt === "string" &&
      d.createdAt > judgedAt,
  );
  return superseded ? null : newest;
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
 * control, or by a standing "Not valid" judgement that counts
 * (`notValidEntryFor`, `notValidCounts`).
 */
export function findingsWithoutDecision<
  T extends NotValidFinding &
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

/**
 * What a duty-conflict card says was logged against it: the newest decision
 * linked to its rule or control, and the "Not valid" judgement standing on it
 * by the same rule the counts read (`notValidEntryFor`). A judgement made
 * after a decision shows beside it; a decision made after a judgement
 * supersedes the judgement, so only the decision shows.
 */
export type CardDecision<T> = {
  decision: T | null;
  notValid: (T & { disposition: DecisionDisposition }) | null;
};

/** What a duty-conflict card shows as logged against this finding under this industry. */
export function cardDecision<T extends NotValidEntry & { createdAt: string }>(
  finding: NotValidFinding,
  decisions: readonly T[],
  industry: IndustryId,
): CardDecision<T> {
  let decision: T | null = null;
  for (const d of decisions) {
    if (isNotValid(d) || !linksTo(d, finding, industry)) continue;
    if (!decision || d.createdAt > decision.createdAt) decision = d;
  }
  return { decision, notValid: notValidEntryFor(finding, decisions, industry) };
}
