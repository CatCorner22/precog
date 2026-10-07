import { describe, expect, it, vi } from "vitest";
import { checkPeriod, revealMonthlyItem } from "./monthly-area.logic";

/** A stand-in for a page element: records how it was scrolled and focused. */
function element(tabIndex: string | null = null) {
  const attrs = new Map<string, string>();
  if (tabIndex !== null) attrs.set("tabindex", tabIndex);
  return {
    scrollIntoView: vi.fn(),
    focus: vi.fn(),
    hasAttribute: (name: string) => attrs.has(name),
    setAttribute: (name: string, value: string) => attrs.set(name, value),
    getAttribute: (name: string) => attrs.get(name) ?? null,
  };
}

function page(elements: Record<string, ReturnType<typeof element>>) {
  return {
    getElementById: (id: string) => (elements[id] ?? null) as unknown as HTMLElement | null,
  };
}

describe("checkPeriod", () => {
  it("reads the month from a check's id, and nothing from a section's name", () => {
    expect(checkPeriod("check-2026-10-bank_statement")).toBe("2026-10");
    expect(checkPeriod("checks")).toBeNull();
    expect(checkPeriod("decisions")).toBeNull();
    expect(checkPeriod(null)).toBeNull();
  });
});

describe("revealMonthlyItem", () => {
  it("scrolls to the check an item names and focuses it", () => {
    const check = element();
    const checks = element();
    expect(
      revealMonthlyItem(
        "check-2026-09-bank_statement",
        page({ checks, "check-2026-09-bank_statement": check }),
      ),
    ).toBe(true);
    expect(check.scrollIntoView).toHaveBeenCalledWith({ block: "center" });
    // A list item takes focus only with a tabindex; it gets one that keeps it out of the tab order.
    expect(check.getAttribute("tabindex")).toBe("-1");
    expect(check.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(checks.scrollIntoView).not.toHaveBeenCalled();
  });

  it("keeps a tabindex the check already has", () => {
    const check = element("0");
    revealMonthlyItem(
      "check-2026-10-cleared_checks",
      page({ "check-2026-10-cleared_checks": check }),
    );
    expect(check.getAttribute("tabindex")).toBe("0");
  });

  it("opens the checks section when the named check is not on the page", () => {
    const checks = element();
    expect(revealMonthlyItem("check-2026-10-card_statement", page({ checks }))).toBe(false);
    expect(checks.scrollIntoView).toHaveBeenCalledWith({ block: "start" });
  });

  it("still scrolls to a named section, and ignores anything else", () => {
    const decisions = element();
    revealMonthlyItem("decisions", page({ decisions }));
    expect(decisions.scrollIntoView).toHaveBeenCalledWith({ block: "start" });
    expect(decisions.focus).not.toHaveBeenCalled();
    const other = element();
    expect(revealMonthlyItem("other", page({ other }))).toBe(false);
    expect(other.scrollIntoView).not.toHaveBeenCalled();
  });
});
