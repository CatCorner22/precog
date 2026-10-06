import { describe, expect, it } from "vitest";
import { chickenLittleCritique, localSynthesize, NO_ALERT_WARNING } from "./agent-brief";
import type { ScenarioRunData } from "./scenario-tools";
import type { ToolResult } from "./types";

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

describe("Pioneer early scenario signs", () => {
  it("adds the first three signs under watched conditions without changing alerts", () => {
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
