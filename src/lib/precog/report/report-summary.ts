import type { DecisionEntry } from "../practice-profile";
import type { IndustryId } from "../industry";
import type { DetectedConflict } from "../sod/detect";
import { concentrationHeadline } from "../sod/verdict";
import { isDecisionOpen, linkedKnowledgeId } from "../decisions/follow-through";
import { count, midSentence } from "../text";

/** Where a logged decision stands, as the printed log says it. */
type DecisionStatus = "open" | "closed as done" | "closed as no longer relevant";

/** The newest decisions the printed log shows, each with its status, and how many older ones it leaves out. */
interface DecisionLog {
  shown: { decision: DecisionEntry; status: DecisionStatus }[];
  more: number;
}

/** Continuity steps logged from the register: the open ones (earliest review first) and how the closed ones ended. */
interface ContinuityFollowThrough {
  total: number;
  open: DecisionEntry[];
  done: number;
  dropped: number;
}

/** Figures the executive summary is written from; all come from the report model. */
interface SummaryInput {
  /** The open findings, as sod/open-findings counts them for the rest of the report. */
  openConflicts: readonly DetectedConflict[];
  firstStep: string | null;
  registerReady: boolean;
  coverageIndex: number;
  singlePoints: number;
  mapHealth: { score: number; bandLabel: string } | null;
  topPriority: string | null;
}

/** How many decisions the printed log lists before it says how many it left out. */
const DECISION_LOG_MAX = 10;

/**
 * The footer's limits, written for a reader of the printed report (a lender,
 * insurer or accountant as much as the owner).
 */
export const REPORT_CAVEATS =
  "Precog computes every index here from what the business entered. Loss and detection figures describe prosecuted cases and published studies about other businesses, not this one.";

/**
 * The executive summary: a few plain sentences from the report's own
 * figures, so it reads the same as the sections below it.
 */
export function executiveSummary(input: SummaryInput): string[] {
  const lines: string[] = [];
  const open = input.openConflicts;
  if (open.length === 0) {
    lines.push("No open duty conflicts: no one person holds two conflicting duties.");
  } else {
    const critical = open.filter((c) => c.severity === "critical").length;
    const people = new Set(open.map((c) => c.personId)).size;
    lines.push(
      `${count(open.length, "open duty conflict")}${critical > 0 ? `, ${critical} of them critical,` : ""} held by ${count(people, "person", "people")}.`,
    );
    const headline = concentrationHeadline(open);
    if (headline) {
      lines.push(
        `One person holds ${headline.gaps} of the ${headline.totalGaps} open gaps; moving one duty, ${midSentence(headline.dutyLabel)}, to someone who holds none of the others closes ${headline.closes} of them.`,
      );
    }
  }
  if (input.firstStep) lines.push(`First step: ${midSentence(input.firstStep)}.`);
  lines.push(
    input.registerReady
      ? `${input.coverageIndex}% of the work on the register (weighted by how critical it is) has two or more people who can run it alone; ${count(input.singlePoints, "critical or important item")} ${input.singlePoints === 1 ? "relies" : "rely"} on one person or nobody.`
      : "Precog has not assessed continuity yet: the register of duties and know-how marks nobody.",
  );
  if (input.mapHealth) {
    lines.push(
      `Map health score ${input.mapHealth.score} of 100 (${input.mapHealth.bandLabel.toLowerCase()}).`,
    );
  }
  if (input.topPriority) lines.push(`Highest item on the priority list: ${input.topPriority}.`);
  return lines;
}

/** The newest decisions first (the profile keeps them newest first), each with where it stands. */
export function decisionLog(
  decisions: readonly DecisionEntry[],
  max = DECISION_LOG_MAX,
): DecisionLog {
  return {
    shown: decisions.slice(0, max).map((decision) => ({
      decision,
      status: decisionStatus(decision),
    })),
    more: Math.max(0, decisions.length - max),
  };
}

/** Open, or closed with the outcome of its last review; a close without a "done" review counts as no longer relevant. */
export function decisionStatus(d: DecisionEntry): DecisionStatus {
  if (isDecisionOpen(d)) return "open";
  return d.reviews?.[d.reviews.length - 1]?.outcome === "done"
    ? "closed as done"
    : "closed as no longer relevant";
}

/** Continuity steps (decisions linked to a register item), counted in one pass. */
export function continuityFollowThrough(
  decisions: readonly DecisionEntry[],
  industry: IndustryId,
): ContinuityFollowThrough {
  const result: ContinuityFollowThrough = { total: 0, open: [], done: 0, dropped: 0 };
  for (const d of decisions) {
    if (!linkedKnowledgeId(d, industry)) continue;
    result.total += 1;
    const status = decisionStatus(d);
    if (status === "open") result.open.push(d);
    else if (status === "closed as done") result.done += 1;
    else result.dropped += 1;
  }
  result.open.sort((a, b) => (a.reviewBy ?? "").localeCompare(b.reviewBy ?? ""));
  return result;
}
