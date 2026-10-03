import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FirmBilling } from "./firm-billing";
import type { BillingAccount } from "@/lib/precog/firm/billing-store";
import { closedToolsNote, planAmounts } from "@/lib/precog/firm/pricing";

vi.mock("@/lib/precog/billing/server", () => ({
  openBillingPortal: vi.fn(),
  startCheckout: vi.fn(),
}));

const prices = {
  assessment: { amount: 1000, currency: "usd", interval: null },
  monthly: { amount: 299, currency: "usd", interval: "month" },
};

function account(over: Partial<BillingAccount>): BillingAccount {
  return {
    stripeCustomerId: "cus_1",
    subscriptionId: null,
    subscriptionStatus: null,
    assessmentPaidAt: null,
    assessmentPaymentIntentId: null,
    assessmentRefundedAt: null,
    assessmentDisputedAt: null,
    currentPeriodEnd: null,
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...over,
  };
}

function render(billing: BillingAccount | null, canManage = true): string {
  return renderToStaticMarkup(
    <FirmBilling
      plan="assessment"
      billing={billing}
      billingConfigured
      prices={prices}
      canManage={canManage}
      onMarkPlan={async () => undefined}
    />,
  );
}

describe("FirmBilling with Stripe connected", () => {
  it("prints the refund and tax terms under the Checkout buttons", () => {
    const html = render(null);
    expect(html).toContain(
      "The Firm plan renews until you cancel it in Manage billing; cancelling keeps access to the end of the paid period, and a started month is not refunded. The Assessment is not refunded once a report version is locked. Prices are before sales tax, which Checkout adds for your billing address. See the Terms.",
    );
    expect(html).toContain("Pay for the assessment ($1,000)");
    expect(html).toContain("Start the Firm plan ($299 a month)");
  });

  it("prints the subscription status in plain words with its renewal or end date", () => {
    expect(
      render(
        account({
          subscriptionStatus: "past_due",
          currentPeriodEnd: "2026-11-01T00:00:00.000Z",
        }),
      ),
    ).toContain("Payment overdue · renews 2026-11-01");
    expect(
      render(
        account({
          subscriptionStatus: "canceled",
          currentPeriodEnd: "2026-11-01T00:00:00.000Z",
        }),
      ),
    ).toContain("Cancelled · ends 2026-11-01");
    expect(render(null)).toContain("None");
  });

  it("shows a refunded or disputed assessment and brings the Pay button back after a refund", () => {
    const paid = render(account({ assessmentPaidAt: "2026-09-01T00:00:00.000Z" }));
    expect(paid).toContain("2026-09-01");
    expect(paid).not.toContain("Pay for the assessment");
    const refunded = render(
      account({
        assessmentPaidAt: "2026-09-01T00:00:00.000Z",
        assessmentRefundedAt: "2026-09-20T00:00:00.000Z",
      }),
    );
    expect(refunded).toContain("Refunded 2026-09-20");
    expect(refunded).toContain("Pay for the assessment ($1,000)");
    const disputed = render(
      account({
        assessmentPaidAt: "2026-09-01T00:00:00.000Z",
        assessmentDisputedAt: "2026-09-20T00:00:00.000Z",
      }),
    );
    expect(disputed).toContain("Disputed");
    expect(disputed).not.toContain("Pay for the assessment");
  });

  it("names Stripe's amounts in the closed-tools note, and nothing while they are unknown", () => {
    expect(closedToolsNote(planAmounts(true, prices))).toBe(
      "Stripe is connected on this deployment; the price is the $1,000 assessment and the $299 a month plan, not a price per client.",
    );
    expect(closedToolsNote(planAmounts(true, null))).toBeNull();
    expect(closedToolsNote(null)).toBeNull();
  });

  it("prints no figure while Stripe's prices are unknown", () => {
    const html = renderToStaticMarkup(
      <FirmBilling
        plan="assessment"
        billing={null}
        billingConfigured
        prices={null}
        canManage
        onMarkPlan={async () => undefined}
      />,
    );
    expect(html).toContain("Pay for the assessment<");
    expect(html).not.toContain("$1,000");
    expect(html).not.toContain("$299");
  });
});
