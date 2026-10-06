import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, className, children }: { to: string; className?: string; children: ReactNode }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));

import { SessionEndedPractice } from "@/lib/precog/practice-context";
import { defaultProfile } from "@/lib/precog/practice-profile";
import { SESSION_ENDED_MESSAGE, SessionEndedBanner } from "./session-ended-banner";

describe("the session-ended banner", () => {
  it("says the session ended, that the business is read-only, and offers sign-in", () => {
    const html = renderToStaticMarkup(
      <SessionEndedPractice profile={defaultProfile("dental")}>
        <SessionEndedBanner />
      </SessionEndedPractice>,
    );
    expect(SESSION_ENDED_MESSAGE).toBe(
      "Your session ended. Sign in again to keep working on this business. Until then, Precog shows it read-only.",
    );
    expect(html).toContain(SESSION_ENDED_MESSAGE);
    expect(html).toMatch(/<a href="\/login"[^>]*>Sign in<\/a>/);
  });

  it("shows nothing while the session is live", () => {
    expect(renderToStaticMarkup(<SessionEndedBanner />)).toBe("");
  });
});
