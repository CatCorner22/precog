import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
}));
vi.mock("@/lib/evidence/reference-server", () => ({
  getEvidenceModule: vi.fn(),
  listBenchmarkStudies: vi.fn(),
  listEvidenceModules: vi.fn(),
}));

import { Route } from "./evidence";

type RouteLike = {
  options: {
    component: ComponentType;
    head: () => { meta: Array<{ title?: string; name?: string; content?: string }> };
  };
};

const { options } = Route as unknown as RouteLike;
const html = renderToStaticMarkup(createElement(options.component));

describe("Study evaluator", () => {
  it("renders the five sections and the research-aid footer in SSR output", () => {
    expect(options.head().meta.find((meta) => meta.title)?.title).toBe(
      "Study evaluator | BlakeGPT",
    );
    expect(html).toContain("Check the numbers");
    expect(html).toContain("Spot design flaws");
    expect(html).toContain("Grade a study");
    expect(html).toContain("Worked examples");
    expect(html).toContain("Reference");
    expect(html).toContain("Research aid, not medical advice.");
  });

  it("uses the reading Reverie art and accessible analysis tabs", () => {
    expect(html).toContain(
      '<img src="/reverie/reverie-reading-book.webp" alt="Reverie reads a book while checking study evidence."',
    );
    expect(html).toContain('role="tablist" aria-label="Analysis type"');
    expect(html).toContain("Before-and-after");
  });
});
