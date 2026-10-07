import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HowThisWorks, PageIntro } from "./page-intro";

describe("PageIntro", () => {
  it("names the page after its tab, states one purpose, and folds the method", () => {
    const html = renderToStaticMarkup(
      <PageIntro tab="sod" purpose="Who can move money on their own." method={<p>The rules.</p>} />,
    );
    expect(html).toMatch(/<h1[^>]*>Who controls what<\/h1>/);
    expect(html).toContain("Who can move money on their own.");
    expect(html).toMatch(/<details(?! open)[^>]*><summary[^>]*>.*How this works<\/summary>/);
    expect(html).toContain("<p>The rules.</p>");
  });

  it("uses the alias wording for a sub-view and omits the fold when there is no method", () => {
    const html = renderToStaticMarkup(<PageIntro tab="residual" purpose="What is left." />);
    expect(html).toMatch(/<h1[^>]*>What is still exposed<\/h1>/);
    expect(html).not.toContain("<details");
  });

  it("HowThisWorks is closed by default and can carry its own summary", () => {
    const html = renderToStaticMarkup(
      <HowThisWorks summary="Why this order">Because.</HowThisWorks>,
    );
    expect(html).not.toContain("<details open");
    expect(html).toContain("Why this order</summary>");
    expect(html).toContain("Because.");
  });
});
