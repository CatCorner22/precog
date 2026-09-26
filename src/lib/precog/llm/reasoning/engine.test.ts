import { describe, expect, it } from "vitest";
import { resolveTemplate } from "../../active-template";
import { INDUSTRIES } from "../../industry";
import { defaultProfile, type PracticeProfile } from "../../practice-profile";
import { beamSearchLevers } from "./beam-search";
import { summarizeCausalInfluence } from "./causal-graph";
import { runAdvancedReasoning } from "./engine";
import { verifyNext } from "./verify-next";

function reasoning(profile: PracticeProfile) {
  return runAdvancedReasoning(resolveTemplate(profile), profile.staff, profile.riskVariables);
}

function withControls(profile: PracticeProfile, on: boolean): PracticeProfile {
  return {
    ...profile,
    staff: { ...profile.staff, independentBankRec: on, dualControlPayments: on },
    riskVariables: {
      ...profile.riskVariables,
      hasIndependentBankRec: on,
      hasDualControl: on,
    },
  };
}

describe("causal paths", () => {
  const [dual, cameras] = summarizeCausalInfluence(["dual_control", "cameras"]);

  it("finds four-edge paths and ranks them strongest first", () => {
    const edges = (narrative: string) => narrative.split("; ").length;
    expect(dual.topPaths.some((p) => edges(p.narrative) === 4)).toBe(true);
    const scores = dual.topPaths.map((p) => Math.abs(p.score));
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it("routes dual control's strongest path through fraud likelihood or scheme size, not the premium", () => {
    expect(dual.topPaths[0].narrative).toMatch(/^dual_control→(likelihood|severity)/);
  });

  it("scores dual control as lowering the pressure to act more than cameras do", () => {
    expect(dual.netToDecision).toBeLessThan(0);
    expect(Math.abs(dual.netToDecision)).toBeGreaterThan(Math.abs(cameras.netToDecision));
  });
});

describe("beam search", () => {
  it("keeps a shorter sequence when a longer one adds nothing, and every step adds utility", () => {
    const profile = defaultProfile("dental");
    const tpl = resolveTemplate(profile);
    const shallow = beamSearchLevers(tpl, profile.staff, profile.riskVariables, { depth: 1 });
    const deep = beamSearchLevers(tpl, profile.staff, profile.riskVariables, { depth: 3 });
    expect(deep.best.utility).toBeGreaterThanOrEqual(shallow.best.utility);
    expect(deep.best.marginalUtility).toBeGreaterThan(0);
    expect(deep.best.sequence).not.toContain("raise_segregation_75");
  });
});

describe("runAdvancedReasoning", () => {
  for (const { id } of INDUSTRIES) {
    it(`recommends no lever the side-by-side comparison rejects (${id})`, () => {
      const report = reasoning(defaultProfile(id));
      const rejected = report.counterfactual.top
        .filter((c) => c.narrative.includes("does not clearly improve"))
        .map((c) => c.label);
      for (const step of report.recommendedSequence) expect(rejected).not.toContain(step);
      for (const c of report.counterfactual.top) expect(c.narrative).not.toMatch(/about 0 points/);
    });
  }

  it("names the lever with the largest residual drop as the best single lever", () => {
    const report = reasoning(defaultProfile("dental"));
    expect(report.counterfactual.bestIntervention).toBe(
      "Cameras + dual control + bank rec (stack)",
    );
    expect(report.synthesis[3]).toBe(
      "Strongest causal path to the owner's decision: dual control.",
    );
  });

  it("changes its advice when the business already runs the controls", () => {
    const base = defaultProfile("dental");
    const off = reasoning(withControls(base, false));
    const on = reasoning(withControls(base, true));
    expect(on.recommendedSequence).not.toEqual(off.recommendedSequence);
    expect(on.evoi.topObservation).not.toBe(off.evoi.topObservation);
  });
});

describe("verifyNext", () => {
  it("puts the bank reconciliation check first only while nobody independent reconciles", () => {
    const { staff, riskVariables } = defaultProfile("retail");
    const without = verifyNext({ ...staff, independentBankRec: false }, riskVariables);
    const withRec = verifyNext(
      { ...staff, independentBankRec: true, soleOwnerKnowledgeCount: 2 },
      riskVariables,
    );
    expect(without.items[0].id).toBe("evoi_bank_rec_sample");
    expect(withRec.items[0].id).not.toBe("evoi_bank_rec_sample");
    expect(withRec.items.map((i) => i.id)).toContain("evoi_bank_rec_sample");
  });
});
