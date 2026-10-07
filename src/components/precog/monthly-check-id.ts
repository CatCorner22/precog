/**
 * The Monthly review's id for one check of one month, written by the review
 * and read back by Needs attention and the Monthly review tab. Kept apart
 * from monthly-area.logic.ts so the header's menu loads only these two.
 */

/** The Monthly review's DOM id for one check of one month, for example "check-2026-09-bank_statement". */
export function checkItemId(period: string, key: string): string {
  return `check-${period}-${key}`;
}

/** The month ("2026-10") of the check `item` names, or null for a section or no item. */
export function checkPeriod(item: string | null): string | null {
  return item?.match(/^check-(\d{4}-\d{2})-/)?.[1] ?? null;
}
