import { describe, expect, it } from "vitest";
import { renderFirmInvitation } from "./invite-email";

describe("firm invitation email", () => {
  it("carries the link and escapes the firm name in the HTML", () => {
    const email = renderFirmInvitation({
      firmName: "North <Advisors>",
      inviterName: "Ada",
      role: "reviewer",
      link: "https://app.example/join/abc",
    });
    expect(email.subject).toBe("Join North <Advisors> on Precog");
    expect(email.text).toContain("https://app.example/join/abc");
    expect(email.text).toContain(
      "Ada invited you to join North <Advisors> on Precog as a reviewer.",
    );
    expect(email.html).toContain("North &lt;Advisors&gt;");
    expect(email.html).not.toContain("<Advisors>");
  });

  it("says what a reviewer does in the words the report uses", () => {
    const email = renderFirmInvitation({
      firmName: "North",
      inviterName: null,
      role: "reviewer",
      link: "https://app.example/join/abc",
    });
    expect(email.text).toContain(
      "A reviewer does what a preparer does, reviews control checks, and reviews for issuance reports that someone else prepared.",
    );
  });

  it("says which sign-ins carry a confirmed address", () => {
    const email = renderFirmInvitation({
      firmName: "North",
      inviterName: null,
      role: "preparer",
      link: "https://app.example/join/abc",
    });
    expect(email.text).toContain(
      "The link works once and expires in two weeks. Sign in with Google under this address, or with an email-and-password account that has confirmed it, then open the link to join.",
    );
  });
});
