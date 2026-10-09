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

const { IndustryOnboarding, MappingScopeAttestation } = await import("./industry-onboarding");

/** The first render, as the server draws it, with markup tags removed. */
function firstRender(
  practiceName: string,
  industry = "dental",
  initialStep?: "industry" | "questions" | "money" | "team",
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
    expect(text).toContain("Explore the fictional sample");
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

  it("opens the money step after the setup questions", () => {
    const { html, text } = firstRender("Ruiz Dental", "dental", "money");
    expect(text).toContain("How money moves here");
    expect(text).toContain("How money moves");
    expect(text).toContain("What already runs");
    expect(text).toContain("Next: your team");
    expect(text).toContain("Skip these questions");
    expect(html.match(/role="radiogroup"/g)).toHaveLength(11);
    expect(text).not.toContain("Your business and who does the money work");
  });

  it("uses board-member wording for nonprofit setup", () => {
    const { text } = firstRender("Community Co", "nonprofit", "money");
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

  it("says under the header that the business is kept only once setup finishes", () => {
    const { html, text } = firstRender("Ruiz Dental", "dental", "team");
    const notice =
      "Precog keeps this business once you press “Show me my gaps”. Until then your answers stay in this browser tab, even through a reload.";
    expect(text).toContain(notice);
    expect(html.indexOf("Precog keeps this business")).toBeLessThan(html.indexOf("<table"));
    expect(text).not.toContain("Your progress stays in this tab until you finish.");
    expect(text).not.toContain("it stays only in this browser tab");
  });

  it("ticks none of the owner row's duties: the job title's suggestions wait in the review", () => {
    for (const industry of ["dental", "nonprofit"]) {
      const { html, text } = firstRender("Ruiz Dental", industry, "team");
      const dutyBoxes = html.match(/<input type="checkbox"[^>]*aria-label="[^"]*: [^"]*"[^>]*>/g);
      expect(dutyBoxes?.length).toBeGreaterThan(5);
      expect(dutyBoxes?.filter((box) => /\schecked/.test(box))).toEqual([]);
      // No tag under the title stands for a suggested duty either.
      expect(html).not.toMatch(/aria-label="[^"]*: other duties"/);
      expect(text).not.toContain("check the suggested ticks");
      expect(text).toMatch(
        /The job title suggests \d+ duties\. Keep or remove each below the table\./,
      );
      expect(text).not.toContain("From the job title, not counted yet");
    }
  });

  it("makes the duty catalog discoverable and explains the one-person completion choice", () => {
    const { html, text } = firstRender("Ruiz Dental", "dental", "team");
    expect(html).toMatch(
      /<summary class="[^"]*border[^"]*">Review suggested duties for \d+ job titles<\/summary>/,
    );
    expect(text).toContain(
      "These duties are starting points to review, not proof of anyone’s actual access.",
    );
    expect(text).toContain(
      "You can continue with one person. Precog will assess that sole-owner setup; add the rest of your team later under Team for a fuller team assessment.",
    );
    expect(html).toContain("<button");
    expect(text).toContain("Show me my gaps");
  });
});

describe("large-roster scope attestation", () => {
  it("uses a keyboard-native radio group and announces scoped, incomplete coverage", () => {
    const html = renderToStaticMarkup(
      <MappingScopeAttestation
        scope="one_team"
        unresolvedRows={60}
        scopedAssessment
        onChoose={() => {}}
      />,
    );
    const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    expect(html).toContain("<fieldset");
    expect(html.match(/type="radio"/g)).toHaveLength(3);
    expect(html).toContain('name="mapping_scope"');
    expect(html).toContain('role="status"');
    expect(text).toContain("60 valid roster rows are not in the review grid");
    expect(text).toContain("Unknown or unresolved people earn no control credit");
    expect(text).toContain("scoped map");
    expect(text).toContain("not fully assessed");
  });
});
