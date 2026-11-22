import { createElement, type ComponentType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({
    options,
    useLoaderData: () => ({ sections: [], keywords: [] }),
    useSearch: () => ({}),
  }),
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));
vi.mock("@/lib/compliance/cards-server", () => ({
  complianceIndexFn: vi.fn(),
  searchComplianceCardsFn: vi.fn(),
}));

import { Route } from "./desk";

type RouteLike = {
  options: {
    component: ComponentType;
    head: () => { meta: Array<{ title?: string; name?: string; content?: string }> };
  };
};

const { options } = Route as unknown as RouteLike;
const html = renderToStaticMarkup(createElement(options.component));

describe("BlakeGPT compliance desk", () => {
  it("renders as a public route with a cited-rule search", () => {
    expect(options.head().meta.find((meta) => meta.title)?.title).toBe(
      "Compliance desk | BlakeGPT",
    );
    expect(options.head().meta.find((meta) => meta.name === "description")?.content).toBe(
      "Search 255 cited Tennessee and federal rule cards for the dental office.",
    );
    expect(html).toContain(
      "Search 255 cited Tennessee and federal rule cards for the dental office.",
    );
    expect(html).toContain('<a href="/licenses">Each license</a>');
    expect(html).toContain('<a href="/map">Office map</a>');
    expect(html).toContain("Ask about a rule, for example: sharps disposal");
    expect(html).toContain('aria-label="Filter by section"');
    expect(html).toContain(">Contents</h2>");
    expect(html).toContain(">Keyword index</h2>");
  });

  it("shows the dental Reverie header and the fixed privacy note", () => {
    expect(html).toContain(
      '<img src="/reverie/reverie-dental.webp" alt="Reverie, the dental compliance cat" width="512" height="512" loading="lazy"',
    );
    expect(html).toContain(
      "Research aid, not legal advice. Never enter patient names or other personal information.",
    );
  });

  it("uses a filter-dependent lawyer illustration without asking for account state", () => {
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain(">All sections</button>");
    expect(html).not.toContain("/login");
    expect(html).not.toContain("/reverie/reverie-lawyer.webp");
  });
});
