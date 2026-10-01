import { describe, expect, it } from "vitest";
import { renderFirmInvitation, renderUnmatchedJoin } from "./invite-email";

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

  it("tells the owner who joined with an invitation Precog could not match", () => {
    const email = renderUnmatchedJoin({
      firmName: "North",
      role: "preparer",
      memberName: "Bob <b>",
      accountEmail: "bob@gmail.test",
      invitedEmail: "alice@cpa.test",
      link: "https://app.example/firm",
    });
    expect(email.subject).toBe("bob@gmail.test joined North on Precog");
    expect(email.text).toContain(
      "Bob <b> (bob@gmail.test) joined North as a preparer with the invitation you sent to alice@cpa.test.",
    );
    expect(email.text).toContain("https://app.example/firm");
    expect(email.html).toContain("Bob &lt;b&gt;");
  });
});
