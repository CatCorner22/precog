import { describe, expect, it } from "vitest";
import { formatDay } from "../dates";
import { renderClientGrantInvitation } from "./grant-email";

describe("the client invitation email", () => {
  const expiresAt = "2026-10-18T12:00:00.000Z";
  const email = renderClientGrantInvitation({
    ownerName: "Rosa Ortiz",
    businessName: "Ortiz <Dental>",
    url: "https://precog.example/join/client/abc",
    expiresAt,
  });

  it("names the owner and the business in the subject", () => {
    expect(email.subject).toBe("Precog: Rosa Ortiz invites your firm to work on Ortiz <Dental>");
  });

  it("says the business stays the owner's, carries the link and says why it came", () => {
    expect(email.text).toBe(
      [
        "Rosa Ortiz invites your firm to work on Ortiz <Dental> in Precog. Open this link to add it to your firm's client list; the business stays Rosa Ortiz's: https://precog.example/join/client/abc",
        "",
        `You receive this because Rosa Ortiz entered your address in Precog. The link expires on ${formatDay(expiresAt)}.`,
      ].join("\n"),
    );
  });

  it("escapes the names in the HTML", () => {
    expect(email.html).toContain("Ortiz &lt;Dental&gt;");
    expect(email.html).not.toContain("<Dental>");
    expect(email.html).toContain('href="https://precog.example/join/client/abc"');
  });
});
