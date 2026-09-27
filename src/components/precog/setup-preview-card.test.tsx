import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { OwnTeamRow } from "@/lib/precog/onboarding/own-team";
import { SetupPreviewCard } from "./setup-preview-card";

const rows: OwnTeamRow[] = [
  { name: "Ana Ruiz", role: "Owner", duties: [], owner: true },
  {
    name: "Ben Cole",
    role: "Office Manager",
    duties: ["collect_cash", "post_payments", "prepare_deposit", "bank_reconcile"],
    owner: false,
  },
];

describe("SetupPreviewCard", () => {
  it("renders the finding without a live region on the card and announces it once in a separate one", () => {
    const html = renderToStaticMarkup(<SetupPreviewCard rows={rows} industry="dental" />);
    expect(html).toContain("data-setup-preview");
    expect(html).not.toContain("aria-live");
    expect(html).not.toContain("Updating provisional findings");
    const live = html.match(/<p class="sr-only" role="status">([^<]*)<\/p>/);
    expect(live?.[1]).toMatch(/^Provisional first duty conflict: Ben Cole holds both /);
    expect(html).toContain('aria-busy="false"');
    expect(html).not.toContain("at a any business");
  });

  it("says nothing while no one has a duty", () => {
    const html = renderToStaticMarkup(
      <SetupPreviewCard rows={[{ name: "", role: "", duties: [] }]} industry="dental" />,
    );
    expect(html).toBe('<p class="sr-only" role="status"></p>');
  });
});
