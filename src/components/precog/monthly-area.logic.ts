/** The sections the Monthly review tab can open on; `item` names one of them. */
const SECTIONS = ["checks", "evidence", "calendar", "decisions", "number-patterns"] as const;

/** The element lookup `revealMonthlyItem` needs: `document` on the page. */
export type ElementLookup = { getElementById(id: string): HTMLElement | null };

/** The month ("2026-10") of the check `item` names, or null for a section or no item. */
export function checkPeriod(item: string | null): string | null {
  return item?.match(/^check-(\d{4}-\d{2})-/)?.[1] ?? null;
}

/**
 * Brings `item` into view on the Monthly review tab. A check's id
 * ("check-<period>-<key>", for example "check-2026-09-bank_statement")
 * scrolls that check to the middle of the screen and focuses it; when the
 * check is not on the page (another month is shown), the checks section opens
 * instead. A section's name scrolls that section to the top. Returns whether
 * the element `item` names was found.
 */
export function revealMonthlyItem(item: string, page: ElementLookup): boolean {
  if (item.startsWith("check-")) {
    const check = page.getElementById(item);
    if (!check) {
      page.getElementById("checks")?.scrollIntoView({ block: "start" });
      return false;
    }
    check.scrollIntoView({ block: "center" });
    // A list item takes focus only with a tabindex; -1 keeps it out of the tab order.
    if (!check.hasAttribute("tabindex")) check.setAttribute("tabindex", "-1");
    check.focus({ preventScroll: true });
    return true;
  }
  if (!(SECTIONS as readonly string[]).includes(item)) return false;
  const section = page.getElementById(item);
  section?.scrollIntoView({ block: "start" });
  return Boolean(section);
}
