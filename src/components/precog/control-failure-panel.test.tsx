import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { resolveTemplate } from "@/lib/precog/active-template";
import { defaultProfile } from "@/lib/precog/practice-profile";
import { ReadOnlyPracticeProvider } from "@/lib/precog/read-only-practice";
import { evaluateControlFailure } from "@/lib/precog/scoring/control-failure";
import { confirmedScenarioIds } from "@/lib/precog/scoring/scope";
import { ControlFailurePanel } from "./control-failure-panel";

describe("the control failure view", () => {
  it("renders its default headline", () => {
    const profile = defaultProfile("dental");
    const template = resolveTemplate(profile);
    const expected = evaluateControlFailure(
      template,
      { kind: "safeguard", id: "dual_release" },
      {
        staff: profile.staff,
        riskVariables: profile.riskVariables,
        dualRelease: profile.dualRelease,
        confirmedScenarioIds: confirmedScenarioIds(profile.decisions, profile.industry),
      },
    );
    const html = renderToStaticMarkup(
      <ReadOnlyPracticeProvider profile={profile}>
        <ControlFailurePanel />
      </ReadOnlyPracticeProvider>,
    );

    expect(html).toContain(expected.headline);
  });
});
