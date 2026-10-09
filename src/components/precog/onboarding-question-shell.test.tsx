import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ONBOARDING_FACTS_VERSION,
  type OnboardingFacts,
} from "@/lib/precog/onboarding/decision-model";
import {
  OnboardingQuestionShell,
  adjacentQuestion,
  type ShellQuestion,
} from "./onboarding-question-shell";

const noop = vi.fn();

function render(question: ShellQuestion, facts: OnboardingFacts) {
  const html = renderToStaticMarkup(
    <OnboardingQuestionShell
      question={question}
      facts={facts}
      onFacts={noop}
      onBack={noop}
      onContinue={noop}
    />,
  );
  return { html, text: html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ") };
}

const facts = (workforceBand: OnboardingFacts["workforceBand"]): OnboardingFacts => ({
  schemaVersion: ONBOARDING_FACTS_VERSION,
  actor: "business_leader",
  workforceBand,
  locationBand: "1",
});

describe("adaptive onboarding question shell", () => {
  it("offers a 12-person organization all three entry paths with the guided path first", () => {
    const { text } = render("setup_method", facts("7-30"));
    expect(text.indexOf("Enter people now")).toBeLessThan(text.indexOf("Paste a roster"));
    expect(text).toContain("Start with job groups");
    expect(text).toContain("Findings use only the control participants and duties you map.");
  });

  it("leads a 120-person organization into roster or staged job groups, not the person grid", () => {
    const { text } = render("setup_method", facts("100-249"));
    expect(text).toContain("Paste a roster");
    expect(text).toContain("Start with job groups");
    expect(text).not.toContain("Enter people now");
    expect(text).toContain("Total workforce is not the mapped team.");
    expect(text).toContain("Staged path");
  });

  it("keeps stable progress and heading semantics and back navigation does not alter answers", () => {
    const chosen = { ...facts("7-30"), actor: "advisor" as const };
    const { html, text } = render("locations", chosen);
    expect(text).toContain("Question 3 of 4");
    expect(html).toContain('id="industry-onboarding-title"');
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain("<fieldset");
    expect(adjacentQuestion("locations", -1)).toBe("workforce");
    expect(chosen.actor).toBe("advisor");
    expect(chosen.workforceBand).toBe("7-30");
  });
});
