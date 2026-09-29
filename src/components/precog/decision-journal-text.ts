/**
 * Sentences the Decisions log builds from an entry: the "then → now" line
 * under each review due, in the words the rest of the app uses, and the
 * question asked before an entry is deleted.
 */
import { STATUS_LABEL } from "@/lib/precog/continuity/coverage";
import { DOCUMENTATION_LABEL } from "@/lib/precog/continuity/documentation";
import { decisionDelta, type captureDecisionSnapshot } from "@/lib/precog/decisions/follow-through";
import type { DecisionEntry } from "@/lib/precog/practice-profile";
import { count } from "@/lib/precog/text";

/**
 * What changed since the decision was logged. The continuity figure counts
 * the must-do items the register marks "Only one person" or "Nobody can do
 * this alone" (what the snapshot stores), which is not the planner's
 * "Single points" tile, so it is named by those labels instead.
 */
export function reviewDelta(
  d: DecisionEntry,
  current: ReturnType<typeof captureDecisionSnapshot>,
): string {
  const delta = decisionDelta(d, current);
  if (!delta || !d.snapshot) return "No snapshot on record.";
  if (!delta.comparable) {
    return `The scoring model changed since you logged this (v${d.snapshot.scoringVersion} → v${current.scoringVersion}), so Precog cannot compare the figures.`;
  }
  const conflicts = `open duty conflicts ${d.snapshot.sodOpenConflicts} → ${current.sodOpenConflicts} (${change(delta.sodOpen, "lower")})`;
  if (delta.continuity && d.snapshot.continuity && current.continuity) {
    const c = delta.continuity;
    const item = c.itemThen
      ? `${STATUS_LABEL[c.itemThen].toLowerCase()} → ${
          c.itemNow ? STATUS_LABEL[c.itemNow].toLowerCase() : "no longer on the register"
        } · `
      : "";
    const docs =
      c.docsThen && c.docsNow && c.docsThen !== c.docsNow
        ? `${DOCUMENTATION_LABEL[c.docsThen].toLowerCase()} → ${DOCUMENTATION_LABEL[c.docsNow].toLowerCase()} · `
        : "";
    return `${item}${docs}with a stand-in ${d.snapshot.continuity.coverageIndex}% → ${current.continuity.coverageIndex}% (${change(c.coverageIndex, "higher")}) · must-do items marked "${STATUS_LABEL.single}" or "${STATUS_LABEL.uncovered}" ${d.snapshot.continuity.singlePoints} → ${current.continuity.singlePoints} (${change(c.singlePoints, "lower")})`;
  }
  if (delta.subject !== undefined && d.snapshot.subjectResidual !== undefined) {
    return `still exposed ${d.snapshot.subjectResidual} → ${current.subjectResidual} (${change(delta.subject, "lower")}) · ${conflicts}`;
  }
  return `average still exposed ${d.snapshot.averageResidual} → ${current.averageResidual} (${change(delta.average, "lower")}) · ${conflicts}`;
}

/** Asked before an entry leaves the log; one with reviews on record says they go with it. */
export function deleteDecisionPrompt(d: Pick<DecisionEntry, "subject" | "reviews">): string {
  const reviews = d.reviews?.length ?? 0;
  return `Delete "${d.subject}" from the Decisions log?${
    reviews > 0 ? ` Precog also deletes its ${count(reviews, "review")} on record.` : ""
  } This cannot be undone.`;
}

/** "down 7, better", "up 5, worse" or "no change", given which direction is better. */
function change(delta: number, better: "higher" | "lower"): string {
  if (delta === 0) return "no change";
  const improved = better === "higher" ? delta > 0 : delta < 0;
  return `${delta > 0 ? "up" : "down"} ${Math.abs(delta)}, ${improved ? "better" : "worse"}`;
}
