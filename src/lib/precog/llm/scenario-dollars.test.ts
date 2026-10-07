import { describe, expect, it } from "vitest";
import { pioneerProfileFrom } from "../coach/pioneer-profile";
import { chickenLittleCritique, extractVariableCascades } from "./agent-brief";
import { runLocalAgentLoop } from "./agent-loop";
import { describeScenarioFigures } from "./scenario-tools";
import type { ToolResult } from "./types";

describe("scenario dollars in the brief and the tools", () => {
  it("states a scenario's retained loss as a rounded estimate", () => {
    expect(
      describeScenarioFigures({
        retained: { expected: 10_588 },
        timelineDays: { p50: 197 },
        dynamic: null,
      }),
    ).toBe("assumed retained about $11,000 · about 197 days until found");
  });

  it("keeps the exact figure in the tool's data, where a model does its arithmetic", () => {
    const run = runLocalAgentLoop("What is our biggest fraud loss scenario?", {
      profile: pioneerProfileFrom({ industry: "dental" }),
      today: "2026-10-06",
    });
    const scenario = run.toolResults.find((t) => t.tool === "run_precog_scenario")!;
    expect(scenario.summary).toBe(
      "One person posts payments and reconciles the bank: assumed retained about $5,000 · about 178 days until found",
    );
    expect((scenario.data as { retained: { expected: number } }).retained.expected).toBe(5_000);
    expect(run.steps[0].detail).toBe(`${run.toolsUsed.length} checks of your records`);
    expect(run.brief.variableCascades[0]).toBe(
      "Baseline: likelihood ×1.18, premium $4,200, assumed retained about $5,000, risk index 58.",
    );
  });

  it("rounds a lever's change in retained loss and the warning's loss the same way", () => {
    const cascades: ToolResult = {
      tool: "simulate_variable_cascades",
      ok: true,
      summary: "",
      data: {
        baseline: {
          premiumAnnualNet: 4_200,
          retainedExpected: 10_588,
          expectedAnnualCostOfRisk: 0,
          residualAverage: 58,
          likelihoodMultiplier: 1.18,
        },
        topByCostOfRisk: [
          {
            label: "Turn on dual release",
            affects: ["lowers fraud likelihood"],
            secondOrderNotes: [],
            deltaCor: 0,
            deltaRetained: -1_234,
            deltaPremium: -150,
            deltaResidual: -4,
            deltaP50: -13,
            deltaLikelihood: 0,
            worsens: [],
          },
        ],
      },
    };
    const [baseline, row] = extractVariableCascades([cascades]);
    expect(baseline).toBe(
      "Baseline: likelihood ×1.18, premium $4,200, assumed retained about $11,000, risk index 58.",
    );
    expect(row).toBe(
      "**Turn on dual release**: risk index −4.0, found 13 days sooner, assumed retained about −$1,200, premium −$150. Also: lowers fraud likelihood.",
    );
    const scenario: ToolResult = {
      tool: "run_precog_scenario",
      ok: true,
      summary: "",
      data: {
        scenarioId: "sc-vendor-fraud",
        title: "Vendor fraud",
        retained: { expected: 20_588 },
        timelineDays: { p50: 60 },
        dynamic: null,
      },
    };
    expect(chickenLittleCritique([scenario]).join(" ")).toContain(
      '"Vendor fraud" assumes about $21,000 retained, found about 60 days in',
    );
  });
});
