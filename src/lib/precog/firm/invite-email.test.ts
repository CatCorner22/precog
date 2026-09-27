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
});
