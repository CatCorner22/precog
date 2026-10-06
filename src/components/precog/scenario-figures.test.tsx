import type { ReactNode } from "react";
import { prerender } from "react-dom/static";
import { describe, expect, it, vi } from "vitest";
import { resolveTemplate } from "@/lib/precog/active-template";
import { runPrecogScenario } from "@/lib/precog/engine";
import { defaultProfile, type PracticeProfile } from "@/lib/precog/practice-profile";
import { PresentationProvider } from "@/lib/precog/presentation";
import { ReadOnlyPracticeProvider } from "@/lib/precog/read-only-practice";
import { mergeStaffIntoVariables } from "@/lib/precog/scoring/dynamic-variables";
import { simulateAllCascades, simulateCascadeLever } from "@/lib/precog/scoring/variable-cascade";
import { evaluateControlFailure } from "@/lib/precog/scoring/control-failure";
import { confirmedScenarioIds } from "@/lib/precog/scoring/scope";
import { localDateKey } from "@/lib/precog/dates";
import { formatEstimateUsd, formatUsd } from "@/lib/utils";
import { CascadePanel } from "./cascade-panel";
import { ControlFailurePanel } from "./control-failure-panel";
import { ScenarioCompare } from "./scenario-compare";
import { ScenarioRunner } from "./scenario-runner";
import { ScenarioVariablesView } from "./scenario-variables-view";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
  useNavigate: () => () => {},
}));

const noop = () => {};

async function text(profile: PracticeProfile, node: ReactNode): Promise<string> {
  const { prelude } = await prerender(
    <PresentationProvider>
      <ReadOnlyPracticeProvider profile={profile}>{node}</ReadOnlyPracticeProvider>
    </PresentationProvider>,
  );
  const html = await new Response(prelude).text();
  return html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<!-- -->/g, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;|’/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

/** The figures a scenario prints, exact and rounded, for every scenario dollar that is not already round. */
function scenarioDollars(profile: PracticeProfile) {
  const tpl = resolveTemplate(profile);
  const scenario = tpl.scenarios[0];
  const result = runPrecogScenario(tpl, scenario.id, {
    mitigationIds: [],
    staff: profile.staff,
    riskVariables: mergeStaffIntoVariables(profile.riskVariables, profile.staff),
  });
  if (!result) throw new Error("no result");
  const amounts = [
    result.financialImpact.expected,
    result.retainedImpact.expected,
    result.dynamic?.transferredExpected ?? 0,
  ].filter((n) => formatUsd(n) !== formatEstimateUsd(n).replace("about ", ""));
  return { tpl, scenario, result, amounts };
}

const profile = defaultProfile("dental");

describe("scenario dollars read as rounded estimates (VALUE-7)", () => {
  it("has exact figures that rounding changes, so the checks below can fail", () => {
    expect(scenarioDollars(profile).amounts.length).toBeGreaterThan(0);
  });

  it("One scenario prints about-figures, never the exact dollar", async () => {
    const page = await text(profile, <ScenarioRunner />);
    const { result, amounts } = scenarioDollars(profile);
    expect(page).toContain(formatEstimateUsd(result.financialImpact.expected));
    for (const n of amounts) expect(page).not.toContain(formatUsd(n));
    expect(page).toContain("Each reduction is Precog's estimate, not a measured reduction.");
  });

  it("Compare what-ifs prints about-figures, never the exact dollar", async () => {
    const { scenario, amounts } = scenarioDollars(profile);
    const page = await text(
      profile,
      <ScenarioCompare
        initialScenarioId={scenario.id}
        staffWhatIf={{
          staff: profile.staff,
          saved: profile.staff,
          ownBusiness: false,
          onChange: noop,
          onApply: noop,
          onReset: noop,
        }}
        riskVariables={profile.riskVariables}
      />,
    );
    expect(page).toContain("about $");
    for (const n of amounts) expect(page).not.toContain(formatUsd(n));
  });

  it("Settings and insurance prints about-figures, never the exact dollar", async () => {
    const { tpl, scenario } = scenarioDollars(profile);
    const result = runPrecogScenario(tpl, scenario.id, {
      mitigationIds: [],
      staff: profile.staff,
      riskVariables: profile.riskVariables,
    });
    const page = await text(
      profile,
      <ScenarioVariablesView
        scenarios={tpl.scenarios}
        scenario={scenario}
        onPick={noop}
        riskVariables={profile.riskVariables}
        onRiskVariablesChange={noop}
        result={result}
        ownBusiness={false}
        whatIfActive={false}
        onShowCascades={noop}
      />,
    );
    expect(page).toContain(formatEstimateUsd(result!.financialImpact.expected));
    expect(page).not.toContain(formatUsd(result!.financialImpact.expected));
    expect(page).not.toContain(formatUsd(result!.retainedImpact.expected));
  });

  it("What else moves prints about-figures for scenario dollars, never the exact dollar", async () => {
    const tpl = resolveTemplate(profile);
    const scope = { confirmedScenarioIds: new Set<string>() };
    const all = simulateAllCascades(tpl, profile.riskVariables, profile.staff, undefined, scope);
    const dual = simulateCascadeLever(
      tpl,
      "enable_dual_control",
      profile.riskVariables,
      profile.staff,
      all.scenarioId,
      scope,
    );
    const page = await text(profile, <CascadePanel />);
    const exact = [
      dual.before.grossExpected,
      dual.after.grossExpected,
      dual.before.retainedExpected,
      dual.after.retainedExpected,
    ].filter((n) => !formatEstimateUsd(n).endsWith(formatUsd(n)));
    expect(exact.length).toBeGreaterThan(0);
    expect(page).toContain(formatEstimateUsd(dual.before.grossExpected));
    for (const n of exact) expect(page).not.toContain(formatUsd(n));
  });

  it("If a control fails prints about-figures, never the exact dollar", async () => {
    const report = evaluateControlFailure(
      resolveTemplate(profile),
      { kind: "safeguard", id: "dual_release" },
      {
        staff: profile.staff,
        riskVariables: profile.riskVariables,
        dualRelease: profile.dualRelease,
        today: localDateKey(new Date()),
        confirmedScenarioIds: confirmedScenarioIds(profile.decisions, profile.industry),
      },
    );
    const page = await text(profile, <ControlFailurePanel />);
    const amounts = [
      ...report.scenarios.flatMap((s) => [s.withIt, s.withoutIt]),
      ...report.linkedScenarios,
    ]
      .map((f) => f.retainedExpected)
      .filter((n) => !formatEstimateUsd(n).endsWith(formatUsd(n)));
    expect(amounts.length).toBeGreaterThan(0);
    expect(page).toContain("about $");
    for (const n of amounts) expect(page).not.toContain(formatUsd(n));
  });
});
