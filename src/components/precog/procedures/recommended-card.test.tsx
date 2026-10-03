import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { resolveTemplate } from "@/lib/precog/active-template";
import type { IndustryId } from "@/lib/precog/industry";
import { defaultProfile } from "@/lib/precog/practice-profile";
import { libraryRows } from "@/lib/precog/procedures/library";
import { RecommendedCard } from "./recommended-card";

const noop = () => {};

/**
 * The card as the Procedures screen mounts it for this line of business's
 * sample, with the stock count shown as one that fits: a sample whose team
 * and register do not call for it lists it only under "Show all", which a
 * static render cannot press.
 */
function cardHtml(industry: IndustryId): string {
  const profile = defaultProfile(industry);
  const tpl = resolveTemplate(profile);
  const rows = libraryRows(tpl, [], profile.industry);
  const row = rows.find((r) => r.recommendation.id === "lib-cycle-count");
  expect(row, industry).toBeDefined();
  return renderToStaticMarkup(
    <RecommendedCard
      rows={[{ ...row!, fits: true }]}
      industry={profile.industry}
      itemName={(id) => tpl.knowledge.find((k) => k.id === id)?.name}
      nameOf={(id) => tpl.people.find((p) => p.id === id)?.name ?? null}
      disabled={false}
      onStart={noop}
    />,
  );
}

describe("the recommended card's fallback text", () => {
  it("shows a retail business its own quarterly count", () => {
    const html = cardHtml("retail");
    expect(html).toContain("If you cannot separate this duty");
    expect(html).toContain(
      "Do a full count every quarter, with a second person present who does not keep the stock.",
    );
    expect(html).not.toContain("at least once a year");
  });

  it("shows a dental practice the shared yearly count", () => {
    const html = cardHtml("dental");
    expect(html).toContain("If you cannot separate this duty");
    expect(html).toContain(
      "Count everything at least once a year with a second person present who does not keep the stock.",
    );
    expect(html).not.toContain("every quarter");
  });
});
