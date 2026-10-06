import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { resolveTemplate } from "@/lib/precog/active-template";
import { runPrecogScenario } from "@/lib/precog/engine";
import { defaultProfile } from "@/lib/precog/practice-profile";
import { PresentationProvider } from "@/lib/precog/presentation";
import { ReadOnlyPracticeProvider } from "@/lib/precog/read-only-practice";
import { CORE_POLICY_FIELDS } from "@/lib/precog/scoring/insurance-record";
import {
  DEFAULT_RISK_VARIABLES,
  NOT_INSURED_HINT,
  insuranceFigureNote,
  scenarioFlags,
  type RiskVariableState,
} from "@/lib/precog/scoring/dynamic-variables";
import { DynamicVariablesPanel } from "./dynamic-variables-panel";
import { InsuranceRecordPanel } from "./insurance-record-panel";
import { ScenarioCompare } from "./scenario-compare";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  useNavigate: () => () => {},
}));

const NOT_FRAUD = "sc-front-desk-leaves";
const FRAUD = "sc-vendor-fraud";

/** A policy with every main figure confirmed, and both scenarios modeled as covered. */
const policy: RiskVariableState = {
  ...DEFAULT_RISK_VARIABLES,
  insurance: {
    status: "reported",
    confirmedFields: [...CORE_POLICY_FIELDS],
    modeledScenarioIds: [NOT_FRAUD, FRAUD],
    reviewedOn: "2026-09-30",
  },
};

const OFFER = "Model this scenario as potentially covered";

describe("a scenario that is not theft or fraud (RW1-4)", () => {
  it("is not a fraud scenario, and the other is", () => {
    expect(scenarioFlags(NOT_FRAUD).fraudRelated).toBe(false);
    expect(scenarioFlags(FRAUD).fraudRelated).toBe(true);
  });

  it("offers no recovery assumption in the insurance record", () => {
    const panel = (scenarioId: string) =>
      renderToStaticMarkup(
        <InsuranceRecordPanel value={policy} onChange={() => {}} scenarioId={scenarioId} />,
      );
    expect(panel(FRAUD)).toContain(OFFER);
    expect(panel(NOT_FRAUD)).not.toContain(OFFER);
  });

  it("says it is not an insured loss, in the note and on the settings tile", () => {
    expect(insuranceFigureNote(policy, true, NOT_FRAUD)).toBe(
      "Not an insured loss under a crime policy, so Precog models no recovery.",
    );
    expect(insuranceFigureNote(policy, true, FRAUD)).toMatch(/^Conditional recovery/);
    const tpl = resolveTemplate(defaultProfile("dental"));
    const result = runPrecogScenario(tpl, NOT_FRAUD, { riskVariables: policy });
    expect(result).not.toBeNull();
    const html = renderToStaticMarkup(
      <DynamicVariablesPanel value={policy} onChange={() => {}} result={result} ownBusiness />,
    );
    expect(html).toContain(NOT_INSURED_HINT);
    expect(html).not.toContain("paid by insurance");
    expect(html).not.toContain("Conditional recovery");
    expect(html).not.toContain(OFFER);
  });

  it("says it is not an insured loss on the compare tiles", () => {
    const profile = { ...defaultProfile("dental"), riskVariables: policy };
    const html = renderToStaticMarkup(
      <PresentationProvider>
        <ReadOnlyPracticeProvider profile={profile}>
          <ScenarioCompare
            initialScenarioId={NOT_FRAUD}
            staffWhatIf={{
              staff: profile.staff,
              saved: profile.staff,
              ownBusiness: false,
              onChange: () => {},
              onApply: () => {},
              onReset: () => {},
            }}
            riskVariables={policy}
          />
        </ReadOnlyPracticeProvider>
      </PresentationProvider>,
    );
    expect(html).toContain(NOT_INSURED_HINT);
    expect(html).not.toContain("paid by insurance");
  });
});
