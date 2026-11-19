import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({
    options,
    useLoaderData: () => ({
      functions: Array.from({ length: 17 }, (_, index) => ({
        id: index + 10,
        title: `Function ${index + 1}`,
        risks: ["Risk"],
        sops: ["SOP"],
        controls: ["Control"],
        metrics: ["Metric"],
      })),
      sections: [],
    }),
  }),
}));
vi.mock("@/lib/practice/reference-server", () => ({
  listPracticeReferenceFn: vi.fn(),
  searchPracticeReferenceFn: vi.fn(),
}));

import { Route } from "./practice";

type RouteLike = {
  options: {
    component: ComponentType;
    head: () => { meta: Array<{ title?: string; name?: string; content?: string }> };
  };
};

const { options } = Route as unknown as RouteLike;
const html = renderToStaticMarkup(createElement(options.component));

describe("BlakeGPT practice desk", () => {
  it("renders the operations reference and its 17-function picker", () => {
    expect(options.head().meta.find((meta) => meta.title)?.title).toBe("Practice desk | BlakeGPT");
    expect(html.match(/type="button"/g)).toHaveLength(17);
    expect(html).toContain('aria-label="Practice functions"');
    expect(html).toContain("Function 1");
    expect(html).toContain("Risks");
    expect(html).toContain("SOPs");
    expect(html).toContain("Controls");
    expect(html).toContain("Metrics");
  });

  it("uses dental Reverie art, includes the two-deep note, and keeps the exact footer", () => {
    expect(html).toContain(
      '<img src="/reverie/reverie-dental.webp" alt="Reverie, the dental practice operations cat" width="512" height="512" loading="lazy"',
    );
    expect(html).toContain("Two-deep coverage");
    expect(html).toContain(
      '<footer class="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 px-4 py-3 text-center text-xs leading-5 text-muted backdrop-blur">Operations reference, not legal advice.</footer>',
    );
  });
});
