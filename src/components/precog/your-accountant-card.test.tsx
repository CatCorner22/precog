import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { formatDay } from "@/lib/precog/dates";

vi.mock("@/lib/precog/firm/grant-server", () => ({
  endFirmAccess: vi.fn(),
  getBusinessGrant: vi.fn(),
  inviteFirmToBusiness: vi.fn(),
}));

const card = await import("./your-accountant-card");
const { YourAccountantView, YourAccountantCard } = card;

const EXPIRES = "2026-10-18T12:00:00.000Z";
const SINCE = "2026-10-04T12:00:00.000Z";

const view = (
  grant: Parameters<typeof YourAccountantView>[0]["grant"],
  sent: Parameters<typeof YourAccountantView>[0]["sent"] = null,
) => renderToStaticMarkup(<YourAccountantView grant={grant} sent={sent} />);

describe("the Your accountant card", () => {
  it("pins its heading, field, buttons and toasts", () => {
    expect([
      card.YOUR_ACCOUNTANT,
      card.FIRM_OWNER_EMAIL,
      card.INVITE_THE_FIRM,
      card.END_FIRM_ACCESS,
      card.FIRM_ACCESS_ENDED,
      card.INVITE_NOT_SENT,
      card.ACCESS_NOT_ENDED,
    ]).toEqual([
      "Your accountant",
      "Firm owner's email",
      "Invite the firm",
      "End the firm's access",
      "The firm's access has ended.",
      "Precog could not send the invitation.",
      "Precog could not end the firm's access.",
    ]);
  });

  it("with no firm, says what the firm can do and that the business stays the owner's", () => {
    const html = view(null);
    expect(card.ACCOUNTANT_INTRO).toBe(
      "Invite your accountant's firm to work on this business in Precog. The firm can read and change your team, duty map, procedures and Monthly review, connect QuickBooks, download the business's past versions, and lock and share reports under its name. The business stays yours, and you can end the firm's access at any time.",
    );
    expect(html).toContain("Your accountant");
    expect(html).toContain("The firm can read and change your team");
    expect(html).toContain("Firm owner&#x27;s email");
    expect(html).toContain('type="email"');
    expect(html).toContain(">Invite the firm</button>");
    expect(html).not.toContain("End the firm");
  });

  it("after sending, says where it went and when it expires, or hands over the link", () => {
    const sent = { email: "cpa@north.test", expiresAt: EXPIRES, url: "https://p.test/j" };
    expect(card.invitationSentText("cpa@north.test", EXPIRES)).toBe(
      `Invitation sent to cpa@north.test; it expires on ${formatDay(EXPIRES)}.`,
    );
    expect(card.invitationUnmailedText("https://p.test/j")).toBe(
      "Precog could not email it. Send this link yourself: https://p.test/j",
    );
    const pending = { pendingEmail: "cpa@north.test", expiresAt: EXPIRES };
    expect(view(pending, { ...sent, emailed: true })).toContain(
      card.invitationSentText("cpa@north.test", EXPIRES),
    );
    expect(view(pending, { ...sent, emailed: false })).toContain(
      "Precog could not email it. Send this link yourself: https://p.test/j",
    );
  });

  it("with an invitation waiting, says for whom and until when", () => {
    expect(card.invitationWaitingText("cpa@north.test", EXPIRES)).toBe(
      `Waiting for cpa@north.test to accept; the invitation expires on ${formatDay(EXPIRES)}.`,
    );
    const html = view({ pendingEmail: "cpa@north.test", expiresAt: EXPIRES });
    expect(html).toContain(card.invitationWaitingText("cpa@north.test", EXPIRES));
    expect(html).toContain(">Invite the firm</button>");
  });

  it("with a firm at work, names it and offers to end its access", () => {
    expect(card.firmWorkingText("North Advisors", SINCE)).toBe(
      `North Advisors has worked on this business since ${formatDay(SINCE)}.`,
    );
    const html = view({ firmName: "North Advisors", since: SINCE });
    expect(html).toContain(card.firmWorkingText("North Advisors", SINCE));
    expect(html).toContain(">End the firm&#x27;s access</button>");
    expect(html).not.toContain("Invite the firm");
  });

  it("asks before ending the firm's access, saying the owner keeps the versions", () => {
    const prompt = card.endFirmAccessPrompt("North Advisors", "Ortiz Dental");
    expect(prompt).toBe(
      "End North Advisors's access to Ortiz Dental? The firm loses access to this business and to the report versions it locked; you keep them.",
    );
    expect(prompt).not.toContain("You cannot undo this.");
  });

  it("renders nothing until the grant loads", () => {
    expect(
      renderToStaticMarkup(<YourAccountantCard businessId="biz_1" businessName="Ortiz" />),
    ).toBe("");
  });
});
