import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CascadePanel } from "@/components/precog/cascade-panel";
import { resolveTemplate } from "@/lib/precog/active-template";
import { defaultProfile } from "@/lib/precog/practice-profile";
import { ReadOnlyPracticeProvider } from "@/lib/precog/read-only-practice";
import { simulateAllCascades } from "@/lib/precog/scoring/variable-cascade";
import type { Person } from "@/lib/precog/types";

describe("What else moves", () => {
  it("shows the note when an own business has no confirmed scenarios", () => {
    const profile = {
      ...defaultProfile("dental"),
      customPeople: [
        { id: "own-1", name: "Ana Ruiz", role: "Owner", active: true, entitlements: [] } as Person,
      ],
    };
    const template = resolveTemplate(profile);
    const scope = { confirmedScenarioIds: new Set<string>() };
    const scopeNote = simulateAllCascades(
      template,
      profile.riskVariables,
      profile.staff,
      undefined,
      scope,
    ).scopeNote;
    const html = renderToStaticMarkup(
      <ReadOnlyPracticeProvider profile={profile}>
        <CascadePanel />
      </ReadOnlyPracticeProvider>,
    );
    const renderedText = html
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'");

    expect(scopeNote).not.toBeNull();
    expect(renderedText).toContain(scopeNote);
  });
});
