import { describe, expect, it } from "vitest";
import { removeBusinessPrompt } from "./business-switcher-text";

describe("removeBusinessPrompt", () => {
  it("says a firm client goes for the whole firm and how to restore it", () => {
    const text = removeBusinessPrompt({ name: "Smile Dental", shared: true });
    expect(text).toContain('Delete "Smile Dental" for everyone in your firm?');
    expect(text).toContain("every firm member's list, and its share links stop working");
    expect(text).toContain("Recently deleted in the Firm workspace for 30 days");
    expect(text).not.toContain("your portfolio");
    expect(text).not.toContain("You cannot undo this.");
  });

  it("keeps the portfolio wording for the account's own business", () => {
    expect(removeBusinessPrompt({ name: "Main St", shared: false })).toBe(
      'Remove "Main St" from your portfolio? Its share links stop working. You cannot undo this.',
    );
  });
});
