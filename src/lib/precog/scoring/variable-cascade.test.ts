import { CORE_POLICY_FIELDS } from "./insurance-record";
import { describe, expect, it } from "vitest";
import { getBaseTemplate, resolveTemplate } from "../active-template";
import type { Person } from "../types";
import { DEFAULT_RISK_VARIABLES } from "./dynamic-variables";
import {
  CASCADE_LEVERS,
  HIGHER_IS_BETTER,
  LOWER_IS_BETTER,
  leverAffects,
  simulateAllCascades,
  simulateCascadeLever,
} from "./variable-cascade";

const dental = getBaseTemplate("dental");

describe("assumed days until found", () => {
  it("counts fewer days as better, so detection improves them", () => {
    expect(LOWER_IS_BETTER.has("timelineP50")).toBe(true);
    expect(HIGHER_IS_BETTER.has("timelineP50")).toBe(false);
    const sim = simulateCascadeLever(
      dental,
      "enable_independent_bank_rec",
      DEFAULT_RISK_VARIABLES,
      dental.staffComposition,
      "sc-cash-sod-failure",
    );
    const days = sim.deltas.find((d) => d.key === "timelineP50")!;
    expect(days.label).toBe("Assumed days until found");
    expect(days.after).toBeLessThan(days.before);
    expect(days.direction).toBe("improves");
    expect(sim.secondOrderNotes.join(" ")).toContain(
      "Faster detection shortens the assumed days until found",
    );
  });

  it("uses the same words in the lever list and the dependency chips, with no percentile label", () => {
    const bank = CASCADE_LEVERS.find((l) => l.id === "enable_independent_bank_rec")!;
    expect(bank.affects).toContain("assumed days until found ↓");
    const all = simulateAllCascades(dental);
    expect(all.dependencyMap).toContainEqual({
      from: "bank_rec",
      to: "days_until_found",
      effect: "↓ assumed days until found",
    });
    // Every word an owner reads: lever copy, chips, delta labels, notes and verdicts.
    const text = JSON.stringify([
      CASCADE_LEVERS,
      all.dependencyMap,
      all.simulations.map((sim) => [
        sim.deltas.map((d) => d.label),
        sim.secondOrderNotes,
        sim.overallVerdict,
      ]),
    ]);
    expect(text).not.toMatch(/p50/i);
  });
});

describe("insurance levers on default policy figures", () => {
  it("are not modelled or ranked until the owner enters the figure they change", () => {
    const sim = simulateCascadeLever(dental, "lower_deductible_1k", DEFAULT_RISK_VARIABLES);
    expect(sim.available).toBe(false);
    expect(sim.deltas).toEqual([]);
    expect(sim.overallVerdict).toBe(
      "Not modelled until you confirm your policy: the deductible has not been confirmed. Review Insurance information status on Dynamic variables.",
    );
    const all = simulateAllCascades(dental, DEFAULT_RISK_VARIABLES);
    const ranked = all.rankedByCor.map((s) => s.lever.id);
    for (const id of ["raise_deductible_10k", "lower_deductible_1k", "raise_limit_250k"]) {
      expect(ranked).not.toContain(id);
    }
    const entered = simulateCascadeLever(dental, "lower_deductible_1k", {
      ...DEFAULT_RISK_VARIABLES,
      deductible: 7500,
      insurance: {
        status: "reported",
        confirmedFields: [...CORE_POLICY_FIELDS],
        modeledScenarioIds: dental.scenarios.map((scenario) => scenario.id),
      },
    });
    expect(entered.available).toBe(true);
    expect(entered.after.retainedExpected).toBeLessThan(entered.before.retainedExpected);
  });

  it("drops premium and credit effects from a lever's list while no policy is entered", () => {
    const dual = CASCADE_LEVERS.find((l) => l.id === "enable_dual_control")!;
    expect(leverAffects(dual, DEFAULT_RISK_VARIABLES).join(" ")).not.toMatch(/premium|credit/);
    expect(
      leverAffects(dual, {
        ...DEFAULT_RISK_VARIABLES,
        basePremiumAnnual: 1800,
        insurance: {
          status: "reported",
          confirmedFields: [...CORE_POLICY_FIELDS],
          modeledScenarioIds: [],
        },
      }),
    ).toEqual(dual.affects);
  });

  it("prices an own business with no policy as having none", () => {
    const own = resolveTemplate({
      industry: "dental",
      customPeople: [
        { id: "own-1", name: "Ana Ruiz", role: "Owner", active: true, entitlements: [] } as Person,
      ],
    });
    const all = simulateAllCascades(own, DEFAULT_RISK_VARIABLES, own.staffComposition);
    expect(all.baseline.premiumAnnualNet).toBe(0);
    expect(all.baseline.retainedExpected).toBe(all.baseline.grossExpected);
  });
});
