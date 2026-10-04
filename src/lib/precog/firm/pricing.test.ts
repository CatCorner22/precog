import { describe, expect, it } from "vitest";
import {
  checkoutPlanFor,
  closedToolsNote,
  formatPlanPrice,
  isSubscriptionPlan,
  PILOT_OFFER,
  planAmounts,
  TIERS,
  type PlanPrices,
} from "./pricing";

const NO_TIERS = { month: null, year: null };

describe("planAmounts", () => {
  const stripe: PlanPrices = {
    assessment: { amount: 1200, currency: "usd", interval: null },
    monthly: { amount: 350, currency: "usd", interval: "month" },
    tiers: {
      1: {
        month: { amount: 350, currency: "usd", interval: "month" },
        year: { amount: 3500, currency: "usd", interval: "year" },
      },
      2: { month: { amount: 700, currency: "usd", interval: "month" }, year: null },
      3: NO_TIERS,
    },
  };

  it("prints nothing while Stripe is configured and its prices are unknown", () => {
    expect(planAmounts(true, null)).toBeNull();
  });

  it("prints Stripe's amounts, never the offer's figures, when Stripe says otherwise", () => {
    const amounts = planAmounts(true, stripe);
    expect(amounts).toEqual({
      assessment: "$1,200",
      monthly: "$350 a month",
      tiers: {
        1: { month: "$350 a month", year: "$3,500 a year" },
        2: { month: "$700 a month", year: null },
        3: { month: null, year: null },
      },
    });
    expect(JSON.stringify(amounts)).not.toContain("299");
    expect(JSON.stringify(amounts)).not.toContain("1,000");
  });

  it("prints the offer's figures only when Stripe is not configured", () => {
    const offer = {
      assessment: "$1,000",
      monthly: "$299 a month",
      tiers: {
        1: { month: "$299 a month", year: "$2,990 a year" },
        2: { month: null, year: null },
        3: { month: null, year: null },
      },
    };
    expect(planAmounts(false, null)).toEqual(offer);
    expect(planAmounts(false, stripe)).toEqual(offer);
    expect(PILOT_OFFER.assessmentFeeUsd).toBe(1000);
    expect(PILOT_OFFER.monthlyFeeUsd).toBe(299);
  });

  it("invents no fallback figure for a tier the owner has not priced", () => {
    expect(PILOT_OFFER.tiers).toEqual([
      { tier: 1, monthlyUsd: 299 },
      { tier: 2, monthlyUsd: null },
      { tier: 3, monthlyUsd: null },
    ]);
  });

  it("prints the Stripe amount, with cents only when there are some", () => {
    expect(formatPlanPrice({ amount: 1000, currency: "usd", interval: null })).toBe("$1,000");
    expect(formatPlanPrice({ amount: 299.5, currency: "usd", interval: "month" })).toBe(
      "$299.50 a month",
    );
    expect(formatPlanPrice({ amount: 2990, currency: "usd", interval: "year" })).toBe(
      "$2,990 a year",
    );
    expect(formatPlanPrice({ amount: 250, currency: "eur", interval: null })).toBe("€250");
  });
});

describe("tiers and Checkout plans", () => {
  it("names the three tiers by client businesses", () => {
    expect(TIERS).toEqual([
      { tier: 1, label: "Starter", clients: "1–5" },
      { tier: 2, label: "Practice", clients: "6–20" },
      { tier: 3, label: "Firm", clients: "21–50" },
    ]);
  });

  it("picks the Checkout plan by tier and interval; only the Assessment is not a subscription", () => {
    expect(checkoutPlanFor(1, "month")).toBe("tier1");
    expect(checkoutPlanFor(2, "year")).toBe("tier2_annual");
    expect(checkoutPlanFor(3, "month")).toBe("tier3");
    expect(isSubscriptionPlan("assessment")).toBe(false);
    expect(isSubscriptionPlan("monthly")).toBe(true);
    expect(isSubscriptionPlan("tier3_annual")).toBe(true);
  });

  it("names the Starter price as the plan's lowest in the closed-tools note", () => {
    const note = closedToolsNote(planAmounts(false, null), {
      plan: "free",
      assessmentEndedAt: null,
    });
    expect(note).toContain("are part of the Firm plan (from $299 a month).");
  });
});
