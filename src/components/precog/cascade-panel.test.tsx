import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdvancedReasoningPanel } from "@/components/precog/advanced-reasoning-panel";
import { CascadePanel } from "@/components/precog/cascade-panel";
import { defaultProfile, type PracticeProfile } from "@/lib/precog/practice-profile";
import { ReadOnlyPracticeProvider } from "@/lib/precog/read-only-practice";
import { MAKE_SCENARIO_YOURS } from "@/lib/precog/scoring/scope";
import type { Person } from "@/lib/precog/types";

/** The note both panels show while an own dental business has confirmed no scenario. */
const DENTAL_SCOPE_NOTE =
  'Sample scenarios from the dental office sample (6) stay out: their losses and timelines are the sample\'s assumptions, not facts about your business. To make one your own, open it on What could happen and choose "This could happen here"; it then counts in the priority list and your totals.';

const ownDental: PracticeProfile = {
  ...defaultProfile("dental"),
  customPeople: [
    { id: "own-1", name: "Ana Ruiz", role: "Owner", active: true, entitlements: [] } as Person,
  ],
};

function renderedText(profile: PracticeProfile, panel: "cascade" | "reasoning"): string {
  const html = renderToStaticMarkup(
    <ReadOnlyPracticeProvider profile={profile}>
      {panel === "cascade" ? <CascadePanel /> : <AdvancedReasoningPanel />}
    </ReadOnlyPracticeProvider>,
  );
  return html
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'");
}

describe("What else moves", () => {
  it("shows no lever figures until an own business confirms a scenario", () => {
    const text = renderedText(ownDental, "cascade");

    expect(text).toContain(DENTAL_SCOPE_NOTE);
    expect(text).toContain("No figures yet");
    expect(text).toContain(MAKE_SCENARIO_YOURS);
    expect(text).toContain("The lever list returns once a scenario counts toward your business.");
    expect(text).not.toContain("Pick a lever");
    expect(text).not.toContain("Retained loss");
    expect(text).not.toContain("$");
  });

  it("keeps the lever ranking when an own business confirms a scenario", () => {
    const profile: PracticeProfile = {
      ...ownDental,
      decisions: [
        {
          id: "confirm-cash",
          createdAt: "2026-10-08T00:00:00.000Z",
          subject: "Cash could happen here",
          kind: "monitor",
          note: "",
          linkedTab: "precog",
          linkedId: "sc-cash-sod-failure",
          linkedIndustry: "dental",
        },
      ],
    };
    const text = renderedText(profile, "cascade");

    expect(text).not.toContain("No figures yet");
    expect(text).toContain("Pick a lever");
    expect(text).toContain("Retained loss");
  });

  it("shows no note on the sample, with dual release's residual and verdict", () => {
    const text = renderedText(defaultProfile("dental"), "cascade");
    expect(text).not.toContain("stay out:");
    expect(text).toContain("Pick a lever");
    expect(text).toContain(
      "average residual risk falls 4 points. Better overall, with some tradeoffs.",
    );
    expect(text).toContain(
      'Portfolio average residual</p><p class="mt-1 tabular">60.00 → <span class="font-semibold">56.00</span>',
    );
  });
});

describe("Which lever first", () => {
  it("shows the same note when an own business has no confirmed scenarios", () => {
    const text = renderedText(ownDental, "reasoning");
    expect(text).toContain(DENTAL_SCOPE_NOTE);
    expect(text).not.toContain("Cut daily cash exposure 20%");
  });

  it("shows no note on the sample", () => {
    expect(renderedText(defaultProfile("dental"), "reasoning")).not.toContain("stay out:");
  });
});
