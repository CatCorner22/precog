import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FirmBilling } from "./firm-billing";
import type { BillingAccount } from "@/lib/precog/firm/billing-store";
import { entitlementsFor, type Entitlements } from "@/lib/precog/firm/entitlements";
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
    pastDueSince: null,
    paymentFailedEmailSentAt: null,
    paymentFailedInvoiceUrl: null,
    assessmentCreditUsedAt: null,
    assessmentFeeCents: null,
    assessmentCreditCents: null,
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...over,
  };
}

const free = entitlementsFor({
  stripeConfigured: true,
  firmPlan: "assessment",
  billing: null,
  now: new Date("2026-12-01T00:00:00.000Z"),
});

function render(
  billing: BillingAccount | null,
  canManage = true,
  entitlements: Entitlements | null = free,
): string {
  return renderToStaticMarkup(
    <FirmBilling
      plan="assessment"
      billing={billing}
      billingConfigured
      prices={prices}
      entitlements={entitlements}
      canManage={canManage}
      onMarkPlan={async () => undefined}
    />,
  );
}

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("FirmBilling with Stripe connected", () => {
  it("prints the refund and tax terms under the Checkout buttons", () => {
    const html = render(null);
    expect(html).toContain(
      "The Firm plan renews until you cancel it in Manage billing; cancelling keeps access to the end of the paid period, and a started month is not refunded. The Assessment is not refunded once a report version is locked. Prices are before sales tax, which Checkout adds for your billing address. See the Terms.",
    );
    expect(html).toContain("Pay for the assessment ($1,000)");
    expect(html).toContain("Start the Firm plan ($299 a month)");
  });

  it("promises the Assessment credit before it is used, and not after", () => {
    const detail =
      "Assessment: $1,000 — One client mapped, conflicts named, and a report the CPA can send.";
    const monthlyDetail = "Ongoing monthly reviews for your clients, with reminders by email.";
    expect(text(render(account({ assessmentPaidAt: "2026-09-01T00:00:00.000Z" })))).toContain(
      `${detail} When you start the Firm plan at $299 a month, the $1,000 you paid for the Assessment is credited against its invoices, before tax. ${monthlyDetail}`,
    );
    expect(text(render(null))).toContain(
      `${detail} Start the Firm plan at $299 a month later and the Assessment fee is credited against its invoices. ${monthlyDetail}`,
    );
    const used = account({
      assessmentPaidAt: "2026-09-01T00:00:00.000Z",
      assessmentCreditUsedAt: "2026-10-01T00:00:00.000Z",
    });
    expect(text(render(used))).toContain(
      `${detail} The Assessment is a one-off payment. ${monthlyDetail}`,
    );
    const subscribed = account({ subscriptionId: "sub_1", subscriptionStatus: "canceled" });
    expect(text(render(subscribed))).toContain("The Assessment is a one-off payment.");
    // The button keeps its label: the credit is drawn down by invoices, not shown at Checkout.
    expect(render(account({ assessmentPaidAt: "2026-09-01T00:00:00.000Z" }))).toContain(
      "Start the Firm plan ($299 a month)",
    );
  });

  it("names the current plan from the entitlements", () => {
    const on = (day: string) => new Date(`${day}T00:00:00.000Z`);
    const label = (e: Entitlements) =>
      text(render(null, true, e))
        .match(/Current plan (.*?) Assessment paid/)?.[1]
        ?.trim();
    expect(label(free)).toBe("Free");
    const paid = (now: string) =>
      entitlementsFor({
        stripeConfigured: true,
        firmPlan: "assessment",
        billing: {
          subscriptionStatus: null,
          pastDueSince: null,
          assessmentPaidAt: "2026-10-01T00:00:00.000Z",
          assessmentRefundedAt: null,
        },
        now: on(now),
      });
    expect(label(paid("2026-12-01"))).toBe("Assessment (until 2027-01-03)");
    expect(label(paid("2027-02-01"))).toBe("Assessment (ended 2027-01-03)");
    const firm = (status: string, now: string) =>
      entitlementsFor({
        stripeConfigured: true,
        firmPlan: "monthly",
        billing: {
          subscriptionStatus: status,
          pastDueSince: "2026-10-20T00:00:00.000Z",
          assessmentPaidAt: null,
          assessmentRefundedAt: null,
        },
        now: on(now),
      });
    expect(label(firm("active", "2026-12-01"))).toBe("Firm plan");
    expect(label(firm("past_due", "2026-10-25"))).toBe(
      "Firm plan (payment overdue, closes 2026-11-03)",
    );
    expect(label(firm("past_due", "2026-11-10"))).toBe("Firm plan (closed 2026-11-03)");
    // Unknown entitlements fall back to the firm row's plan.
    expect(label(null as unknown as Entitlements)).toBe("Assessment");
  });

  it("prints the subscription status in plain words with its renewal or end date", () => {
    expect(
      render(
        account({
          subscriptionStatus: "past_due",
          pastDueSince: "2026-10-20T00:00:00.000Z",
          currentPeriodEnd: "2026-11-01T00:00:00.000Z",
        }),
      ),
    ).toContain(
      "Payment overdue since 2026-10-20 · closes 2026-11-03 unless the payment goes through",
    );
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

  it("says what the paid plans open in the closed-tools note, with Stripe's amounts once known", () => {
    expect(closedToolsNote(planAmounts(true, prices), free)).toBe(
      "The QuickBooks link, locked report versions, firm members, owner reminder emails and more than one client business are part of the Firm plan ($299 a month). The Assessment ($1,000) covers one client with locked versions and the QuickBooks link for 90 days from payment. The Monthly review on each business's own screen stays open.",
    );
    expect(closedToolsNote(planAmounts(true, null), free)).toBe(
      "The QuickBooks link, locked report versions, firm members, owner reminder emails and more than one client business are part of the Firm plan. The Assessment covers one client with locked versions and the QuickBooks link for 90 days from payment. The Monthly review on each business's own screen stays open.",
    );
    const ended = { plan: "free" as const, assessmentEndedAt: "2027-01-03T00:00:00.000Z" };
    expect(closedToolsNote(planAmounts(true, prices), ended)).toBe(
      "Your Assessment's 90 days ended on 2027-01-03. The QuickBooks link and new locked versions are closed; every locked version you already hold stays. Start the Firm plan ($299 a month) on this page. The Monthly review on each business's own screen stays open.",
    );
    expect(closedToolsNote(null, ended)).not.toContain("$");
  });

  it("prints no figure while Stripe's prices are unknown", () => {
    const html = renderToStaticMarkup(
      <FirmBilling
        plan="assessment"
        billing={null}
        billingConfigured
        prices={null}
        entitlements={free}
        canManage
        onMarkPlan={async () => undefined}
      />,
    );
    expect(html).toContain("Pay for the assessment<");
    expect(html).not.toContain("$1,000");
    expect(html).not.toContain("$299");
  });
});
