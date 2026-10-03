import type { ComponentType, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CASE_COUNT } from "@/lib/precog/evidence/case-count";

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
    head: () => { meta: Array<{ title?: string; name?: string; content?: string }> };
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
  });

  it("prints the eyebrow, the heading and the one-paragraph pitch", () => {
    expect(html).toContain(">Precog</p>");
    expect(html).toContain(">See who in your business can move or hide money alone</h1>");
    expect(html).toContain(
      "Precog maps who holds which money duties, shows what stops when one person is away, and tells you what to check each month, with prosecuted cases behind the findings.",
    );
  });

  it("prints the case count from the constant, never a typed figure", () => {
    expect(html).toContain(`${CASE_COUNT} prosecuted cases behind the findings.`);
    expect(html).toContain("53 prosecuted cases behind the findings.");
  });

  it("sends a visitor into setup with the start key, or to sign-in", () => {
    expect(html).toContain('href="/?start=true"');
    expect(html).toContain("Set up your business");
    expect(html).toContain('href="/login"');
    expect(html).toContain(">Sign in</a>");
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
