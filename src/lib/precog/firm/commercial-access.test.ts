import { describe, expect, it } from "vitest";
import { commercialToolsOpen } from "./billing-store";

describe("commercialToolsOpen", () => {
  it("stays open when Stripe is not configured", () => {
    expect(
      commercialToolsOpen({
        stripeConfigured: false,
        subscriptionStatus: null,
        assessmentPaidAt: null,
      }),
    ).toBe(true);
  });

  it("treats past_due as unpaid even after an assessment", () => {
    expect(
      commercialToolsOpen({
        stripeConfigured: true,
        subscriptionStatus: "past_due",
        assessmentPaidAt: "2026-09-01T00:00:00.000Z",
      }),
    ).toBe(false);
  });

  it("opens for an active plan or a paid assessment with no subscription", () => {
    expect(
      commercialToolsOpen({
        stripeConfigured: true,
        subscriptionStatus: "active",
        assessmentPaidAt: null,
      }),
    ).toBe(true);
    expect(
      commercialToolsOpen({
        stripeConfigured: true,
        subscriptionStatus: null,
        assessmentPaidAt: "2026-09-01T00:00:00.000Z",
      }),
    ).toBe(true);
    expect(
      commercialToolsOpen({
        stripeConfigured: true,
        subscriptionStatus: null,
        assessmentPaidAt: null,
      }),
    ).toBe(false);
  });
});
