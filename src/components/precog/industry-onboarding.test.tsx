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

  it("links the privacy notice and the terms on the first step, and names Business settings", () => {
    const { html, text } = firstRender("");
    expect(html).toContain('<a href="/privacy">Privacy</a>');
    expect(html).toContain('<a href="/terms">Terms</a>');
    expect(text).toContain(
      "You can change the line of business later in Business settings, from the business menu.",
    );
    expect(text).not.toContain("Business profile");
  });

  it("opens a named business on the accessible setup questions before its team grid", () => {
    const { html, text } = firstRender("Ruiz Dental");
    expect(text).toContain("Question 1 of 4");
    expect(text).toContain("What is your role here?");
    expect(html).toContain('aria-labelledby="industry-onboarding-title"');
    expect(html).toContain('tabindex="-1"');
    expect(html.match(/type="radio"/g)).toHaveLength(3);
    expect(text).not.toContain("Your business and who does the money work");
  });
});
