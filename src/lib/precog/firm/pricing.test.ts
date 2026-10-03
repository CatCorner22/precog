import { describe, expect, it } from "vitest";
import { formatPlanPrice, PILOT_OFFER, planAmounts } from "./pricing";

describe("planAmounts", () => {
  const stripe = {
    assessment: { amount: 1200, currency: "usd", interval: null },
    monthly: { amount: 350, currency: "usd", interval: "month" },
  };

  it("prints nothing while Stripe is configured and its prices are unknown", () => {
    expect(planAmounts(true, null)).toBeNull();
  });

  it("prints Stripe's amounts, never the offer's figures, when Stripe says otherwise", () => {
    const amounts = planAmounts(true, stripe);
    expect(amounts).toEqual({ assessment: "$1,200", monthly: "$350 a month" });
    expect(JSON.stringify(amounts)).not.toContain("299");
    expect(JSON.stringify(amounts)).not.toContain("1,000");
  });

  it("prints the offer's figures only when Stripe is not configured", () => {
    expect(planAmounts(false, null)).toEqual({ assessment: "$1,000", monthly: "$299 a month" });
    expect(planAmounts(false, stripe)).toEqual({ assessment: "$1,000", monthly: "$299 a month" });
    expect(PILOT_OFFER.assessmentFeeUsd).toBe(1000);
    expect(PILOT_OFFER.monthlyFeeUsd).toBe(299);
  });

  it("prints the Stripe amount, with cents only when there are some", () => {
    expect(formatPlanPrice({ amount: 1000, currency: "usd", interval: null })).toBe("$1,000");
    expect(formatPlanPrice({ amount: 299.5, currency: "usd", interval: "month" })).toBe(
      "$299.50 a month",
    );
    expect(formatPlanPrice({ amount: 250, currency: "eur", interval: null })).toBe("€250");
  });
});
