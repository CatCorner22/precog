import { describe, expect, it } from "vitest";
import { runFixFirstTriage, type FixFirstCalculatorValues } from "./fix-first-triage";

const noGates: FixFirstCalculatorValues["gates"] = {
  personal_statutory_liability: false,
  irreversible_money_out: false,
  ability_to_operate: false,
  active_incident: false,
};

const noProofs: FixFirstCalculatorValues["proofs"] = {
  actor: false,
  cadence: false,
  artifact: false,
};

function values(overrides: Partial<FixFirstCalculatorValues> = {}): FixFirstCalculatorValues {
  return {
    gates: { ...noGates, ...overrides.gates },
    impact: overrides.impact ?? 1,
    likelihood: overrides.likelihood ?? 1,
    legal: overrides.legal ?? 0,
    detection: overrides.detection ?? 0,
    recoverability: overrides.recoverability ?? 0,
    aggregation: overrides.aggregation ?? 0,
    compensating_credit: overrides.compensating_credit ?? 0,
    proofs: { ...noProofs, ...overrides.proofs },
  };
}

describe("Fix first calculator", () => {
  it("uses the existing 24/16/9 triage cutoffs", () => {
    expect(runFixFirstTriage(values({ impact: 5, likelihood: 5 }))).toMatchObject({
      score: 25,
      tier: 1,
    });
    expect(runFixFirstTriage(values({ impact: 5, likelihood: 3, legal: 2 }))).toMatchObject({
      score: 17,
      tier: 2,
    });
    expect(runFixFirstTriage(values({ impact: 3, likelihood: 3 }))).toMatchObject({
      score: 9,
      tier: 3,
    });
    expect(runFixFirstTriage(values({ impact: 2, likelihood: 4 }))).toMatchObject({
      score: 8,
      tier: 4,
    });
  });

  it("makes a gate Tier 1 without calculating a score", () => {
    const result = runFixFirstTriage(values({ gates: { ...noGates, active_incident: true } }));

    expect(result).toMatchObject({
      tier: 1,
      score: null,
      triggered_gates: ["active_incident"],
    });
  });

  it("requires all three proof checks before applying compensating credit", () => {
    const withoutArtifact = runFixFirstTriage(
      values({
        impact: 4,
        likelihood: 4,
        compensating_credit: 3,
        proofs: { actor: true, cadence: true, artifact: false },
      }),
    );
    const withAllProofs = runFixFirstTriage(
      values({
        impact: 4,
        likelihood: 4,
        compensating_credit: 3,
        proofs: { actor: true, cadence: true, artifact: true },
      }),
    );

    expect(withoutArtifact).toMatchObject({ score: 16, compensating_credit: 0 });
    expect(withoutArtifact).toHaveProperty("warning");
    expect(withAllProofs).toMatchObject({ score: 13, compensating_credit: 3 });
  });
});
