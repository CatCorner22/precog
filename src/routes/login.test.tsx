import type { ComponentType, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The page renders outside a router and with sign-in off, so the sentence
// and its links are what is under test: Link becomes a plain anchor and
// createFileRoute hands back its options with the loader's answer.
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({
    options,
    useLoaderData: () => ({ configured: false, prices: null }),
  }),
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));
vi.mock("@/lib/auth/client", () => ({
  GROK_PROVIDERS: [],
  authClient: {},
  authEnabled: false,
  signIn: vi.fn(),
  signInErrorMessage: (code: string) => code,
}));
vi.mock("@/lib/auth/email-password", () => ({
  emailAndPasswordEnabled: false,
  PASSWORD_MIN_LENGTH: 8,
}));
vi.mock("@/lib/precog/billing/server", () => ({ getPlanPrices: vi.fn() }));

import { Route } from "./login";

type RouteLike = { options: { component: ComponentType } };

const Page = (Route as unknown as RouteLike).options.component;
const html = renderToStaticMarkup(<Page />);

describe("the sign-in page", () => {
  it("names the Firm plan from the offer's Starter figure and links to pricing", () => {
    expect(html).toContain(
      "Advisors who manage several businesses can add the Firm plan (from $299 a month). ",
    );
    expect(html).toContain('<a href="/pricing"');
    expect(html).toContain(">See pricing</a>.");
  });

  it("keeps the way in without an account and the footer", () => {
    expect(html).toContain("Continue without an account");
    expect(html).toContain('aria-label="Legal"');
  });
});
