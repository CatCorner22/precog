import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { resolveTemplate } from "@/lib/precog/active-template";
import { localDateKey } from "@/lib/precog/dates";
import { defaultProfile, type PracticeProfile } from "@/lib/precog/practice-profile";
import { withDualRelease, withStaff } from "@/lib/precog/profile-actions";
import { ReadOnlyPracticeProvider } from "@/lib/precog/read-only-practice";
import {
  DUAL_RELEASE_INOPERABLE_LEAD,
  evaluateControlFailure,
  type FailureTarget,
} from "@/lib/precog/scoring/control-failure";
import { portfolioSummary } from "@/lib/precog/scoring/residual-engine";
import { confirmedScenarioIds } from "@/lib/precog/scoring/scope";
import { DEFAULT_WEIGHTS } from "@/lib/precog/scoring/weights";
import { ControlFailurePanel } from "./control-failure-panel";

function expectedReport(profile: PracticeProfile, target: FailureTarget) {
  return evaluateControlFailure(resolveTemplate(profile), target, {
    staff: profile.staff,
    riskVariables: profile.riskVariables,
    dualRelease: profile.dualRelease,
    today: localDateKey(new Date()),
    confirmedScenarioIds: confirmedScenarioIds(profile.decisions, profile.industry),
  });
}

function render(profile: PracticeProfile, initialTarget?: string) {
  return renderToStaticMarkup(
    <ReadOnlyPracticeProvider profile={profile}>
      <ControlFailurePanel initialTarget={initialTarget} />
    </ReadOnlyPracticeProvider>,
  );
}

const escape = (text: string) => text.replaceAll("'", "&#x27;");

describe("the control failure view", () => {
  it("renders its default headline", () => {
    const profile = defaultProfile("dental");
    const expected = expectedReport(profile, { kind: "safeguard", id: "dual_release" });

    expect(render(profile)).toContain(escape(expected.headline));
  });

  it("renders a control that is in place as a failure", () => {
    const profile = defaultProfile("dental");
    const control = resolveTemplate(profile).controls.find(
      (item) => item.segregated && !item.starter,
    )!;
    const expected = expectedReport(profile, { kind: "control", id: control.id });
    const html = render(profile, `control:${control.id}`);

    expect(expected.mode).toBe("failure");
    expect(html).toContain("In place today — what happens if it stops");
    expect(html).toContain(escape(expected.headline));
    expect(html).toContain("Duty conflicts this control guards");
    expect(html).toContain(`value="control:${control.id}" selected=""`);
    if (expected.findings.length === 0) {
      expect(html).toContain("No duty conflict on this team depends on this control.");
    }
  });

  it("renders a missing control as a gap with the duty conflicts it would guard", () => {
    const profile = defaultProfile("dental");
    const target: FailureTarget = { kind: "control", id: "c-sod-cash" };
    const expected = expectedReport(profile, target);
    const html = render(profile, "control:c-sod-cash");

    expect(expected.mode).toBe("gap");
    expect(expected.findings.length).toBeGreaterThan(0);
    expect(html).toContain("Missing today — what the gap costs");
    expect(html).toContain(escape(expected.headline));
    expect(html).toContain("Duty conflicts this control would guard");
    for (const finding of expected.findings) {
      expect(html).toContain(
        escape(
          finding.lostInPlace.length
            ? `Also in place: ${finding.lostInPlace.join(" · ")}`
            : "Nothing else in place",
        ),
      );
    }
  });

  it("falls back to the first safeguard when the selection is not in this business", () => {
    const profile = defaultProfile("dental");
    expect(resolveTemplate(profile).controls.some((item) => item.id === "c-sub-verify")).toBe(
      false,
    );
    const expected = expectedReport(profile, { kind: "safeguard", id: "dual_release" });
    const html = render(profile, "control:c-sub-verify");

    expect(html).toContain('value="safeguard:dual_release" selected=""');
    expect(html).not.toContain('selected="" value="control:');
    expect(html).toContain(escape(expected.headline));
  });

  it("shows today's residual as the report does when the staff flag is on and no payment rule can run", () => {
    let profile = defaultProfile("dental");
    profile = withDualRelease(
      profile,
      {
        ...profile.dualRelease,
        rules: profile.dualRelease.rules.map((rule) =>
          rule.channel === "ach" || rule.channel === "check" ? { ...rule, enabled: false } : rule,
        ),
      },
      new Date(),
    );
    profile = withStaff(profile, { ...profile.staff, dualControlPayments: true });
    const reported = portfolioSummary(resolveTemplate(profile), profile.staff, DEFAULT_WEIGHTS, {
      confirmedScenarioIds: confirmedScenarioIds(profile.decisions, profile.industry),
      riskVariables: profile.riskVariables,
    }).averageResidual;
    const expected = expectedReport(profile, { kind: "safeguard", id: "dual_release" });
    const html = render(profile);

    expect(expected.residual.withIt).toBe(reported);
    expect(html).toContain("In place today — what happens if it stops");
    expect(html).toContain(`${reported} → ${expected.residual.withoutIt}`);
    expect(html).toContain(DUAL_RELEASE_INOPERABLE_LEAD);
  });
});
