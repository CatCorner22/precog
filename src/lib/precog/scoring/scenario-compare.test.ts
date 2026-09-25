import { describe, expect, it } from "vitest";
import { getBaseTemplate, resolveTemplate } from "../active-template";
import type { Person } from "../types";
import { DEFAULT_RISK_VARIABLES } from "./dynamic-variables";
import { compareScenarioFutures, compareScenarios } from "./scenario-compare";

const people: Person[] = [
  { id: "own-1", name: "Ana Ruiz", role: "Owner", active: true, entitlements: [] },
  { id: "own-2", name: "Ben Ochoa", role: "Bookkeeper", active: true, entitlements: [] },
];

describe("compareScenarioFutures", () => {
  it("never crowns Do nothing, and breaks a retained-loss tie on the gross loss", () => {
    // The sample's default $5,000 deductible makes every retained figure the same.
    const dental = getBaseTemplate("dental");
    const report = compareScenarioFutures(
      dental,
      "sc-cash-sod-failure",
      dental.staffComposition,
      [],
      DEFAULT_RISK_VARIABLES,
    );
    const retained = report.columns.map((c) => c.result.retainedImpact.expected);
    expect(new Set(retained).size).toBe(1);
    for (const winner of [
      report.winnerByRetained,
      report.winnerByAnnualCor,
      report.winnerByPriority,
    ]) {
      expect(winner).not.toBe(report.baselineId);
      expect(winner).not.toBe("");
    }
    const lowestGross = [...report.columns]
      .slice(1)
      .sort((a, b) => a.result.financialImpact.expected - b.result.financialImpact.expected)[0];
    expect(report.winnerByRetained).toBe(lowestGross.id);
    expect(report.mode).toBe("futures");
  });

  it("names the mitigation with the lowest retained loss when the business has no policy", () => {
    const own = resolveTemplate({ industry: "dental", customPeople: people });
    const report = compareScenarioFutures(
      own,
      "sc-cash-sod-failure",
      own.staffComposition,
      [],
      DEFAULT_RISK_VARIABLES,
    );
    const [baseline, ...mitigations] = report.columns;
    for (const c of mitigations) {
      expect(c.result.retainedImpact.expected).toBe(c.result.financialImpact.expected);
      expect(c.result.retainedImpact.expected).toBeLessThan(
        baseline.result.retainedImpact.expected,
      );
      // A mitigation never raises the priority pressure by shortening the days.
      expect(c.priorityIndex).toBeLessThan(baseline.priorityIndex);
    }
    const best = [...mitigations].sort(
      (a, b) => a.result.retainedImpact.expected - b.result.retainedImpact.expected,
    )[0];
    expect(report.winnerByRetained).toBe(best.id);
  });

  it("has no winner when no option beats doing nothing", () => {
    const dental = getBaseTemplate("dental");
    const noOptions = {
      ...dental,
      scenarios: dental.scenarios.map((s) => ({ ...s, mitigations: [] })),
    };
    const report = compareScenarioFutures(noOptions, "sc-cash-sod-failure");
    expect(report.columns).toHaveLength(1);
    expect(report.winnerByRetained).toBe("");
  });
});

describe("compareScenarios", () => {
  it("ranks across scenarios, breaking retained ties on the gross loss", () => {
    const dental = getBaseTemplate("dental");
    const ids = ["sc-front-desk-leaves", "sc-cash-sod-failure", "sc-writeoff-abuse"];
    const report = compareScenarios(
      dental,
      ids,
      dental.staffComposition,
      {},
      DEFAULT_RISK_VARIABLES,
    );
    expect(report.mode).toBe("cross");
    const lowest = [...report.columns].sort(
      (a, b) =>
        a.result.retainedImpact.expected - b.result.retainedImpact.expected ||
        a.result.financialImpact.expected - b.result.financialImpact.expected,
    )[0];
    expect(report.winnerByRetained).toBe(lowest.id);
  });
});
