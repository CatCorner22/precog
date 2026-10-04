import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/precog/firm/entitlements-server", () => ({
  getEntitlements: vi.fn(async () => {
    throw new Error("Unauthorized");
  }),
}));
vi.mock("@/lib/precog/billing/server", () => ({ openBillingPortal: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

const { PaymentOverdueBanner, PaymentOverdueNotice, overdueNotice } =
  await import("./payment-overdue-banner");

const good = {
  pastDueSince: null,
  graceEndsAt: null,
  closedAt: null,
  isOwner: true,
  firmOwnerName: "Pat Owner",
};
const inGrace = {
  ...good,
  pastDueSince: "2026-10-20T08:00:00.000Z",
  graceEndsAt: "2026-11-03T08:00:00.000Z",
};
const closed = {
  ...good,
  pastDueSince: "2026-10-20T08:00:00.000Z",
  closedAt: "2026-11-03T08:00:00.000Z",
};
const unknownStart = { ...good, pastDueSince: "2026-10-20T08:00:00.000Z" };

function render(e: Parameters<typeof overdueNotice>[0], variant: "home" | "firm" = "home") {
  return renderToStaticMarkup(
    <PaymentOverdueNotice entitlements={e} variant={variant} onFix={() => {}} />,
  );
}

describe("the failed-payment notice", () => {
  it("tells the owner the grace end and gives them the button", () => {
    expect(overdueNotice(inGrace)).toEqual({
      text: "The payment for your Firm plan failed on 2026-10-20. Precog keeps the plan open until 2026-11-03; fix the payment in Manage billing before then.",
      action: "fix",
    });
    const html = render(inGrace);
    expect(html).toContain(">Fix payment</button>");
    expect(html).toContain('aria-label="Firm plan payment"');
  });

  it("tells a member who to ask, with no button", () => {
    expect(overdueNotice({ ...inGrace, isOwner: false })).toEqual({
      text: "The payment for the firm's Firm plan failed on 2026-10-20. Precog keeps the Firm plan open until 2026-11-03. Ask Pat Owner to fix it in Manage billing.",
      action: "ask",
    });
    expect(render({ ...inGrace, isOwner: false })).not.toContain("Fix payment");
    expect(overdueNotice({ ...inGrace, isOwner: false, firmOwnerName: null })?.text).toContain(
      "Ask the firm owner to fix it in Manage billing.",
    );
  });

  it("says what closed and what stays once the grace ran out", () => {
    const text =
      "The Firm plan closed on 2026-11-03 because the payment failed. The QuickBooks link, new locked report versions, member invitations and owner reminder emails are closed until it is fixed; the Monthly review and every locked version you already hold stay open.";
    expect(overdueNotice(closed)).toEqual({ text, action: "fix" });
    expect(overdueNotice({ ...closed, isOwner: false })).toEqual({
      text: `${text} Ask Pat Owner to fix it in Manage billing.`,
      action: "ask",
    });
  });

  it("keeps the plan open while Stripe retries when the start of the grace is unknown", () => {
    expect(overdueNotice(unknownStart)?.text).toBe(
      "The payment for your Firm plan failed on 2026-10-20. Precog keeps the plan open while Stripe retries the payment; fix the payment in Manage billing.",
    );
    expect(overdueNotice({ ...unknownStart, isOwner: false })?.text).toBe(
      "The payment for the firm's Firm plan failed on 2026-10-20. Precog keeps the Firm plan open while Stripe retries the payment. Ask Pat Owner to fix it in Manage billing.",
    );
  });

  it("renders nothing in good standing, and nothing when the plan cannot be read", () => {
    expect(overdueNotice(good)).toBeNull();
    expect(render(good)).toBe("");
    expect(renderToStaticMarkup(<PaymentOverdueBanner variant="firm" />)).toBe("");
  });
});
