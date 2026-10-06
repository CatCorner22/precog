import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { defaultProfile } from "@/lib/precog/practice-profile";
import { buildSharePayload } from "@/lib/precog/share/share-payload";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));
vi.mock("@/lib/precog/share/share-server", () => ({ loadMapShare: vi.fn() }));

import { LEGACY_SHARE_LINE, SharedMapView, sharedByLine } from "./share.$token";

const payload = buildSharePayload(defaultProfile("dental"), [
  { title: "Split cash handling", why: "One person counts and deposits.", effort: "low" },
]);

describe("the shared map page", () => {
  it("names who made the link and when the business was saved", () => {
    const line = sharedByLine({ sharedBy: "North Advisors", savedAt: "2026-10-03T15:00:00.000Z" });
    expect(line).toMatch(/^Shared by North Advisors · saved Oct \d, 2026$/);
    expect(sharedByLine({ sharedBy: "Ada Park", savedAt: "not a date" })).toBe(
      "Shared by Ada Park",
    );
    const html = renderToStaticMarkup(
      <SharedMapView
        payload={{ ...payload, sharedBy: "North Advisors", savedAt: "2026-10-03T15:00:00.000Z" }}
        expiresAt={null}
        redacted={false}
      />,
    );
    expect(html).toContain("Shared by North Advisors · saved");
    expect(html).not.toContain(LEGACY_SHARE_LINE);
  });

  it("still prints a link an older build stored as the browser sent it, and says so", () => {
    expect(payload).not.toHaveProperty("sharedBy");
    const html = renderToStaticMarkup(
      <SharedMapView payload={payload} expiresAt="2026-12-01T00:00:00.000Z" redacted={false} />,
    );
    expect(LEGACY_SHARE_LINE).toBe(
      "Shared before Precog built links from the saved business: the person who made this link sent these figures.",
    );
    expect(html).toContain(LEGACY_SHARE_LINE);
    expect(html).toContain(payload.businessName);
    expect(html).toContain("Split cash handling");
    expect(payload.processes.map((p) => p.name)).toContain("Payroll");
    expect(html).toContain("Payroll</p>");
  });
});
