import { createElement, type ComponentType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CASE_COUNT, VERIFIED_CASE_COUNT } from "@/lib/precog/evidence/case-count";

// The page renders outside a router: Link becomes a plain anchor (its search
// is written out as a query) and createFileRoute hands back its options.
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  Link: ({
    children,
    to,
    search,
  }: {
    children: ReactNode;
    to: string;
    search?: Record<string, unknown>;
  }) => (
    <a href={search ? `${to}?${new URLSearchParams(search as Record<string, string>)}` : to}>
      {children}
    </a>
  ),
}));

import { Route } from "./welcome";

type RouteLike = {
  options: {
    component: ComponentType;
    head: () => {
      meta: Array<{ title?: string; name?: string; property?: string; content?: string }>;
    };
  };
};

const { options } = Route as unknown as RouteLike;
const Page = options.component;
const html = renderToStaticMarkup(<Page />);

describe("the landing page", () => {
  it("describes itself for a share preview and leaves the title to the root", () => {
    const meta = options.head().meta;
    expect(meta.find((m) => m.title)).toBeUndefined();
    expect(meta.find((m) => m.name === "description")?.content).toBe(
      "Precog shows a small-business owner who can move money alone, what one absence would stop, and which fix to make this week.",
    );
    // The share description is the page's own; the root's og:title stands.
    expect(meta.find((m) => m.property === "og:title")).toBeUndefined();
    expect(meta.find((m) => m.property === "og:description")?.content).toBe(
      meta.find((m) => m.name === "description")?.content,
    );
  });

  it("prints the eyebrow, the heading and the one-paragraph pitch", () => {
    expect(html).toContain(">Precog</p>");
    expect(html).toContain(">See who in your business can move or hide money alone</h1>");
    expect(html).toContain(
      "Precog maps who holds which money duties, shows what stops when one person is away, and tells you what to check each month.</p>",
    );
    expect(html).not.toContain("prosecuted cases behind the findings");
  });

  it("says where the case records come from and that Precog is still checking them", () => {
    expect(VERIFIED_CASE_COUNT).toBeLessThan(CASE_COUNT);
    expect(html).toContain(
      `${CASE_COUNT} U.S. federal fraud cases from Justice Department and IRS releases back the findings. Precog is still checking each record against its source.`,
    );
    expect(html).toContain(
      "53 U.S. federal fraud cases from Justice Department and IRS releases back the findings.",
    );
    expect(html).not.toContain("Every finding links to one of");
  });

  it("says the records are checked once every one is, without claiming every finding links to a case", async () => {
    vi.resetModules();
    vi.doMock("@/lib/precog/evidence/case-count", () => ({
      CASE_COUNT: 53,
      VERIFIED_CASE_COUNT: 53,
    }));
    const { Route: Verified } = await import("./welcome");
    const page = (Verified as unknown as RouteLike).options.component;
    const verifiedHtml = renderToStaticMarkup(createElement(page));
    vi.doUnmock("@/lib/precog/evidence/case-count");
    expect(verifiedHtml).toContain(
      "The findings draw on 53 U.S. federal fraud cases from Justice Department and IRS releases, each checked against its source.",
    );
    // A business whose gaps match no case reads "No case in the library shows
    // these exact pairs" in its report, so the page never promises a link.
    expect(verifiedHtml).not.toContain("Every finding links");
    expect(verifiedHtml).not.toContain("still checking");
  });

  it("sends a visitor into setup with the start key, or to sign-in", () => {
    expect(html).toContain('href="/?start=true"');
    expect(html).toContain("Set up your business");
    expect(html).toContain('href="/login"');
    expect(html).toContain(">Sign in</a>");
  });

  it("offers the sample to a visitor who is just looking", () => {
    expect(html).toContain(">Explore a sample business</a>");
    expect(html).toContain("its team is fictional and every gap says so");
  });

  it("shows Precog's own share picture as the illustration", () => {
    expect(html).toContain('<img src="/og.svg" alt=""');
  });

  it("names the firm offer with links to pricing and the firm workspace, plus the footer", () => {
    expect(html).toContain(
      "Accountants and advisors: run several client businesses on the Firm plan.",
    );
    expect(html).toContain('<a href="/pricing"');
    expect(html).toContain(">See pricing</a>");
    expect(html).toContain('<a href="/firm"');
    expect(html).toContain(">Firm workspace</a>");
    expect(html).toContain('aria-label="Legal"');
  });

  it("names no person and no case", () => {
    expect(html).not.toMatch(/\bv\. /);
    expect(html).not.toMatch(/United States/);
  });
});
