import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ReportSharePanel } from "./report-share-panel";
import { REPORT_SHARE_EXPIRIES, REPORT_SHARE_NOTE } from "./report-share-panel-text";

vi.mock("@/lib/precog/share/share-server", () => ({
  createReportShare: vi.fn(),
  listMapShares: vi.fn(() => Promise.resolve([])),
  revokeMapShare: vi.fn(),
}));

// The create and revoke calls run on a click, which a static render cannot
// make; their shape is pinned from the source, as the join page's lines are.
const source = readFileSync(new URL("./report-share-panel.tsx", import.meta.url), "utf8").replace(
  /\s+/g,
  " ",
);

describe("the report share panel", () => {
  const html = renderToStaticMarkup(
    <ReportSharePanel versionId="rv_1" versionNo={3} onClose={() => undefined} />,
  );

  it("says what the link carries before the link is made", () => {
    expect(REPORT_SHARE_NOTE).toBe(
      "The link carries this business's names, duties and review notes as the version prints them. Anyone with the link can open it until it expires or you revoke it.",
    );
    expect(html).toContain(
      "The link carries this business&#x27;s names, duties and review notes as the version prints them.",
    );
    expect(html).toContain('aria-label="Share version 3"');
  });

  it("offers an expiry of 7, 30 or 90 days, an optional passcode and Create link", () => {
    expect(REPORT_SHARE_EXPIRIES).toEqual([7, 30, 90]);
    expect(html).toContain("Expires in");
    for (const days of [7, 30, 90]) expect(html).toContain(`>${days} days<`);
    expect(html).not.toContain(">180 days<");
    expect(html).toContain("Optional passcode");
    expect(html).toContain("Create link");
    expect(html).toContain('aria-label="Close sharing"');
  });

  it("creates a report link for the version and revokes one by its token", () => {
    expect(source).toContain(
      "createReportShare({ data: { versionId, expiresInDays: days, passcode }, })",
    );
    expect(source).toContain('toast.success("Share link created and copied"');
    expect(source).toContain("revokeMapShare({ data: { token } })");
    expect(source).toContain('toast("Link revoked")');
    expect(source).toContain("> Revoke </button>");
    // Only this version's live report links are listed; map links stay in the map builder.
    expect(source).toContain('l.kind === "report" && l.reportVersionId === versionId');
    expect(source).toContain("`${origin}/share/report/${token}`");
  });
});
