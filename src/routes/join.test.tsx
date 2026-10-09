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
      'Sign in to join. The firm sent this invite to <span className="text-fg">{email}</span>. Use Google or the invited email address to sign in.',
    );
    expect(source).toContain('GROK_PROVIDERS.filter((p) => p.providerId === "grok-google")');
  });

  it("refuses an unconfirmed address and explains how to join", () => {
    expect(source).toContain(
      'Precog cannot confirm this account&rsquo;s email. Sign in with Google as{" "} <span className="text-fg">{invitedEmail}</span>, or use an email-and-password account with a confirmed address. Then reopen the invitation.',
    );
  });

  it("says what each role can do and who deletes or restores a client", () => {
    expect(source).toContain("Map clients and lock reports");
    expect(source).toContain("Record monthly review results and control checks");
    expect(source).toContain("Review control checks");
    expect(source).toContain("Approve reports someone else prepared");
    expect(source).toContain("Only the firm owner can delete or restore a client.");
  });

  it("tells a throttled visitor to wait rather than calling the link closed", () => {
    expect(source).toContain("Too many opens from this address");
    expect(source).toContain(
      "Wait one minute, then check this invitation again. The link stays the same.",
    );
  });
});
