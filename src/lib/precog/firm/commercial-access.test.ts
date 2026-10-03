import { describe, expect, it } from "vitest";
import { commercialToolsOpen, planToStore } from "./billing-store";

describe("planToStore", () => {
  it("ignores the client's plan while Stripe is connected", () => {
    expect(planToStore(true, false, "monthly")).toBeNull();
    expect(planToStore(true, true, "assessment")).toBeNull();
  });

  it("ignores the client's plan once a billing row exists", () => {
    expect(planToStore(false, true, "monthly")).toBeNull();
  });

  it("stores the plan the owner recorded by hand when nothing else sets it", () => {
    expect(planToStore(false, false, "monthly")).toBe("monthly");
    expect(planToStore(false, false, "assessment")).toBe("assessment");
  });
});

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
