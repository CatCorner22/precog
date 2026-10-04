import { describe, expect, it } from "vitest";
import { renderPaymentFailed } from "./dunning-email";

describe("the failed-payment email", () => {
  const base = {
    firmName: "North Advisors",
    failedOn: "2026-10-20",
    fixUrl: "https://invoice.stripe.com/i/in_1",
  };

  it("says when the plan closes when the start of the episode is known", () => {
    const email = renderPaymentFailed({ ...base, closesOn: "2026-11-03" });
    expect(email.subject).toBe("Precog: the Firm plan payment failed");
    expect(email.text).toBe(
      [
        "The payment for the Firm plan for North Advisors failed on 2026-10-20. Stripe will try again over the next 14 days. Precog keeps the plan open until 2026-11-03; after that the QuickBooks link, new locked report versions, member invitations and owner reminder emails close until the payment goes through. The Monthly review for your clients and every locked version you already hold stay open. Fix the payment: https://invoice.stripe.com/i/in_1",
        "",
        "You receive this because you own North Advisors on Precog.",
      ].join("\n"),
    );
    expect(email.html).toContain('href="https://invoice.stripe.com/i/in_1"');
    expect(email.html).toContain("Fix the payment</a>");
  });

  it("keeps the plan open while Stripe retries when the start is unknown", () => {
    const email = renderPaymentFailed({
      ...base,
      closesOn: null,
      fixUrl: "https://app.example/firm?billing=overdue",
    });
    expect(email.text).toContain(
      "The payment for the Firm plan for North Advisors failed on 2026-10-20. Stripe will try again over the next 14 days, and Precog keeps the plan open while it does; after that the QuickBooks link, new locked report versions, member invitations and owner reminder emails close until the payment goes through. The Monthly review for your clients and every locked version you already hold stay open. Fix the payment: https://app.example/firm?billing=overdue",
    );
    expect(email.text).not.toMatch(/\bshould\b|the app\b/);
    // One sentence for every payment method: card, bank account or invoice.
    expect(email.text).not.toMatch(/\bcard\b|declined/);
  });
});
