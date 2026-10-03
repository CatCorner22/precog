import type { IndustryId } from "../industry";
import type { DecisionEntry } from "../practice-profile";
import type { DetectedConflict } from "../sod/detect";
import { linkedToIndustry } from "./follow-through";

/** The parts of a duty-conflict finding a decision is matched against. */
export type DecidedFinding = Pick<DetectedConflict, "ruleId" | "linkedControlId">;

/** The parts of a logged decision the rule reads. */
export type DecidedEntry = Pick<
  DecisionEntry,
  "kind" | "linkedId" | "linkedIndustry" | "disposition"
>;

/** Whether an entry records that its finding was judged not valid, rather than a decision about it. */
export function isNotValid(entry: Pick<DecisionEntry, "disposition">): boolean {
  return entry.disposition?.verdict === "not_valid";
}

/**
 * The one rule for "a decision of one of `kinds` is logged against this
 * finding": the entry links to the finding's rule or control, under this
 * industry. An entry judging the finding not valid is not a decision about
 * it, so it never counts here, whatever its kind. The pilot metrics, the
 * duty-conflict tile and the report all read this rule, so they cannot drift.
 */
export function decidedOn(
  finding: DecidedFinding,
  kinds: ReadonlySet<string>,
  decisions: readonly DecidedEntry[],
  industry: IndustryId,
): boolean {
  return decisions.some(
    (d) =>
      !isNotValid(d) &&
      kinds.has(d.kind) &&
      Boolean(d.linkedId) &&
      linkedToIndustry(d, industry) &&
      (d.linkedId === finding.ruleId || d.linkedId === finding.linkedControlId),
  );
}
