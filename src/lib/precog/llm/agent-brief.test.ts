import { describe, expect, it } from "vitest";
import {
  chickenLittleCritique,
  extractVariableCascades,
  localSynthesize,
  NO_ALERT_WARNING,
  renderDecision,
} from "./agent-brief";
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

describe("Pioneer concise brief", () => {
  it("keeps the short limits section and omits the removed sections and stack labels", () => {
    const { brief } = synthesize(makeScenarioResult());

    for (const heading of [
      "Order of fixes (Precog's model)",
      "Four review lenses",
      "Tradeoffs",
      "Where the figures come from",
    ]) {
      expect(brief.markdown).not.toContain(`## ${heading}`);
    }
    expect(brief.markdown).toContain("## Limits");
    expect(brief.markdown).toContain(
      "Rankings use Precog's weights, not a measurement of this business.",
    );
    expect(brief.markdown).not.toMatch(/\(stack\)|If you /);
    expect(brief.markdown).not.toContain("## This week\nThis week:");
  });
});

describe("variable cascade brief lines", () => {
  it("omits zero deltas, describes earlier or later detection, and cleans stack labels", () => {
    const row = (
      label: string,
      changes: Partial<{
        deltaRetained: number;
        deltaPremium: number;
        deltaResidual: number;
        deltaP50: number;
      }> = {},
    ) => ({
      label,
      affects: ["lowers likelihood"],
      secondOrderNotes: ["Shorter detection reduces assumed loss."],
      deltaCor: 0,
      deltaRetained: 0,
      deltaPremium: 0,
      deltaResidual: 0,
      deltaP50: 0,
      deltaLikelihood: 0,
      worsens: [],
      ...changes,
    });
    const result: ToolResult = {
      tool: "simulate_variable_cascades",
      ok: true,
      summary: "",
      data: {
        topByCostOfRisk: [
          row("Cameras + dual release (stack)", { deltaResidual: -8, deltaP50: -71 }),
          row("Add a second review", { deltaP50: 12 }),
          row("No-op lever"),
        ],
      },
    };
    const lines = extractVariableCascades([result]);

    expect(lines[0]).toBe(
      "**Cameras + dual release**: risk index −8.0, found 71 days sooner. Also: lowers likelihood. Shorter detection reduces assumed loss.",
    );
    expect(lines[1]).toContain("found 12 days later");
    expect(lines[1]).not.toContain("Shorter detection");
    expect(lines[2]).toBe(
      "**No-op lever**: no change in Precog's figures. Also: lowers likelihood.",
    );
    expect(lines.join("\n")).not.toMatch(/assumed retained \$0|premium \$0|risk index \+?0\.0/);
  });
});

describe("rules-authored move text", () => {
  it("uses the model-ranking caveat and keeps cascade effects off the markdown tail", () => {
    const reasoning: ToolResult = {
      tool: "run_advanced_reasoning",
      ok: true,
      summary: "",
      data: { recommendedSequence: ["Cameras + dual release (stack)"] },
    };
    const brief = localSynthesize(
      "What comes first?",
      [reasoning],
      [],
      [NO_ALERT_WARNING],
      [],
      [],
      [],
    );
    const move = {
      action: "Review the open gap",
      rationale: "Check the records.",
      evidenceIds: [],
      effort: "low" as const,
      horizonDays: 7,
      cascadeEffects: ["risk index ↓"],
    };

    expect(brief.decisions[0].action).toBe("Cameras + dual release");
    expect(brief.decisions[0].rationale).toBe(
      "Precog's model ranks this first, using its own weights. It is an ordering, not a measurement.",
    );
    expect(renderDecision(move, 0)).not.toContain("Also moves");
    expect(move.cascadeEffects).toEqual(["risk index ↓"]);
  });
});
