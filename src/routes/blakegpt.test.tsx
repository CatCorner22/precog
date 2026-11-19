import { createElement, type ComponentType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

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

import { Route } from "./blakegpt";

type RouteLike = {
  options: {
    component: ComponentType;
    head: () => { meta: Array<{ title?: string; name?: string; content?: string }> };
  };
};

const { options } = Route as unknown as RouteLike;
const html = renderToStaticMarkup(createElement(options.component));

describe("BlakeGPT home", () => {
  it("renders its title and one welcome line without requiring account state", () => {
    expect(options.head().meta.find((meta) => meta.title)?.title).toBe("BlakeGPT");
    expect(html).toContain(">BlakeGPT</p>");
    expect(html).toContain("Welcome, Amanda. Your practice has a clear place to begin.");
  });

  it("offers six modules and resolves Frontier GRC to Voyager's real tab", () => {
    expect(html.match(/<article\b/g)).toHaveLength(6);
    expect(html).toContain("Internal controls and continuity for the practice.");
    expect(html).toContain(
      "Checks for invoices, notice deadlines, duty conflicts and policy wording.",
    );
    expect(html).toContain("Cited Tennessee and federal rules for the dental office.");
    expect(html).toContain("Check study numbers, design flaws, and evidence grades.");
    expect(html).toContain(
      "Operating functions, SOPs, controls, and metrics for a dental practice.",
    );
    expect(html).toContain(
      "What each Tennessee dental license may do, with cited rules and cautions.",
    );
    expect(html).toMatch(/href="\/"[^>]*>Open Precog<\/a>/);
    expect(html).toMatch(/href="\/\?tab=pioneer"[^>]*>Open checks<\/a>/);
    expect(html).toMatch(/href="\/desk"[^>]*>Open the desk<\/a>/);
    expect(html).toMatch(/href="\/evidence"[^>]*>Open the evaluator<\/a>/);
    expect(html).toMatch(/href="\/practice"[^>]*>Open the reference<\/a>/);
    expect(html).toMatch(/href="\/licenses"[^>]*>Open licenses<\/a>/);
  });

  it("uses Reverie's unaltered hero art and a phone-to-desktop card grid", () => {
    expect(html).toContain(
      '<img src="/reverie/reverie-friendly-face.webp" alt="Reverie smiles in welcome." width="512" height="512"',
    );
    expect(html).toContain('aria-label="BlakeGPT modules"');
    expect(html).toContain("sm:grid-cols-2 lg:grid-cols-3");
  });
});
