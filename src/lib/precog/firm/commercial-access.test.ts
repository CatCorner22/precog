import { describe, expect, it } from "vitest";
import { commercialToolsOpen } from "./billing-store";

describe("commercialToolsOpen", () => {
  it("stays open when Stripe is not configured", () => {
    expect(
      commercialToolsOpen({
        stripeConfigured: false,
        subscriptionStatus: null,
        assessmentPaidAt: null,
        assessmentRefundedAt: null,
      }),
    ).toBe(true);
  });

  it("treats past_due as unpaid even after an assessment", () => {
    expect(
      commercialToolsOpen({
        stripeConfigured: true,
        subscriptionStatus: "past_due",
        assessmentPaidAt: "2026-09-01T00:00:00.000Z",
        assessmentRefundedAt: null,
      }),
    ).toBe(false);
  });

  it("opens for an active plan or a paid assessment with no subscription", () => {
    expect(
      commercialToolsOpen({
        stripeConfigured: true,
        subscriptionStatus: "active",
        assessmentPaidAt: null,
        assessmentRefundedAt: null,
      }),
    ).toBe(true);
    expect(
      commercialToolsOpen({
        stripeConfigured: true,
        subscriptionStatus: null,
        assessmentPaidAt: "2026-09-01T00:00:00.000Z",
        assessmentRefundedAt: null,
      }),
    ).toBe(true);
    expect(
      commercialToolsOpen({
        stripeConfigured: true,
        subscriptionStatus: null,
        assessmentPaidAt: null,
        assessmentRefundedAt: null,
      }),
    ).toBe(false);
  });

  it("closes again once the assessment is refunded", () => {
    expect(
      commercialToolsOpen({
        stripeConfigured: true,
        subscriptionStatus: null,
        assessmentPaidAt: "2026-09-01T00:00:00.000Z",
        assessmentRefundedAt: "2026-09-20T00:00:00.000Z",
      }),
    ).toBe(false);
    // An active plan keeps the tools open whatever happened to the assessment.
    expect(
      commercialToolsOpen({
        stripeConfigured: true,
        subscriptionStatus: "active",
        assessmentPaidAt: "2026-09-01T00:00:00.000Z",
        assessmentRefundedAt: "2026-09-20T00:00:00.000Z",
      }),
    ).toBe(true);
  });
});
