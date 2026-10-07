import { describe, expect, it } from "vitest";
import { resolveTemplate } from "../../active-template";
import { INDUSTRIES } from "../../industry";
import { defaultProfile, type PracticeProfile } from "../../practice-profile";
import { DEFAULT_RISK_VARIABLES } from "../../scoring/dynamic-variables";
import { confirmedScenarioIds } from "../../scoring/scope";
import { simulateAllCascades, simulateCascadeLever } from "../../scoring/variable-cascade";
import type { Person } from "../../types";
import { executeTool } from "../tools";
import { beamSearchLevers } from "./beam-search";
import { summarizeCausalInfluence } from "./causal-graph";
import { reasoningBaseline, runAdvancedReasoning } from "./engine";
import { runCounterfactuals } from "./counterfactual";
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
      "Cameras + dual release + bank reconciliation (stack)",
    );
    expect(report.synthesis[3]).toBe(
      "Strongest causal path to the owner's decision: dual release.",
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

describe("counterfactual scenario scope", () => {
  const own = resolveTemplate({
    industry: "dental",
    customPeople: [
      { id: "own-1", name: "Ana Ruiz", role: "Owner", active: true, entitlements: [] } as Person,
    ],
  });
  const staff = own.staffComposition;
  const riskVars = DEFAULT_RISK_VARIABLES;

  it("does not price unconfirmed starter scenarios", () => {
    const scope = { confirmedScenarioIds: new Set<string>() };
    const baseline = reasoningBaseline(own, staff, riskVars, scope);
    const report = runCounterfactuals(own, staff, riskVars, baseline, undefined, scope);

    expect(report.counterfactuals.every((c) => c.delta.annualCor === 0)).toBe(true);
  });

  it("prices a confirmed vendor scenario and its response to a lever", () => {
    const scope = { confirmedScenarioIds: new Set(["sc-vendor-fraud"]) };
    const baseline = reasoningBaseline(own, staff, riskVars, scope);
    const report = runCounterfactuals(own, staff, riskVars, baseline, undefined, scope);

    expect(report.counterfactuals.some((c) => c.delta.annualCor !== 0)).toBe(true);
  });
});

/** The dental sample with the owner's own people, and a decision logged on each confirmed scenario. */
function ownDental(confirmed: string[]): PracticeProfile {
  return {
    ...defaultProfile("dental"),
    customPeople: [
      { id: "own-1", name: "Ana Ruiz", role: "Owner", active: true, entitlements: [] } as Person,
    ],
    decisions: confirmed.map((id) => ({
      id: `d-${id}`,
      createdAt: "2026-10-01T00:00:00.000Z",
      subject: "This could happen here",
      kind: "monitor",
      note: "",
      linkedTab: "precog",
      linkedId: id,
      linkedIndustry: "dental",
    })),
  };
}

/** Advanced reasoning as the panel runs it: the profile's confirmed scenarios and settings. */
function scopedReasoning(profile: PracticeProfile) {
  return runAdvancedReasoning(resolveTemplate(profile), profile.staff, profile.riskVariables, {
    confirmedScenarioIds: confirmedScenarioIds(profile.decisions, profile.industry),
    riskVariables: profile.riskVariables,
  });
}

const STACK = "Cameras + dual release + bank reconciliation (stack)";
const CASH_CUT = "Cut daily cash exposure 20%";
const DENTAL_SCOPE_NOTE =
  'Sample scenarios from the dental office sample (6) stay out: their losses and timelines are the sample\'s assumptions, not facts about your business. To make one your own, open it on What could happen and choose "This could happen here"; it then counts in the priority list and your totals.';

describe("one scenario scope for the beam, the counterfactual and Pioneer", () => {
  it("never puts the daily cash cut in the beam for an own business with nothing confirmed", () => {
    const profile = ownDental([]);
    const report = scopedReasoning(profile);
    expect(report.recommendedSequence).toEqual([STACK]);
    for (const f of report.beam.frontier) expect(f.sequence).not.toContain(CASH_CUT);

    // Called without a scenario, the beam still prices no sample scenario.
    const tpl = resolveTemplate(profile);
    const beam = beamSearchLevers(
      tpl,
      profile.staff,
      profile.riskVariables,
      { depth: 3 },
      { confirmedScenarioIds: new Set() },
    );
    expect(beam.best.sequence).not.toContain("cut_daily_cash_20pct");
  });

  it("says which sample scenarios stay out, on the report and in the Pioneer tool summary", () => {
    const profile = ownDental([]);
    expect(scopedReasoning(profile).scopeNote).toBe(DENTAL_SCOPE_NOTE);
    const tool = executeTool("run_advanced_reasoning", { profile });
    expect(tool.summary).toBe(
      `Lever ordering: ${STACK} · verify next: Owner re-performs the last 2 bank reconciliations · ${DENTAL_SCOPE_NOTE}`,
    );
  });

  it("keeps the sample's ordering and shows no note", () => {
    const report = scopedReasoning(defaultProfile("dental"));
    expect(report.recommendedSequence).toEqual([STACK]);
    expect(report.scopeNote).toBeNull();
  });

  it("gives Pioneer's variable_cascades the residual the What else moves panel shows", () => {
    const profile = ownDental(["sc-vendor-fraud"]);
    const tpl = resolveTemplate(profile);
    // The panel's call (cascade-panel.tsx).
    const panel = simulateAllCascades(tpl, profile.riskVariables, profile.staff, undefined, {
      confirmedScenarioIds: confirmedScenarioIds(profile.decisions, profile.industry),
    });
    const tool = executeTool("simulate_variable_cascades", { profile });
    const data = tool.data as { scenarioId: string; baseline: { residualAverage: number } };
    expect(data.scenarioId).toBe("sc-vendor-fraud");
    expect(panel.baseline.residualAverage).toBe(59);
    expect(data.baseline.residualAverage).toBe(panel.baseline.residualAverage);
  });

  it("pins the dental sample's cameras cascade and its counterfactual sentence", () => {
    const profile = defaultProfile("dental");
    const tpl = resolveTemplate(profile);
    const cameras = simulateCascadeLever(
      tpl,
      "enable_cameras",
      profile.riskVariables,
      profile.staff,
      undefined,
      { confirmedScenarioIds: new Set() },
    );
    expect(cameras.before.residualAverage).toBe(60);
    expect(cameras.after.residualAverage).toBe(59);
    expect(cameras.overallVerdict).toBe(
      "average residual risk falls 1 point. No tradeoffs in this model.",
    );

    const narratives = scopedReasoning(profile).counterfactual.top.map((c) => c.narrative);
    expect(narratives).toContain(
      'Switching on "Install security cameras (cash/safe/front)" lowers the residual index by about 1 point and lowers the cost-of-risk figure.',
    );
    expect(narratives).toContain(
      `Switching on "${STACK}" lowers the residual index by about 9 points and lowers the cost-of-risk figure.`,
    );
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
