import { describe, expect, it } from "vitest";
import {
  ASSESSMENT_INCLUDES,
  BILLING_TERMS_SENTENCE,
  FIRM_CLIENT_RULE,
  FIRM_INCLUDES,
  FREE_INCLUDES,
} from "./plan-contents";

describe("plan contents", () => {
  it("lists what the free surface includes", () => {
    expect(FREE_INCLUDES).toEqual([
      "One business per account",
      "The printed report",
      "Reminders inside Precog",
      "The AI coach within the daily allowance",
    ]);
  });

  it("lists what the Assessment includes", () => {
    expect(ASSESSMENT_INCLUDES).toEqual([
      "One client business",
      "Locked report versions",
      "The QuickBooks link",
      "All of it for 90 days from payment",
    ]);
  });

  it("lists what the Firm plan includes", () => {
    expect(FIRM_INCLUDES).toEqual([
      "More than one client business",
      "Firm members with preparer and reviewer roles",
      "Locked report versions",
      "Reminder emails to each client's owner",
      "The QuickBooks link",
      "A larger daily AI allowance",
    ]);
  });

  it("states the Firm plan's price per client as a price, not a gate", () => {
    expect(FIRM_CLIENT_RULE).toBe(
      "The Firm plan is priced for up to five client businesses. Running more? Write to Support.",
    );
  });

  it("carries the billing sentence the Plan card prints", () => {
    expect(BILLING_TERMS_SENTENCE).toBe(
      "The Firm plan renews until you cancel it in Manage billing; cancelling keeps access to the end of the paid period, and a started month is not refunded. The Assessment is not refunded once a report version is locked. Prices are before sales tax, which Checkout adds for your billing address. See the Terms.",
    );
  });

  it("never says a plan unlocks something or covers up to a number", () => {
    const all = [
      ...FREE_INCLUDES,
      ...ASSESSMENT_INCLUDES,
      ...FIRM_INCLUDES,
      FIRM_CLIENT_RULE,
      BILLING_TERMS_SENTENCE,
    ];
    for (const entry of all) {
      expect(entry).not.toMatch(/unlocks/i);
      expect(entry).not.toMatch(/covers up to/i);
      expect(entry).not.toMatch(/\bshould\b/);
      expect(entry).not.toContain("e.g.");
    }
  });
});
