import type { OpenMonthChecks } from "@/lib/precog/firm/reviews";
import { count, verb } from "@/lib/precog/text";

/**
 * One line of the Needs attention menu: how many, what, the tab it opens and,
 * when set, the section of that tab it opens on.
 */
export interface AttentionItem {
  id: string;
  n: number;
  text: string;
  target: string;
  item?: string;
}

interface AttentionCounts {
  overdue: number;
  slipped: number;
  leavers: number;
  /** The Monthly review's months still open, as `openMonthlyChecks` counts them. */
  months: readonly OpenMonthChecks[];
}

export function buildNeedsAttentionItems({
  overdue,
  slipped,
  leavers,
  months,
}: AttentionCounts): AttentionItem[] {
  return [
    {
      id: "overdue",
      n: overdue,
      text: `${count(overdue, "decision")} to review`,
      target: "journal",
    },
    {
      id: "slipped",
      n: slipped,
      text: `${count(slipped, "decision")} undone since you marked ${verb(slipped, "it", "them")} done`,
      target: "journal",
    },
    {
      id: "leavers",
      n: leavers,
      text: `${count(leavers, "person", "people")} who left: check their access`,
      target: "knowledge",
      item: "leaving",
    },
    ...monthlyAttentionItems(months),
  ].filter((item) => item.n > 0);
}

/**
 * The Monthly review's two items: the checks not done (no result yet, or
 * Skipped) and the checks reported as Exception, which are recorded but wait
 * to be resolved, across the months still open (`openMonthlyChecks`). Both
 * open the Monthly review at its checks.
 */
export function monthlyAttentionItems(months: readonly OpenMonthChecks[]): AttentionItem[] {
  const notDone = months.reduce((sum, m) => sum + m.notDone, 0);
  const exceptions = months.reduce((sum, m) => sum + m.exceptions, 0);
  return [
    {
      id: "monthly",
      n: notDone,
      text: `${count(notDone, "Monthly review check")} not done`,
      target: "monthly",
      item: "checks",
    },
    {
      id: "monthly-exceptions",
      n: exceptions,
      text: `${count(exceptions, "Monthly review exception")} to resolve`,
      target: "monthly",
      item: "checks",
    },
  ];
}

export function openNeedsAttentionItem(
  item: AttentionItem,
  onOpen: (target: string, item?: string) => void,
) {
  if (item.item) onOpen(item.target, item.item);
  else onOpen(item.target);
}
