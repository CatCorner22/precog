import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The page's sentences sit behind two server calls and a sign-in check, so
// a static render shows only "Checking the invitation…"; the sentences are
// pinned from the source, as the firm prompts are.
const source = readFileSync(new URL("./join.$token.tsx", import.meta.url), "utf8").replace(
  /\s+/g,
  " ",
);

describe("the invitation page", () => {
  it("tells a visitor which sign-ins can join, and offers Google alone", () => {
    expect(source).toContain(
      'Sign in to join. The firm sent the invitation to <span className="text-fg">{email}</span>. Sign in with Google or with the email address the invitation was sent to.',
    );
    expect(source).toContain('GROK_PROVIDERS.filter((p) => p.providerId === "grok-google")');
  });

  it("refuses an address Precog cannot vouch for with the way in", () => {
    expect(source).toContain(
      'Precog cannot vouch for this account\'s address. Sign in with Google under{" "} <span className="text-fg">{invitedEmail}</span>, or with an email-and-password account that has confirmed it, then open the invitation again.',
    );
  });

  it("says what each role can do and who deletes or restores a client", () => {
    expect(source).toContain("Map clients and lock reports");
    expect(source).toContain("Record monthly review results and control checks");
    expect(source).toContain("Review control checks");
    expect(source).toContain("Sign off reports someone else prepared");
    expect(source).toContain("Only the firm owner deletes or restores a client.");
  });

  it("tells a throttled visitor to wait rather than calling the link closed", () => {
    expect(source).toContain("Too many opens from this address");
    expect(source).toContain(
      "Wait a minute, then check the invitation again. The link itself is unchanged.",
    );
  });
});
