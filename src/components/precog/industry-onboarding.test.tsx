import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const practice = vi.hoisted(() => ({
  profile: { industry: "dental", practiceName: "", businessId: "biz_test" },
}));

vi.mock("@/lib/precog/practice-context", () => ({
  usePractice: () => ({
    profile: practice.profile,
    completeOnboarding: () => {},
    startOwnBusiness: () => {},
    setPlannedAbsences: () => {},
    cancelSetup: async () => {},
    setupReturnsTo: null,
  }),
}));

const { IndustryOnboarding } = await import("./industry-onboarding");

/** The first render, as the server draws it, with markup tags removed. */
function firstRender(practiceName: string) {
  practice.profile = { industry: "dental", practiceName, businessId: "biz_test" };
  const html = renderToStaticMarkup(<IndustryOnboarding />);
  return { html, text: html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ") };
}

describe("IndustryOnboarding, first render", () => {
  it("asks for the line of business as a named radio group and calls the fictional team the sample", () => {
    const { html, text } = firstRender("");
    expect(text).toContain("Which line of business is this?");
    expect(html).toContain('role="radiogroup" aria-labelledby="industry-onboarding-title"');
    expect(html.match(/role="radio"/g)).toHaveLength(8);
    expect(html.match(/aria-checked="true"/g)).toHaveLength(1);
    expect(text).toContain("Explore the sample instead");
    expect(text).not.toMatch(/\bdemo\b/i);
    expect(text).not.toMatch(/switch industry/);
  });

  it("opens a named business on its team grid with job-title wording and plural counts", () => {
    const { html, text } = firstRender("Ruiz Dental");
    expect(text).toContain("Your business and who does the money work");
    expect(text).toContain("0 people named · 1 row to review");
    expect(text).not.toContain("reload recovery");
    expect(html).toMatch(/<th[^>]*>Job title<\/th>/);
    expect(text).toContain("Choose a job title");
    expect(html).not.toMatch(/<option value="owner">/);
    expect(text).toContain("Add 1 person");
    expect(html).toContain('role="tooltip"');
    expect(html).toContain("max-w-3xl lg:max-w-7xl");
    // The grid comes before the ways to fill it faster.
    expect(html.indexOf("<table")).toBeLessThan(html.indexOf("Fill the table faster"));
  });
});
