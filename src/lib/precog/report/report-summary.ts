import type { DecisionEntry } from "../practice-profile";
import type { IndustryId } from "../industry";
import type { EntitlementId } from "../sod/conflict-rules";
import type { DetectedConflict } from "../sod/detect";
import type { HandSetFigures } from "../sod/derive-staff";
import { concentrationHeadline } from "../sod/verdict";
import type { OpenConflictHeadline } from "../headline/open-conflicts";
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
  /**
   * The open duty conflicts and their breakdown (headline/open-conflicts):
   * the rows and the count the conflict table prints. The owner's own pairs
   * and the pairs dual release closes at every amount are counted apart,
   * never in the open count.
   */
  conflicts: Pick<
    OpenConflictHeadline,
    "findings" | "open" | "critical" | "ownerHeld" | "closedByDualRelease"
  >;
  firstStep: string | null;
  /** The first step's control id (evidence/controls), when it has one. */
  firstStepId?: string | null;
  registerReady: boolean;
  coverageIndex: number;
  singlePoints: number;
  mapHealth: { score: number; bandLabel: string } | null;
  topPriority: string | null;
}

/** The control (evidence/controls) whose label names "the concentrated role". */
const SPLIT_ONE_DUTY_OUT = "split-one-duty-out";

/**
 * That step, worded for a business where no one person holds half the open
 * conflicts. It names no duty: the bank reconciliation may already sit with
 * someone else, for example an outside bookkeeper.
 */
export const SPLIT_STEP_WITHOUT_NAMED_ROLE =
  "Move one duty of a conflicting pair to someone who holds neither duty";

/** How many decisions the printed log lists before it says how many it left out. */
const DECISION_LOG_MAX = 10;

/**
 * The footer's limits, written for a reader of the printed report (a lender,
 * insurer or accountant as much as the owner).
 */
export const REPORT_CAVEATS =
  "Precog computes every index here from what the business entered. Loss and detection figures describe prosecuted cases and published studies about other businesses, not this one.";

/**
 * The basis block printed on page one and in the footer of every report,
 * live or locked: what the report is not, and where its figures come from.
 */
export const REPORT_BASIS_TITLE = "Basis and limitations";
export const REPORT_BASIS =
  "This report is not an audit, review or attestation engagement under AICPA standards. Precog did not verify system access, bank records or the duties reported; duties are as the business entered them. Scores are indexes computed from those entries. Scenario figures are assumptions, and case figures describe other businesses.";

/**
 * The executive summary: a few plain sentences from the report's own
 * figures, so it reads the same as the sections below it.
 */
export function executiveSummary(input: SummaryInput): string[] {
  const lines: string[] = [];
  let roleNamed = false;
  const { findings, open, critical } = input.conflicts;
  if (open === 0) {
    lines.push(closedConflictsLine(input.conflicts.ownerHeld, input.conflicts.closedByDualRelease));
  } else {
    const people = new Set(findings.map((c) => c.personId)).size;
    lines.push(
      `${count(open, "open duty conflict")}${critical > 0 ? `, ${critical} of them critical,` : ""} held by ${count(people, "person", "people")}.`,
    );
    const move = concentrationMove(findings);
    if (move) {
      roleNamed = true;
      lines.push(
        `One person holds ${move.held} of the ${open} open duty conflicts; moving one duty, ${midSentence(move.dutyLabel)}, to someone who holds none of the others closes ${move.closes} of them.`,
      );
    }
  }
  if (input.firstStep) {
    // The report names the split step for this business (actions/do-next
    // `withNamedSplitStep`). A caller that passes the catalog label, which
    // points at "the concentrated role", gets the unnamed wording whenever
    // the concentration sentence above is absent.
    const step =
      !roleNamed && input.firstStepId === SPLIT_ONE_DUTY_OUT
        ? SPLIT_STEP_WITHOUT_NAMED_ROLE
        : input.firstStep;
    lines.push(`First step: ${midSentence(step)}.`);
  }
  // A figure that is not a number (a damaged register) leaves its sentence
  // out rather than print "NaN%".
  if (!input.registerReady) {
    lines.push(
      "Precog has not assessed continuity yet: the register of duties and know-how marks nobody.",
    );
  } else if (Number.isFinite(input.coverageIndex)) {
    lines.push(
      `${input.coverageIndex}% of the work on the register (weighted by how critical it is) has two or more people who can run it alone; ${count(input.singlePoints, "critical or important item")} ${input.singlePoints === 1 ? "relies" : "rely"} on one person or nobody.`,
    );
  }
  if (input.mapHealth && Number.isFinite(input.mapHealth.score)) {
    lines.push(
      `Map completeness ${input.mapHealth.score}% (${input.mapHealth.bandLabel.toLowerCase()}).`,
    );
  }
  if (input.topPriority) lines.push(`Highest item on the priority list: ${input.topPriority}.`);
  return lines;
}

/** The concentration move, counted in the conflict table's rows. */
interface ConcentrationMove {
  personId: string;
  personName: string;
  duty: EntitlementId;
  dutyLabel: string;
  /** Open conflicts the person holds. */
  held: number;
  /** How many of those moving the duty closes. */
  closes: number;
  /** The conflicts the move closes, in the order of `open`. */
  closed: DetectedConflict[];
  /** The rules of the conflicts the move closes. */
  ruleIds: string[];
}

/**
 * The concentration move (sod/verdict `concentrationHeadline`) counted in the
 * conflict table's rows: how many of the open conflicts the person holds, and
 * how many of those moving the one duty closes. The headline picks the person
 * and the duty in those rows too, so the person named holds the largest
 * share and at least half of the open count the sentence before it prints
 * ("12 of the 20"); with no such person there is no move, never "5 of the 13".
 */
export function concentrationMove(open: readonly DetectedConflict[]): ConcentrationMove | null {
  const headline = concentrationHeadline(open, "finding");
  if (!headline) return null;
  const held = open.filter((c) => c.personId === headline.personId);
  const closed = held.filter(
    (c) => c.entitlementA === headline.duty || c.entitlementB === headline.duty,
  );
  return {
    personId: headline.personId,
    personName: headline.personName,
    duty: headline.duty,
    dutyLabel: headline.dutyLabel,
    held: held.length,
    closes: closed.length,
    closed,
    ruleIds: [...new Set(closed.map((c) => c.ruleId))],
  };
}

/**
 * With no open finding, say only what is true: the owner's own pairs and the
 * pairs dual release closes are left out of the open count, not absent, so
 * the sentence names them.
 */
function closedConflictsLine(ownerHeld: number, dualClosed: number): string {
  if (ownerHeld === 0 && dualClosed === 0) {
    return "No one person other than the owner holds two conflicting duties.";
  }
  let line = "No open duty conflicts among staff.";
  if (ownerHeld > 0) {
    line += ` The owner holds ${count(ownerHeld, "pair")} of conflicting duties (listed under Segregation of duties as the owner's own duties).`;
    if (dualClosed > 0) line += ` Dual release covers ${dualClosed} more.`;
  } else {
    line += ` Dual release covers ${count(dualClosed, "pair")} of conflicting duties at every amount.`;
  }
  return line;
}

/**
 * Lines disclosing a staff figure the owner set by hand, printed beside the
 * KPIs. The priority and residual figures read the hand-set segregation
 * score while duty separation reads the duties, so a reader sees
 * both numbers and which figures follow which.
 */
export function handSetNotes(handSet: HandSetFigures): string[] {
  const lines: string[] = [];
  const score = handSet.segregation;
  if (score) {
    const duties =
      score.fromDuties === null
        ? ""
        : score.fromDuties === score.set
          ? " Your team's duties give the same."
          : ` Your team's duties give ${score.fromDuties}.`;
    lines.push(
      `Segregation score set by hand: ${score.set}.${duties} The priority list and residual risk scores in this report use the score set by hand; duty separation reads the duties.`,
    );
  }
  const bank = handSet.bankRec;
  if (bank) {
    const answer = bank.set
      ? "someone independent reconciles the bank account"
      : "nobody independent reconciles the bank account";
    const duties =
      bank.fromDuties === null
        ? ""
        : bank.fromDuties === bank.set
          ? " Your team's duties show the same."
          : bank.fromDuties
            ? " Your team's duties show someone who reconciles it without handling or recording money."
            : " Your team's duties show nobody who reconciles it without also handling or recording money.";
    lines.push(`Bank reconciliation answer set by hand: ${answer}.${duties}`);
  }
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
