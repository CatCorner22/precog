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

// The legal footer's links render as plain anchors outside a router.
vi.mock("@tanstack/react-router", async (original) => ({
  ...(await original<typeof import("@tanstack/react-router")>()),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

const { IndustryOnboarding } = await import("./industry-onboarding");

/** The first render, as the server draws it, with markup tags removed. */
function firstRender(
  practiceName: string,
  industry = "dental",
  initialStep?: "industry" | "money" | "team",
) {
  practice.profile = { industry, practiceName, businessId: "biz_test" };
  const html = renderToStaticMarkup(<IndustryOnboarding initialStep={initialStep} />);
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

  it("links the privacy notice and the terms on the first step, and names Business settings", () => {
    const { html, text } = firstRender("");
    expect(html).toContain('<a href="/privacy">Privacy</a>');
    expect(html).toContain('<a href="/terms">Terms</a>');
    expect(text).toContain(
      "You can change the line of business later in Business settings, from the business menu.",
    );
    expect(text).not.toContain("Business profile");
  });

  it("opens a named business on the money step", () => {
    const { html, text } = firstRender("Ruiz Dental");
    expect(text).toContain("How money moves here");
    expect(text).toContain("How money moves");
    expect(text).toContain("What already runs");
    expect(text).toContain("Next: your team");
    expect(text).toContain("Skip these questions");
    expect(html.match(/role="radiogroup"/g)).toHaveLength(11);
    expect(text).not.toContain("Your business and who does the money work");
  });

  it("uses board-member wording for nonprofit setup", () => {
    const { text } = firstRender("Community Co", "nonprofit");
    expect(text).toContain("Does a board member open and read the bank statement each month?");
  });

  it("opens a named business on its team grid with job-title wording and plural counts", () => {
    const { html, text } = firstRender("Ruiz Dental", "dental", "team");
    expect(text).toContain("Your business and who does the money work");
    expect(text).toContain("0 people named · 1 row to review");
    expect(text).not.toContain("reload recovery");
    expect(html).toMatch(/<th[^>]*>Job title<\/th>/);
    expect(text).toContain("Choose a job title");
    expect(html).not.toMatch(/<option value="owner">/);
    expect(text).toContain("Add 1 person");
    expect(html).toContain('role="tooltip"');
    expect(html).toContain("max-w-3xl lg:max-w-7xl");
    expect(html.indexOf("<table")).toBeLessThan(html.indexOf("Fill the table faster"));
  });
});
