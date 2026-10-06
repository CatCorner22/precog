import type { OpenMonthChecks } from "@/lib/precog/firm/reviews";
import { count } from "@/lib/precog/text";

/** One line of the Needs attention menu: how many, what, and the tab it opens. */
export interface AttentionItem {
  id: string;
  n: number;
  text: string;
  target: string;
}

/**
 * The Monthly review's two items: the checks not done (no result yet, or
 * Skipped) and the checks reported as Exception, which are recorded but wait
 * to be resolved, across the months still open (`openMonthlyChecks`).
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
    },
    {
      id: "monthly-exceptions",
      n: exceptions,
      text: `${count(exceptions, "Monthly review exception")} to resolve`,
      target: "monthly",
    },
  ];
}
