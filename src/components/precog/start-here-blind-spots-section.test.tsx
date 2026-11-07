import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { defaultProfile, type PracticeProfile } from "@/lib/precog/practice-profile";
import { ONBOARDING_FACTS_VERSION } from "@/lib/precog/onboarding/decision-model";
import { ReadOnlyPracticeProvider } from "@/lib/precog/read-only-practice";
import { StartHereBlindSpotsSection } from "./start-here-blind-spots-section";

const render = (profile: PracticeProfile) =>
  renderToStaticMarkup(
    <ReadOnlyPracticeProvider profile={profile}>
      <StartHereBlindSpotsSection />
    </ReadOnlyPracticeProvider>,
  );

describe("Start here, Before it bites", () => {
  it("leads with the head count line and groups the traps worst first", () => {
    const html = render({
      ...defaultProfile("construction"),
      onboardingFacts: { schemaVersion: ONBOARDING_FACTS_VERSION, workforceCount: 9 },
    });
    expect(html).toContain("Before it bites");
    expect(html).toContain("At 9 on payroll, 2 more hires switches on: OSHA injury log");
    expect(html).toContain("Already in force at 9:");
    const order = [
      "You pay personally",
      "Money that does not come back",
      "The doors stay closed",
      "Fines and penalties",
    ].map((label) => html.indexOf(label));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(order[0]).toBeGreaterThan(-1);
    expect(html).toContain("An uninsured subcontractor becomes your payroll at audit");
    expect(html).not.toContain("Three missed 990s");
  });

  it("folds a handled trap behind a count and shows the answer on the rest", () => {
    const html = render({
      ...defaultProfile("general"),
      blindSpotAnswers: [
        { id: "digital-keys", answer: "handled", on: "2026-11-01" },
        { id: "owner-incapacity", answer: "unsure", on: "2026-11-02" },
      ],
    });
    expect(html).toContain("1 handled");
    expect(html).not.toContain("Someone else may hold the keys");
    expect(html).toContain("Not sure 2026-11-02");
    expect(html).toMatch(/\d+ of \d+ still open\. 1 handled\./);
  });

  it("gives every trap its three answers and a source link", () => {
    const html = render(defaultProfile("dental"));
    const groups = html.match(/aria-label="Answer: /g) ?? [];
    expect(groups.length).toBeGreaterThan(10);
    expect((html.match(/>Handled</g) ?? []).length).toBe(groups.length);
    expect(html).toContain("The DEA registration lapses every three years");
  });
});
