import {
  countedOpenPeriods,
  latestReview,
  monthlyReviewTasks,
  otherProblemItemKey,
  otherProblems,
  periodMonthName,
  reportPeriod,
  reviewDueText,
  type ReviewRecord,
} from "@/lib/precog/firm/reviews";
import { count, verb } from "@/lib/precog/text";
import type { Person } from "@/lib/precog/types";
import { checkItemId } from "./monthly-check-id";

/**
 * One line of the Needs attention menu: how many, what, the tab it opens,
 * when set, the section or check of that tab it opens on, and who it waits
 * on (a team member's name, or null when nobody is named).
 */
export interface AttentionItem {
  id: string;
  n: number;
  text: string;
  target: string;
  item?: string;
  who: string | null;
}

/** One person's items, under their name; "Unassigned" holds the items that name nobody. */
export interface AttentionGroup {
  who: string | null;
  heading: string;
  items: AttentionItem[];
}

/** A decision as the menu counts it: the person it concerns, if any. */
interface DecisionLink {
  linkedPersonId?: string;
}

export interface AttentionInput {
  /** The owner's calendar day, YYYY-MM-DD. */
  day: string;
  /** The team, as the Monthly review suggests a person for each check from it. */
  people: readonly Person[];
  roleDuties?: Readonly<Record<string, readonly string[]>>;
  /** Decisions past their review date. */
  overdue: readonly DecisionLink[];
  /** Decisions undone since they were marked done. */
  slipped: readonly DecisionLink[];
  /** People who left whose access is unchecked. */
  leavers: number;
  /** The Monthly review's results, newest first. */
  reviews: readonly ReviewRecord[];
}

/** The name of the active team member with this id, or null. */
function personName(people: readonly Person[], id: string | undefined): string | null {
  if (!id) return null;
  return people.find((p) => p.id === id && p.active !== false)?.name ?? null;
}

/** Splits decisions by the person each concerns, in the order first seen. */
function byPerson(
  decisions: readonly DecisionLink[],
  people: readonly Person[],
): Map<string | null, number> {
  const out = new Map<string | null, number>();
  for (const decision of decisions) {
    const who = personName(people, decision.linkedPersonId);
    out.set(who, (out.get(who) ?? 0) + 1);
  }
  return out;
}

export function buildNeedsAttentionItems({
  day,
  people,
  roleDuties = {},
  overdue,
  slipped,
  leavers,
  reviews,
}: AttentionInput): AttentionItem[] {
  const decisionItems = (
    decisions: readonly DecisionLink[],
    id: string,
    text: (n: number) => string,
  ): AttentionItem[] =>
    [...byPerson(decisions, people)].map(([who, n]) => ({
      id: `${id}-${who ?? ""}`,
      n,
      text: text(n),
      target: "journal",
      who,
    }));
  return [
    ...monthlyAttentionItems(day, reviews, people, roleDuties),
    ...decisionItems(overdue, "overdue", (n) => `${count(n, "decision")} to review`),
    ...decisionItems(
      slipped,
      "slipped",
      (n) => `${count(n, "decision")} undone since you marked ${verb(n, "it", "them")} done`,
    ),
    {
      id: "leavers",
      n: leavers,
      text: `${count(leavers, "person", "people")} who left: check their access`,
      target: "knowledge",
      item: "leaving",
      who: null,
    },
  ].filter((item) => item.n > 0);
}

/** One monthly check that waits: an Exception to resolve, or a check not done in the month that is due. */
interface WaitingCheck {
  period: string;
  key: string;
  title: string;
  who: string | null;
  exception: boolean;
}

/**
 * The Monthly review's checks that wait on `day`, each read by its latest
 * result once: every check whose latest result is Exception in either open
 * month (`countedOpenPeriods`), and every check not done (no result yet, or
 * Skipped) of the month that is due (`reportPeriod`), and every other
 * problem not yet resolved in either open month. `who` is the person the
 * Monthly review suggests (for another problem, who found it), when they are
 * on the team.
 */
function waitingChecks(
  day: string,
  reviews: readonly ReviewRecord[],
  people: readonly Person[],
  roleDuties: Readonly<Record<string, readonly string[]>>,
): WaitingCheck[] {
  const due = reportPeriod(day);
  const out: WaitingCheck[] = [];
  for (const period of countedOpenPeriods(day)) {
    for (const task of monthlyReviewTasks(day, people, roleDuties, period)) {
      const result = latestReview(reviews, task.key, period)?.result;
      const exception = result === "exception";
      if (!exception && (result === "done" || period !== due)) continue;
      const who = people.some((p) => p.name === task.suggestedOwner) ? task.suggestedOwner : null;
      out.push({ period, key: task.key, title: task.title, who, exception });
    }
    // Another problem is not a check: it never counts as not done, and each
    // one still open waits to be resolved, on whoever found it.
    for (const { problem, resolved } of otherProblems(reviews, period)) {
      if (resolved) continue;
      const finder = problem.ownerName.trim();
      out.push({
        period,
        key: otherProblemItemKey(problem.recordedAt),
        title: `Another problem — ${shortNote(problem.notes)}`,
        who: people.some((p) => p.name === finder) ? finder : null,
        exception: true,
      });
    }
  }
  return out;
}

/** The longest note Needs attention prints of another problem before it cuts it short. */
const NOTE_LENGTH = 80;

function shortNote(notes: string): string {
  const said = notes.trim();
  return said.length > NOTE_LENGTH ? `${said.slice(0, NOTE_LENGTH - 1).trimEnd()}…` : said;
}

/**
 * The Monthly review's items on `day`:
 * - The checks not done (no result yet, or Skipped) of the month that is due
 *   (`reportPeriod`) only, one item for each person the Monthly review
 *   suggests, for example "4 checks for September, due October 10". Each opens
 *   that person's first check not done.
 * - Each check whose latest result is Exception, in either open month
 *   (`countedOpenPeriods`), as its own item that opens that check, and each
 *   other problem not yet resolved, which opens that problem.
 */
export function monthlyAttentionItems(
  day: string,
  reviews: readonly ReviewRecord[],
  people: readonly Person[],
  roleDuties: Readonly<Record<string, readonly string[]>> = {},
): AttentionItem[] {
  const due = reportPeriod(day);
  const notDone = new Map<string | null, { n: number; first: string }>();
  const exceptions: AttentionItem[] = [];
  for (const check of waitingChecks(day, reviews, people, roleDuties)) {
    const item = checkItemId(check.period, check.key);
    if (check.exception) {
      exceptions.push({
        id: `exception-${check.period}-${check.key}`,
        n: 1,
        text: `Resolve the ${periodMonthName(check.period)} exception: ${check.title}`,
        target: "monthly",
        item,
        who: check.who,
      });
    } else {
      const mine = notDone.get(check.who);
      if (mine) mine.n += 1;
      else notDone.set(check.who, { n: 1, first: item });
    }
  }
  const month = periodMonthName(due);
  const dueText = reviewDueText(due);
  return [
    ...[...notDone].map(([who, { n, first }]) => ({
      id: `monthly-${who ?? ""}`,
      n,
      text: `${count(n, "check")} for ${month}, due ${dueText}`,
      target: "monthly",
      item: first,
      who,
    })),
    ...exceptions,
  ];
}

/**
 * The number the Needs attention button shows: every item's count added up,
 * worked out without building the items or their words.
 */
export function needsAttentionTotal({
  day,
  people,
  roleDuties = {},
  overdue,
  slipped,
  leavers,
  reviews,
}: AttentionInput): number {
  return (
    waitingChecks(day, reviews, people, roleDuties).length +
    overdue.length +
    slipped.length +
    Math.max(leavers, 0)
  );
}

/**
 * The items by person: one group for each team member with an item, in team
 * order, then "Unassigned" for the items that name nobody.
 */
export function groupNeedsAttentionItems(
  items: readonly AttentionItem[],
  people: readonly Person[],
): AttentionGroup[] {
  const names = [...new Set(people.map((p) => p.name))];
  const groups: AttentionGroup[] = names
    .map((name) => ({
      who: name,
      heading: name,
      items: items.filter((item) => item.who === name),
    }))
    .filter((group) => group.items.length > 0);
  const rest = items.filter((item) => item.who === null || !names.includes(item.who));
  if (rest.length > 0) groups.push({ who: null, heading: "Unassigned", items: rest });
  return groups;
}

export function openNeedsAttentionItem(
  item: AttentionItem,
  onOpen: (target: string, item?: string) => void,
) {
  if (item.item) onOpen(item.target, item.item);
  else onOpen(item.target);
}
