import type { ComponentType, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The page renders outside a router, so Link becomes a plain anchor and
// createFileRoute hands back its options with loader and search values.
const search = vi.hoisted(() => ({ error: undefined as string | undefined }));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({
    options,
    useLoaderData: () => ({ configured: false, prices: null }),
    useSearch: () => ({ error: search.error }),
  }),
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));
vi.mock("@/lib/auth/client", () => ({
  authClient: {},
  authEnabled: true,
  signInErrorMessage: (code: string) =>
    code === "invalid_token"
      ? "That link has expired, or someone already used it. Sign in to get a new confirmation link, or use Forgot password for a new password link."
      : `Precog could not finish the sign-in (code "${code}"). Try again in a moment.`,
}));
vi.mock("@/lib/auth/email-password", () => ({
  emailAndPasswordEnabled: true,
  PASSWORD_MIN_LENGTH: 8,
}));
vi.mock("@/lib/precog/billing/server", () => ({ getPlanPrices: vi.fn() }));

import { Route } from "./login";

type RouteLike = { options: { component: ComponentType } };

const Page = (Route as unknown as RouteLike).options.component;

describe("the sign-in page", () => {
  it("names the Firm plan from the offer's Starter figure and links to pricing", () => {
    const html = renderToStaticMarkup(<Page />);
    expect(html).toContain(
      "Advisors who manage several businesses can add the Firm plan (from $299 a month). ",
    );
    expect(html).toContain('<a href="/pricing"');
    expect(html).toContain(">See pricing</a>.");
  });

  it("keeps the way in without an account and the footer", () => {
    const html = renderToStaticMarkup(<Page />);
    expect(html).toContain("Continue without an account");
    expect(html).toContain('aria-label="Legal"');
  });

  it("posts credentials and disables submit in server-rendered HTML", () => {
    const html = renderToStaticMarkup(<Page />);
    const form = html.match(/<form\b[^>]*>/)?.[0] ?? "";
    const submitButton = html.match(/<button\b[^>]*>Sign in with email<\/button>/)?.[0] ?? "";

    expect(form).toContain('method="post"');
    expect(submitButton).toContain("disabled");
  });

  it("shows the mapped confirmation error from the search string", () => {
    search.error = "invalid_token";
    const html = renderToStaticMarkup(<Page />);
    search.error = undefined;
    expect(html).toContain('role="alert"');
    expect(html).toContain(
      "That link has expired, or someone already used it. Sign in to get a new confirmation link, or use Forgot password for a new password link.",
    );
  });
});
