import { describe, expect, it } from "vitest";
import {
  chickenLittleCritique,
  destack,
  extractVariableCascades,
  localSynthesize,
  NO_ALERT_WARNING,
  renderDecision,
} from "./agent-brief";
import type { ScenarioRunData } from "./scenario-tools";
import type { ToolResult } from "./types";
import { RISK_SCALE } from "../scoring/bands";
import { DEFAULT_RISK_VARIABLES } from "../scoring/dynamic-variables";
import { RESIDUAL_BAND_LABEL } from "../scoring/weights";
import { getIndustryTemplate } from "../templates";
import { simulateAllCascades } from "../scoring/variable-cascade";

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

describe("Pioneer breached-condition count", () => {
  const leading: ToolResult = {
    tool: "get_leading_indicators",
    ok: true,
    summary: "Watched conditions",
    data: { breached: 3, watch: 1, topActions: [] },
  };
  const residual: ToolResult = {
    tool: "get_residual_portfolio",
    ok: true,
    summary: "Risk index",
    data: { averageResidual: 90, criticalPath: 0 },
  };

  function section(markdown: string, heading: string) {
    return markdown.match(
      new RegExp(`^## ${heading}\\n([\\s\\S]*?)(?=\\n## |(?![\\s\\S]))`, "m"),
    )?.[1];
  }

  it("states the breached count once in Warnings", () => {
    const tools = [leading, residual];
    const warnings = chickenLittleCritique(tools);
    const brief = localSynthesize("What can happen?", tools, [], warnings, [], [], []);
    const warningSection = section(brief.markdown, "Warnings");

    expect(warnings).toContain("3 watched conditions breached.");
    expect(warningSection).toContain("Watched conditions: **3 breached**, 1 at watch");
    expect(warningSection).not.toMatch(/^- \d+ watched conditions? breached/m);
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
      "**Put cameras and dual release in place together**: risk index 8 points lower, found 71 days sooner. Also: lowers likelihood. Shorter detection reduces assumed loss.",
    );
    expect(lines[1]).toContain("found 12 days later");
    expect(lines[1]).not.toContain("Shorter detection");
    expect(lines[2]).toBe(
      "**No-op lever**: no change in Precog's figures. Also: lowers likelihood.",
    );
    expect(lines.join("\n")).not.toMatch(
      /assumed retained \$0|premium \$0|risk index \+?0\.0|0 points/,
    );
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

    expect(brief.decisions[0].action).toBe("Put cameras and dual release in place together");
    expect(brief.decisions[0].rationale).toBe(
      "Precog's model ranks this first, using its own weights. It is an ordering, not a measurement.",
    );
    expect(renderDecision(move, 0)).not.toContain("Also moves");
    expect(move.cascadeEffects).toEqual(["risk index ↓"]);
  });
});

describe("default control recommendations", () => {
  function briefWithControls(
    dualControlPayments: boolean,
    independentBankRec: boolean,
    extraTools: ToolResult[] = [],
  ) {
    const snapshot: ToolResult = {
      tool: "get_practice_snapshot",
      ok: true,
      summary: "Practice snapshot",
      data: {
        practice: "Northside",
        staff: {
          teamSize: 2,
          segregationScore: 0,
          dualControlPayments,
          independentBankRec,
        },
      },
    };
    return localSynthesize(
      "What next?",
      [snapshot, ...extraTools],
      [],
      [NO_ALERT_WARNING],
      [],
      [],
      [],
    );
  }

  it("recommends only the independent bank reconciliation when a second signer is already on", () => {
    const brief = briefWithControls(true, false);
    const text = JSON.stringify(brief);

    expect(brief.decisions[0]?.action).toBe("Set up an independent bank reconciliation");
    expect(brief.frontierNextMove).toContain("Set up an independent bank reconciliation");
    expect(text).not.toContain("Turn on a second signer");
  });

  it("uses the existing Decisions log action when both controls are already on", () => {
    const brief = briefWithControls(true, true);

    expect(brief.decisions[0]?.action).toBe(
      "Write down in the Decisions log which open gaps you accept and which you will fix, each with a review date",
    );
    expect(brief.decisions[0]?.rationale).toBe(
      "An open gap stays flagged until you record a decision on it, and the record is the trail an outside reviewer asks for.",
    );
    expect(
      brief.decisions.filter((decision) => decision.action === brief.decisions[0]?.action),
    ).toHaveLength(1);
    expect(brief.frontierNextMove).toContain("Write down in the Decisions log");
  });

  it("does not repeat dual release in the first action when ranking a confirmed scenario", () => {
    const tpl = getIndustryTemplate("dental");
    const scenarioId = "sc-cash-sod-failure";
    const staff = {
      ...tpl.staffComposition,
      dualControlPayments: true,
      independentBankRec: false,
    };
    const cascades = simulateAllCascades(
      tpl,
      { ...DEFAULT_RISK_VARIABLES, hasSecurityCameras: false },
      staff,
      scenarioId,
      { confirmedScenarioIds: new Set([scenarioId]) },
    );
    const cascadeResult: ToolResult = {
      tool: "simulate_variable_cascades",
      ok: true,
      summary: "Confirmed scenario cascades",
      data: {
        topByCostOfRisk: cascades.rankedByCor.slice(0, 5).map((simulation) => ({
          label: simulation.lever.label,
          deltaCor:
            simulation.after.expectedAnnualCostOfRisk - simulation.before.expectedAnnualCostOfRisk,
          affects: simulation.lever.affects,
          secondOrderNotes: simulation.secondOrderNotes,
        })),
      },
    };
    const brief = briefWithControls(true, false, [cascadeResult]);

    expect(brief.decisions[0]?.action.toLowerCase()).not.toContain("dual release");
    expect(brief.frontierNextMove.toLowerCase()).not.toContain("dual release");
  });
});
