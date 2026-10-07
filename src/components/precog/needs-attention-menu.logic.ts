import {
  latestReview,
  monthlyReviewTasks,
  openMonthlyChecks,
  periodMonthName,
  reportPeriod,
  reviewDueText,
  type ReviewRecord,
} from "@/lib/precog/firm/reviews";
import { count, verb } from "@/lib/precog/text";
import type { Person } from "@/lib/precog/types";

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

interface AttentionInput {
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

/** The Monthly review's DOM id for one check of one month, for example "check-2026-09-bank_statement". */
export function checkItemId(period: string, key: string): string {
  return `check-${period}-${key}`;
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

/**
 * The Monthly review's items on `day`:
 * - The checks not done (no result yet, or Skipped) of the month that is due
 *   (`reportPeriod`) only, one item for each person the Monthly review
 *   suggests, for example "4 checks for September, due October 10". Each opens
 *   that person's first check not done.
 * - Each check whose latest result is Exception, in either open month
 *   (`openMonthlyChecks`), as its own item that opens that check.
 */
export function monthlyAttentionItems(
  day: string,
  reviews: readonly ReviewRecord[],
  people: readonly Person[],
  roleDuties: Readonly<Record<string, readonly string[]>> = {},
): AttentionItem[] {
  const due = reportPeriod(day);
  const notDone: AttentionItem[] = [];
  const exceptions: AttentionItem[] = [];
  for (const month of openMonthlyChecks(day, reviews)) {
    const { period } = month;
    const name = periodMonthName(period);
    for (const task of monthlyReviewTasks(day, people, roleDuties, period)) {
      const who = people.some((p) => p.name === task.suggestedOwner) ? task.suggestedOwner : null;
      const result = latestReview(reviews, task.key, period)?.result;
      if (result === "exception") {
        exceptions.push({
          id: `exception-${period}-${task.key}`,
          n: 1,
          text: `Resolve the ${name} exception: ${task.title}`,
          target: "monthly",
          item: checkItemId(period, task.key),
          who,
        });
      } else if (result !== "done" && period === due) {
        const mine = notDone.find((item) => item.who === who);
        if (mine) mine.n += 1;
        else {
          notDone.push({
            id: `monthly-${who ?? ""}`,
            n: 1,
            text: "",
            target: "monthly",
            item: checkItemId(period, task.key),
            who,
          });
        }
      }
    }
  }
  for (const item of notDone) {
    item.text = `${count(item.n, "check")} for ${periodMonthName(due)}, due ${reviewDueText(due)}`;
  }
  return [...notDone, ...exceptions];
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
