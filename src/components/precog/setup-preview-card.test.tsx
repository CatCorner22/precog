import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { OwnTeamRow } from "@/lib/precog/onboarding/own-team";
import { NO_CASE_FOR_RULE, UNVERIFIED_CASE } from "@/lib/precog/evidence";
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

describe("SetupPreviewCard's case", () => {
  it("marks a citing case Unverified and calls it the same arrangement", () => {
    const html = renderToStaticMarkup(<SetupPreviewCard rows={rows} industry="dental" />);
    expect(html).toContain("The same arrangement");
    expect(html).toContain(UNVERIFIED_CASE.label);
    expect(html).toContain(UNVERIFIED_CASE.title);
    expect(html).not.toContain("A related arrangement");
  });

  it("says no prosecuted case shows the pair when no record cites the rule", () => {
    const html = renderToStaticMarkup(
      <SetupPreviewCard
        rows={[
          { name: "Bea", role: "IT lead", duties: ["manage_user_access", "export_bulk_data"] },
        ]}
        industry="dental"
      />,
    );
    expect(html).toContain(NO_CASE_FOR_RULE);
    expect(html).not.toContain("A related arrangement");
    expect(html).not.toContain(UNVERIFIED_CASE.label);
  });
});
