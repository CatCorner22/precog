import type { ComponentType } from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ShareGate } from "@/components/precog/share-gate";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));
vi.mock("@/lib/precog/share/share-server", () => ({ loadReportShare: vi.fn() }));

import { Route, SHARED_REPORT_TITLE, SHARED_REPORT_UNAVAILABLE } from "./share.report.$token";

type RouteLike = {
  options: {
    component: ComponentType;
    head: () => { meta: Array<{ title?: string; name?: string; content?: string }> };
  };
};

const route = Route as unknown as RouteLike;
const source = readFileSync(new URL("./share.report.$token.tsx", import.meta.url), "utf8").replace(
  /\s+/g,
  " ",
);

describe("the shared report page", () => {
  it("is titled for a report and kept out of search engines", () => {
    const meta = route.options.head().meta;
    expect(SHARED_REPORT_TITLE).toBe("Shared report · Precog");
    expect(meta).toContainEqual({ title: "Shared report · Precog" });
    expect(meta).toContainEqual({ name: "robots", content: "noindex, nofollow" });
    expect(meta).toContainEqual({
      name: "description",
      content: "Read-only view of a locked internal control priorities report, as issued.",
    });
  });

  it("heads a link that does not open with the report's own heading", () => {
    expect(SHARED_REPORT_UNAVAILABLE).toBe("Shared report unavailable");
    expect(source).toContain("heading={SHARED_REPORT_UNAVAILABLE}");
    const html = renderToStaticMarkup(
      <ShareGate
        reason="unavailable"
        heading={SHARED_REPORT_UNAVAILABLE}
        onRetry={() => undefined}
        onPasscode={() => undefined}
      />,
    );
    expect(html).toContain("Shared report unavailable");
    expect(html).toContain("This link is not valid.");
    expect(html).toContain("Go to Precog");
    expect(html).not.toContain("Try again");
    // A network failure offers a retry; the map page keeps its own heading.
    const network = renderToStaticMarkup(
      <ShareGate
        reason="network"
        heading="Shared map unavailable"
        onRetry={() => undefined}
        onPasscode={() => undefined}
      />,
    );
    expect(network).toContain("Shared map unavailable");
    expect(network).toContain("Try again");
  });

  it("asks for the passcode with the same form as a shared map", () => {
    const html = renderToStaticMarkup(
      <ShareGate
        reason="passcode"
        heading={SHARED_REPORT_UNAVAILABLE}
        onRetry={() => undefined}
        onPasscode={() => undefined}
      />,
    );
    expect(html).toContain("Passcode required");
    expect(html).toContain("Enter the passcode provided by the owner.");
    expect(html).toContain('id="share-passcode"');
    expect(html).toContain('type="password"');
    expect(html).toContain(">Open</button>");
    expect(html).not.toContain("Shared report unavailable");
  });

  it("marks the field invalid and described after a wrong guess, valid before the first", () => {
    const first = renderToStaticMarkup(
      <ShareGate
        reason="passcode"
        heading={SHARED_REPORT_UNAVAILABLE}
        onRetry={() => undefined}
        onPasscode={() => undefined}
      />,
    );
    expect(first).toContain('aria-invalid="false"');
    expect(first).toContain('aria-describedby="share-passcode-message"');
    const wrong = renderToStaticMarkup(
      <ShareGate
        reason="passcode_wrong"
        heading={SHARED_REPORT_UNAVAILABLE}
        onRetry={() => undefined}
        onPasscode={() => undefined}
      />,
    );
    expect(wrong).toContain('aria-invalid="true"');
    expect(wrong).toContain('id="share-passcode-message"');
  });

  it("prints the version through the report renderer, read-only and without a cover page", () => {
    expect(source).toContain("Read-only share · version {version.versionNo}");
    expect(source).toContain("` · issued ${formatDay(version.reviewedAt)}`");
    expect(source).toContain("` · expires ${formatDay(expiresAt)}`");
    // The bar's Print is the page's one print control: ControlReport's own
    // toolbar stays off under `shared` (control-report.test.tsx).
    expect(source).toContain("onClick={() => window.print()}");
    expect(source).toContain("> Print </button>");
    expect(source).not.toContain("Print / Save as PDF");
    expect(source).toContain(
      "<report.ControlReport locked={version} frozen={frozen} firm={firm} coverPage={false} shared />",
    );
    expect(source).toContain("Loading shared report…");
  });
});
