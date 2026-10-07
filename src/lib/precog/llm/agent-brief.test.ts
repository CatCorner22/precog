import { describe, expect, it } from "vitest";
import { chickenLittleCritique, destack, localSynthesize, NO_ALERT_WARNING } from "./agent-brief";
import type { ScenarioRunData } from "./scenario-tools";
import type { ToolResult } from "./types";
import { RISK_SCALE } from "../scoring/bands";
import { RESIDUAL_BAND_LABEL } from "../scoring/weights";

function makeScenarioResult(warningSigns?: readonly string[]): ToolResult {
  const data: ScenarioRunData = {
    scenarioId: "sc-vendor-fraud",
    title: "Vendor fraud",
    retained: { expected: 1_000 },
    timelineDays: { p50: 365 },
    dynamic: null,
    ...(warningSigns ? { warningSigns } : {}),
  };
  return { tool: "run_precog_scenario", ok: true, summary: "Vendor fraud", data };
}

function synthesize(scenario: ToolResult) {
  const tools = [scenario];
  const warnings = chickenLittleCritique(tools);
  return {
    brief: localSynthesize("What can happen?", tools, [], warnings, [], [], []),
    warnings,
  };
}

describe("stack wording", () => {
  it("turns a stacked label into an owner-facing phrase inside longer text", () => {
    expect(destack("Cameras + dual release + bank reconciliation (stack)")).toBe(
      "Cameras, dual release and bank reconciliation together",
    );
    expect(
      destack(
        "Levers in the order Precog prefers: Cameras, dual release, bank reconciliation (stack).",
      ),
    ).toBe(
      "Levers in the order Precog prefers: Cameras, dual release and bank reconciliation together.",
    );
    expect(
      destack(
        "First: Cameras + dual release + bank reconciliation (stack). Next: Cameras + dual release + bank reconciliation (stack).",
      ),
    ).toBe(
      "First: Cameras, dual release and bank reconciliation together. Next: Cameras, dual release and bank reconciliation together.",
    );
  });
});

describe("Pioneer early scenario signs", () => {
  it("adds the first three early signs under warnings without changing alerts", () => {
    const { brief, warnings } = synthesize(
      makeScenarioResult(["First sign.", "Second sign.", "Third sign.", "Fourth sign."]),
    );

    expect(brief.markdown).toContain(
      '- Early signs of "Vendor fraud": First sign; second sign; third sign.',
    );
    expect(brief.markdown).not.toContain("Fourth sign");
    expect(warnings).toEqual([NO_ALERT_WARNING]);
    expect(brief.chickenLittleWarnings).toEqual([NO_ALERT_WARNING]);
  });

  it("omits the early-sign line for older scenario results without warningSigns", () => {
    const { brief, warnings } = synthesize(makeScenarioResult());

    expect(brief.markdown).not.toContain("Early signs of");
    expect(warnings).toEqual([NO_ALERT_WARNING]);
    expect(brief.chickenLittleWarnings).toEqual([NO_ALERT_WARNING]);
  });
});

describe("Pioneer's residual warnings", () => {
  const warn = (averageResidual: number, criticalPath: number) =>
    chickenLittleCritique([
      {
        tool: "get_residual_portfolio",
        ok: true,
        summary: "",
        data: { averageResidual, criticalPath },
      },
    ]);

  it("names the residual band the average sits in, never a priority-list word", () => {
    expect(warn(RISK_SCALE.actNow, 0)).toContain(
      `The average risk index is ${RISK_SCALE.actNow}/100, in the "${RESIDUAL_BAND_LABEL.act_now}" band on Precog's own index (Precog warns at ${RISK_SCALE.actNow} or more).`,
    );
    expect(warn(RISK_SCALE.critical + 5, 0).join(" ")).toContain(
      `in the "${RESIDUAL_BAND_LABEL.critical_path}" band`,
    );
  });

  it("counts the residual risks in the Severe band, not in Fix first", () => {
    const warnings = warn(0, 3);
    expect(warnings).toContain(`3 risks are in the "${RESIDUAL_BAND_LABEL.critical_path}" band.`);
    expect(warnings.join(" ")).not.toMatch(/fix first|fix soon|worth doing/i);
  });
});
