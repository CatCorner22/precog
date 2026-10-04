import { describe, expect, it } from "vitest";
import {
  ENTITLEMENTS_FROM,
  entitlementRefusal,
  entitlementsFor,
  HAND_MARKED_PLANS_UNTIL,
  TIER_CLIENT_LIMITS,
  type BillingFacts,
  type Entitlements,
} from "./entitlements";

const at = (day: string) => new Date(`${day}T12:00:00.000Z`);
const billing = (over: Partial<BillingFacts> = {}): BillingFacts => ({
  subscriptionStatus: null,
  pastDueSince: null,
  assessmentPaidAt: null,
  assessmentRefundedAt: null,
  ...over,
});
const stripe = (
  facts: BillingFacts | null,
  now: string,
  firmPlan: "assessment" | "monthly" | null = "assessment",
) => entitlementsFor({ stripeConfigured: true, firmPlan, billing: facts, now: at(now) });
const allOpen = {
  quickbooks: true,
  lockedVersions: true,
  members: true,
  ownerReminders: true,
  moreClients: true,
};
const allClosed = {
  quickbooks: false,
  lockedVersions: false,
  members: false,
  ownerReminders: false,
  moreClients: false,
};

describe("entitlementsFor without Stripe", () => {
  it("opens everything, whatever the firm marked by hand, and for an account with no firm", () => {
    for (const firmPlan of ["assessment", "monthly", null] as const) {
      const e = entitlementsFor({
        stripeConfigured: false,
        firmPlan,
        billing: null,
        now: at("2026-12-01"),
      });
      expect(e.features).toEqual(allOpen);
      expect(e.clientLimit).toBe(50);
      expect(e.aiPlan).toBe("paid");
      expect(e.plan).toBe(firmPlan === "assessment" ? "assessment" : "firm");
      expect([e.paidUntil, e.assessmentEndedAt, e.pastDueSince, e.graceEndsAt, e.closedAt]).toEqual(
        [null, null, null, null, null],
      );
    }
  });
});

describe("entitlementsFor with Stripe", () => {
  it("is free with nothing paid, one client, free AI", () => {
    const e = stripe(null, "2026-12-01");
    expect(e).toMatchObject({ plan: "free", features: allClosed, clientLimit: 1, aiPlan: "free" });
    expect(stripe(billing(), "2026-12-01").plan).toBe("free");
  });

  it("counts the Assessment's 90 days from the later of its payment and the first deploy", () => {
    expect(ENTITLEMENTS_FROM).toBe("2026-10-05");
    const early = stripe(billing({ assessmentPaidAt: "2026-06-01T00:00:00.000Z" }), "2026-12-01");
    expect(early).toMatchObject({
      plan: "assessment",
      clientLimit: 1,
      aiPlan: "paid",
      paidUntil: "2027-01-03T00:00:00.000Z",
      features: { ...allClosed, quickbooks: true, lockedVersions: true },
    });
    const later = stripe(billing({ assessmentPaidAt: "2026-11-01T00:00:00.000Z" }), "2026-12-01");
    expect(later.paidUntil).toBe("2027-01-30T00:00:00.000Z");
  });

  it("turns free when the window ends and says when it ended", () => {
    const e = stripe(billing({ assessmentPaidAt: "2026-06-01T00:00:00.000Z" }), "2027-01-03");
    expect(e).toMatchObject({
      plan: "free",
      features: allClosed,
      clientLimit: 1,
      aiPlan: "free",
      paidUntil: null,
      assessmentEndedAt: "2027-01-03T00:00:00.000Z",
    });
    // A refunded Assessment is no Assessment and names no window.
    const refunded = stripe(
      billing({
        assessmentPaidAt: "2026-11-01T00:00:00.000Z",
        assessmentRefundedAt: "2026-11-20T00:00:00.000Z",
      }),
      "2026-12-01",
    );
    expect(refunded).toMatchObject({ plan: "free", assessmentEndedAt: null, paidUntil: null });
  });

  it("is the Firm plan while the subscription is active or trialing", () => {
    for (const status of ["active", "trialing"]) {
      const e = stripe(billing({ subscriptionStatus: status }), "2026-12-01");
      expect(e).toMatchObject({ plan: "firm", features: allOpen, clientLimit: 50, aiPlan: "paid" });
      expect(e.paidUntil).toBeNull();
    }
  });

  it("holds the tier's clients on an open Firm plan, and 50 while the tier is unknown", () => {
    const withTier = (tier: 1 | 2 | 3 | null, facts = billing({ subscriptionStatus: "active" })) =>
      entitlementsFor({
        stripeConfigured: true,
        firmPlan: "monthly",
        billing: facts,
        now: at("2026-12-01"),
        tier,
      });
    expect(TIER_CLIENT_LIMITS).toEqual({ 1: 5, 2: 20, 3: 50 });
    expect(withTier(1)).toMatchObject({ plan: "firm", tier: 1, clientLimit: 5 });
    expect(withTier(2)).toMatchObject({ plan: "firm", tier: 2, clientLimit: 20 });
    expect(withTier(3)).toMatchObject({ plan: "firm", tier: 3, clientLimit: 50 });
    expect(withTier(null)).toMatchObject({ plan: "firm", tier: null, clientLimit: 50 });
    // A failed payment inside the grace keeps the tier's limit.
    const pastDue = billing({
      subscriptionStatus: "past_due",
      pastDueSince: "2026-11-25T00:00:00.000Z",
    });
    expect(withTier(1, pastDue)).toMatchObject({ plan: "firm", tier: 1, clientLimit: 5 });
    // Outside the Firm plan a tier means nothing.
    expect(withTier(2, billing())).toMatchObject({ plan: "free", tier: null, clientLimit: 1 });
    // Without Stripe: 50, tier unknown.
    expect(
      entitlementsFor({
        stripeConfigured: false,
        firmPlan: "monthly",
        billing: null,
        now: at("2026-12-01"),
        tier: 1,
      }),
    ).toMatchObject({ tier: null, clientLimit: 50 });
  });

  it("keeps the Firm plan for 14 days after a failed payment, then closes it", () => {
    const facts = billing({
      subscriptionStatus: "past_due",
      pastDueSince: "2026-10-20T00:00:00.000Z",
    });
    const inGrace = stripe(facts, "2026-10-25");
    expect(inGrace).toMatchObject({
      plan: "firm",
      features: allOpen,
      pastDueSince: "2026-10-20T00:00:00.000Z",
      graceEndsAt: "2026-11-03T00:00:00.000Z",
      closedAt: null,
    });
    const closed = stripe(facts, "2026-11-04");
    expect(closed).toMatchObject({
      plan: "free",
      features: allClosed,
      pastDueSince: "2026-10-20T00:00:00.000Z",
      graceEndsAt: null,
      closedAt: "2026-11-03T00:00:00.000Z",
    });
  });

  it("keeps a past_due plan open with no end date while the start is unknown", () => {
    const e = stripe(billing({ subscriptionStatus: "past_due" }), "2026-12-01");
    expect(e).toMatchObject({
      plan: "firm",
      pastDueSince: null,
      graceEndsAt: null,
      closedAt: null,
    });
  });

  it("gives an unpaid subscription the same 14-day grace as past_due", () => {
    const facts = billing({
      subscriptionStatus: "unpaid",
      pastDueSince: "2026-10-20T00:00:00.000Z",
    });
    expect(stripe(facts, "2026-10-25")).toMatchObject({
      plan: "firm",
      features: allOpen,
      pastDueSince: "2026-10-20T00:00:00.000Z",
      graceEndsAt: "2026-11-03T00:00:00.000Z",
      closedAt: null,
    });
    expect(stripe(facts, "2026-11-04")).toMatchObject({
      plan: "free",
      features: allClosed,
      closedAt: "2026-11-03T00:00:00.000Z",
    });
    expect(stripe(billing({ subscriptionStatus: "unpaid" }), "2026-12-01")).toMatchObject({
      plan: "firm",
      pastDueSince: null,
      graceEndsAt: null,
      closedAt: null,
    });
  });

  it("names the close on a cancellation only when Stripe's retries ran out", () => {
    const after = stripe(
      billing({ subscriptionStatus: "canceled", pastDueSince: "2026-10-20T00:00:00.000Z" }),
      "2026-11-10",
    );
    expect(after).toMatchObject({ plan: "free", closedAt: "2026-11-03T00:00:00.000Z" });
    const asked = stripe(billing({ subscriptionStatus: "canceled" }), "2026-11-10");
    expect(asked).toMatchObject({ plan: "free", pastDueSince: null, closedAt: null });
  });

  it("ignores a stray past_due_since under an active subscription", () => {
    const e = stripe(
      billing({ subscriptionStatus: "active", pastDueSince: "2026-10-20T00:00:00.000Z" }),
      "2026-12-01",
    );
    expect(e).toMatchObject({
      plan: "firm",
      pastDueSince: null,
      graceEndsAt: null,
      closedAt: null,
    });
    for (const status of ["incomplete", "incomplete_expired", "paused"]) {
      const other = stripe(
        billing({ subscriptionStatus: status, pastDueSince: "2026-10-20T00:00:00.000Z" }),
        "2026-12-01",
      );
      expect(other).toMatchObject({ plan: "free", pastDueSince: null, closedAt: null });
    }
  });

  it("gives a lapsed firm the better of its Assessment window and the closed plan", () => {
    const e = stripe(
      billing({
        subscriptionStatus: "past_due",
        pastDueSince: "2026-10-20T00:00:00.000Z",
        assessmentPaidAt: "2026-10-10T00:00:00.000Z",
      }),
      "2026-11-10",
    );
    expect(e).toMatchObject({
      plan: "assessment",
      features: { ...allClosed, quickbooks: true, lockedVersions: true },
      closedAt: "2026-11-03T00:00:00.000Z",
      paidUntil: "2027-01-08T00:00:00.000Z",
    });
  });

  it("keeps a hand-marked Firm plan with no billing row until the dated cut-off", () => {
    expect(HAND_MARKED_PLANS_UNTIL).toBe("2027-01-04");
    expect(stripe(null, "2026-12-01", "monthly")).toMatchObject({
      plan: "firm",
      features: allOpen,
    });
    expect(stripe(null, "2027-01-05", "monthly")).toMatchObject({
      plan: "free",
      features: allClosed,
    });
    // A billing row of any status ends the exception.
    expect(stripe(billing({ subscriptionStatus: "canceled" }), "2026-12-01", "monthly").plan).toBe(
      "free",
    );
    expect(stripe(billing(), "2026-12-01", "monthly").plan).toBe("free");
    expect(stripe(null, "2026-12-01", "assessment").plan).toBe("free");
  });
});

describe("entitlementRefusal", () => {
  const free = stripe(null, "2026-12-01");
  const ended = stripe(billing({ assessmentPaidAt: "2026-06-01T00:00:00.000Z" }), "2027-01-10");
  const closed = stripe(
    billing({ subscriptionStatus: "past_due", pastDueSince: "2026-10-20T00:00:00.000Z" }),
    "2026-11-10",
  );
  const text = (e: Entitlements) => ({
    quickbooks: entitlementRefusal("quickbooks", e),
    lockedVersions: entitlementRefusal("lockedVersions", e),
    members: entitlementRefusal("members", e),
    ownerReminders: entitlementRefusal("ownerReminders", e),
  });

  it("names the plans a free account can start", () => {
    expect(text(free)).toEqual({
      quickbooks:
        "The QuickBooks link is part of the Firm plan and the Assessment. Start one on the Firm page.",
      lockedVersions:
        "Locked report versions are part of the Firm plan and the Assessment. Start one on the Firm page; the live report still prints.",
      members: "Firm members are part of the Firm plan. Start it on the Firm page.",
      ownerReminders:
        "Reminder emails to clients' owners are part of the Firm plan. Start it on the Firm page; reminders inside Precog still show.",
    });
    // An Assessment inside its window closes members and owner reminders the same way.
    const assessment = stripe(
      billing({ assessmentPaidAt: "2026-11-01T00:00:00.000Z" }),
      "2026-12-01",
    );
    expect(entitlementRefusal("members", assessment)).toBe(
      "Firm members are part of the Firm plan. Start it on the Firm page.",
    );
  });

  it("says when the Assessment's window ended", () => {
    expect(text(ended)).toEqual({
      quickbooks:
        "Your Assessment's 90 days ended on 2027-01-03. The QuickBooks link is part of the Firm plan; start it on the Firm page.",
      lockedVersions:
        "Your Assessment's 90 days ended on 2027-01-03. Locked report versions are part of the Firm plan; start it on the Firm page; the live report still prints.",
      members:
        "Your Assessment's 90 days ended on 2027-01-03. Firm members are part of the Firm plan; start it on the Firm page.",
      ownerReminders:
        "Your Assessment's 90 days ended on 2027-01-03. Reminder emails to clients' owners are part of the Firm plan; start it on the Firm page; reminders inside Precog still show.",
    });
  });

  it("says when the plan closed because the payment failed", () => {
    expect(text(closed)).toEqual({
      quickbooks:
        "The QuickBooks link closed on 2026-11-03 because the Firm plan's payment failed. Fix the payment in Manage billing on the Firm page.",
      lockedVersions:
        "Locked report versions closed on 2026-11-03 because the Firm plan's payment failed. Fix the payment in Manage billing on the Firm page; the live report still prints.",
      members:
        "Firm members closed on 2026-11-03 because the Firm plan's payment failed. Fix the payment in Manage billing on the Firm page.",
      ownerReminders:
        "Reminder emails to clients' owners closed on 2026-11-03 because the Firm plan's payment failed. Fix the payment in Manage billing on the Firm page; reminders inside Precog still show.",
    });
  });

  it("never says 'should' or 'the app'", () => {
    for (const e of [free, ended, closed]) {
      for (const line of Object.values(text(e))) {
        expect(line).not.toMatch(/\bshould\b|the app\b/);
      }
    }
  });
});
