/**
 * Advanced reasoning orchestrator for Pioneer.
 * Composes Bayesian updates, causal multi-hop, beam search, counterfactuals, EVOI.
 */
import type { StaffComposition } from "../../types";
import type { RiskVariableState } from "../../scoring/dynamic-variables";
import { initBayesianState } from "./bayesian";
import { summarizeCausalInfluence, type CausalNodeId } from "./causal-graph";
import { beamSearchLevers } from "./beam-search";
import { runCounterfactuals } from "./counterfactual";
import { computeEvoi } from "./evoi";
import { crimeFraudStats } from "../../demo-data";
import { portfolioSummary } from "../../scoring/residual-engine";
import { scoreLeadingIndicators } from "../../ml/leading-indicators";
import { rankDangerousScenarios, runPrecogScenario } from "../../engine";

export interface AdvancedReasoningReport {
  method: string;
  bayesian: {
    pFail: number;
    pFailCi: { low: number; high: number };
    expectedAnnualLoss: number;
    severityMean: number;
    updates: string[];
  };
  causal: {
    intervention: string;
    netToDecision: number;
    topPath: string;
  }[];
  beam: {
    method: string;
    bestSequence: string;
    utility: number;
    residual: number;
    annualCor: number;
    frontier: { sequence: string; utility: number; residual: number; annualCor: number }[];
  };
  counterfactual: {
    bestIntervention: string;
    factualPFail: number;
    factualEal: number;
    top: {
      label: string;
      deltaResidual: number;
      deltaCor: number;
      deltaBayesEal: number;
      narrative: string;
    }[];
  };
  evoi: {
    topObservation: string;
    baselineEal: number;
    items: { observation: string; evoi: number; effort: string; rationale: string }[];
  };
  synthesis: string[];
  recommendedSequence: string[];
  confidence: {
    label: string;
    score: number;
    drivers: string[];
  };
}

export function runAdvancedReasoning(
  staff: StaffComposition,
  riskVars: RiskVariableState,
): AdvancedReasoningReport {
  const leading = scoreLeadingIndicators(staff, riskVars);
  const residual = portfolioSummary(staff).averageResidual;
  const ranked = rankDangerousScenarios({ staff, riskVariables: riskVars });
  const top = ranked[0]
    ? runPrecogScenario(ranked[0].scenario.id, {
        staff,
        riskVariables: riskVars,
      })
    : null;

  const bayes = initBayesianState({
    industryBaseRate: crimeFraudStats.industryEmbezzlementRate,
    retainedExpected: top?.retainedImpact.expected ?? 25000,
    residualAverage: residual,
    leadingPressure: leading.pressureIndex,
    dualControl: staff.dualControlPayments,
    independentBankRec: staff.independentBankRec,
  });

  const interventions: CausalNodeId[] = [
    "dual_control",
    "bank_rec",
    "cameras",
    "segregation",
    "deductible",
  ];
  const causal = summarizeCausalInfluence(interventions).map((c) => ({
    intervention: c.intervention,
    netToDecision: Math.round(c.netToDecision * 1000) / 1000,
    topPath: c.topPaths[0]?.narrative ?? "no path",
  }));

  const beam = beamSearchLevers(staff, riskVars, { beamWidth: 4, depth: 3 });
  const cf = runCounterfactuals(staff, riskVars);
  const evoi = computeEvoi(staff, riskVars);

  const recommendedSequence = beam.best.labels.length
    ? beam.best.labels
    : [cf.bestIntervention];

  // Confidence: tighter CI + more improving counterfactuals + beam utility
  const ciWidth =
    bayes.failureProbability.ci95.high - bayes.failureProbability.ci95.low;
  const improveCount = cf.counterfactuals.filter((c) => c.wouldImprove).length;
  let conf = 55;
  conf += Math.max(0, 15 - ciWidth * 40);
  conf += Math.min(15, improveCount * 3);
  conf += Math.min(10, beam.best.utility * 12);
  conf = Math.max(35, Math.min(88, Math.round(conf)));

  const synthesis = [
    `Bayesian P(material failure) ≈ ${(bayes.failureProbability.mean * 100).toFixed(1)}% (95% CI ${(bayes.failureProbability.ci95.low * 100).toFixed(1)}–${(bayes.failureProbability.ci95.high * 100).toFixed(1)}%); EAL ≈ $${Math.round(bayes.expectedAnnualLoss).toLocaleString()}.`,
    `Beam-optimal sequence (depth ${beam.depth}): ${beam.best.labels.join(" → ") || "status quo"} · utility ${beam.best.utility.toFixed(3)} · residual ${beam.best.residual} · CoR $${Math.round(beam.best.annualCor).toLocaleString()}.`,
    `Best counterfactual twin: ${cf.bestIntervention} (factual P(fail) ${(cf.factual.bayesPFail * 100).toFixed(1)}%, EAL $${Math.round(cf.factual.bayesEal).toLocaleString()}).`,
    `Highest EVOI observation: ${evoi.topObservation} (EVOI ≈ $${evoi.items[0]?.evoi.toLocaleString() ?? 0}).`,
    `Strongest causal intervention to owner decision: ${[...causal].sort((a, b) => Math.abs(b.netToDecision) - Math.abs(a.netToDecision))[0]?.intervention ?? "n/a"}.`,
  ];

  return {
    method:
      "Bayesian Beta + causal multi-hop + beam search + twin counterfactuals + EVOI",
    bayesian: {
      pFail: bayes.failureProbability.mean,
      pFailCi: bayes.failureProbability.ci95,
      expectedAnnualLoss: bayes.expectedAnnualLoss,
      severityMean: bayes.severity.mean,
      updates: bayes.updates,
    },
    causal,
    beam: {
      method: beam.method,
      bestSequence: beam.best.labels.join(" → "),
      utility: beam.best.utility,
      residual: beam.best.residual,
      annualCor: beam.best.annualCor,
      frontier: beam.frontier,
    },
    counterfactual: {
      bestIntervention: cf.bestIntervention,
      factualPFail: cf.factual.bayesPFail,
      factualEal: cf.factual.bayesEal,
      top: cf.counterfactuals.slice(0, 5).map((c) => ({
        label: c.label,
        deltaResidual: c.delta.residual,
        deltaCor: c.delta.annualCor,
        deltaBayesEal: c.delta.bayesEal,
        narrative: c.narrative,
      })),
    },
    evoi: {
      topObservation: evoi.topObservation,
      baselineEal: evoi.baselineEal,
      items: evoi.items.slice(0, 5).map((i) => ({
        observation: i.observation,
        evoi: i.evoi,
        effort: i.effort,
        rationale: i.rationale,
      })),
    },
    synthesis,
    recommendedSequence,
    confidence: {
      label:
        conf >= 75
          ? "high (for a demo model)"
          : conf >= 55
            ? "moderate"
            : "low — gather EVOI observations first",
      score: conf,
      drivers: [
        `CI width ${(ciWidth * 100).toFixed(1)} pts`,
        `${improveCount} improving counterfactuals`,
        `beam utility ${beam.best.utility.toFixed(3)}`,
      ],
    },
  };
}
