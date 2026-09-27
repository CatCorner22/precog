/**
 * Lever ordering for the coach and the Reasoning panel: which control or
 * insurance lever to switch on first, which single lever lowers the residual
 * index most, how each lever reaches the owner's decision, and what to verify
 * next. Every figure behind the ordering is one of this app's weights, so the
 * report carries the order and the reasons and never the decimals.
 */
import type { StaffComposition } from "../../types";
import type { RiskVariableState } from "../../scoring/dynamic-variables";
import type { IndustryTemplate } from "../../templates";
import { portfolioSummary } from "../../scoring/residual-engine";
import { rankDangerousScenarios } from "../../engine";
import { summarizeCausalInfluence, type CausalNodeId } from "./causal-graph";
import { beamSearchLevers } from "./beam-search";
import { runCounterfactuals, type ReasoningBaseline } from "./counterfactual";
import { verifyNext, type VerifyNextItem } from "./verify-next";

export interface AdvancedReasoningReport {
  /** Levers in the order the model prefers; empty when no lever improves on the current setup. */
  recommendedSequence: string[];
  beam: {
    /** Distinct sequences the search compared, best first. */
    frontier: { sequence: string }[];
  };
  counterfactual: {
    bestIntervention: string;
    top: { label: string; narrative: string }[];
  };
  causal: {
    intervention: CausalNodeId;
    netToDecision: number;
    topPath: string;
  }[];
  evoi: {
    topObservation: string;
    items: Omit<VerifyNextItem, "id">[];
  };
  synthesis: string[];
}

export function runAdvancedReasoning(
  tpl: IndustryTemplate,
  staff: StaffComposition,
  riskVars: RiskVariableState,
): AdvancedReasoningReport {
  const baseline = reasoningBaseline(tpl, staff, riskVars);
  const causal = summarizeCausalInfluence(INTERVENTIONS).map((c) => ({
    intervention: c.intervention,
    netToDecision: Math.round(c.netToDecision * 1000) / 1000,
    topPath: c.topPaths[0]?.narrative ?? "no path",
  }));
  const beam = beamSearchLevers(tpl, staff, riskVars, { beamWidth: 4, depth: 3 });
  const cf = runCounterfactuals(tpl, staff, riskVars, baseline);
  const checks = verifyNext(staff, riskVars);

  const recommendedSequence = beam.best.labels;
  const strongest = [...causal].sort(
    (a, b) => Math.abs(b.netToDecision) - Math.abs(a.netToDecision),
  )[0];

  const synthesis = [
    recommendedSequence.length
      ? `Levers in the order this app's model prefers: ${recommendedSequence.join(" → ")}.`
      : "No lever in this app's model improves on the current setup.",
    `Single lever that lowers the residual index most in a side-by-side comparison: ${cf.bestIntervention}.`,
    `Most useful thing to verify next: ${checks.topObservation}.`,
    `Strongest causal path to the owner's decision: ${strongest ? CAUSAL_LABEL[strongest.intervention] : "none"}.`,
    "Basis: every figure behind this ordering is one of this app's weights, not a measurement of this business.",
  ];

  return {
    recommendedSequence,
    beam: { frontier: beam.frontier },
    counterfactual: {
      bestIntervention: cf.bestIntervention,
      top: cf.counterfactuals.slice(0, 5).map((c) => ({ label: c.label, narrative: c.narrative })),
    },
    causal,
    evoi: {
      topObservation: checks.topObservation,
      items: checks.items
        .slice(0, 5)
        .map(({ observation, effort, rationale }) => ({ observation, effort, rationale })),
    },
    synthesis,
  };
}

/** The residual and the most dangerous scenario as the business stands, computed once per report. */
function reasoningBaseline(
  tpl: IndustryTemplate,
  staff: StaffComposition,
  riskVars: RiskVariableState,
): ReasoningBaseline {
  const ranked = rankDangerousScenarios(tpl, { staff, riskVariables: riskVars });
  return {
    residual: portfolioSummary(tpl, staff).averageResidual,
    topScenarioId: ranked[0]?.scenario.id ?? null,
  };
}

/** The levers traced to the decision, with the words the synthesis uses for each. */
const CAUSAL_LABEL = {
  dual_control: "dual release",
  bank_rec: "independent bank reconciliation",
  cameras: "cameras",
  segregation: "separation of duties",
  deductible: "the insurance deductible",
} satisfies Partial<Record<CausalNodeId, string>>;

const INTERVENTIONS = Object.keys(CAUSAL_LABEL) as (keyof typeof CAUSAL_LABEL)[];
