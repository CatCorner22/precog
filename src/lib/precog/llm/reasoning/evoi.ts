/**
 * Expected Value of Information (EVOI) — what to measure / verify next.
 * VOI ≈ reduction in expected loss from resolving uncertainty on a factor.
 */
import type { StaffComposition } from "../../types";
import type { RiskVariableState } from "../../scoring/dynamic-variables";
import { initBayesianState } from "./bayesian";
import { crimeFraudStats } from "../../demo-data";
import { portfolioSummary } from "../../scoring/residual-engine";
import { scoreLeadingIndicators } from "../../ml/leading-indicators";
import { rankDangerousScenarios, runPrecogScenario } from "../../engine";

export interface EvoiItem {
  id: string;
  observation: string;
  /** Expected reduction in Bayesian EAL if observation resolves uncertainty */
  evoi: number;
  effort: "low" | "medium" | "high";
  linkedTab: string;
  rationale: string;
}

export interface EvoiReport {
  baselineEal: number;
  items: EvoiItem[];
  topObservation: string;
  method: string;
}

export function computeEvoi(
  staff: StaffComposition,
  vars: RiskVariableState,
): EvoiReport {
  const leading = scoreLeadingIndicators(staff, vars);
  const residual = portfolioSummary(staff).averageResidual;
  const ranked = rankDangerousScenarios({ staff, riskVariables: vars });
  const top = ranked[0]
    ? runPrecogScenario(ranked[0].scenario.id, { staff, riskVariables: vars })
    : null;

  const bayes = initBayesianState({
    industryBaseRate: crimeFraudStats.industryEmbezzlementRate,
    retainedExpected: top?.retainedImpact.expected ?? 25000,
    residualAverage: residual,
    leadingPressure: leading.pressureIndex,
    dualControl: staff.dualControlPayments,
    independentBankRec: staff.independentBankRec,
  });

  const baselineEal = bayes.expectedAnnualLoss;
  // Uncertainty mass ~ width of CI * severity
  const pWidth =
    bayes.failureProbability.ci95.high - bayes.failureProbability.ci95.low;
  const uncertaintyMass = pWidth * bayes.severity.mean * 0.12;

  const items: EvoiItem[] = [
    {
      id: "evoi_bank_rec_sample",
      observation: "Owner re-performs last 2 bank reconciliations",
      evoi: uncertaintyMass * (staff.independentBankRec ? 0.25 : 0.55),
      effort: "low",
      linkedTab: "precog",
      rationale:
        "Resolves detection-lag uncertainty; highest VOI when recon is not independent.",
    },
    {
      id: "evoi_writeoff_aging",
      observation: "Export 90-day adjustment/write-off aging with reason codes",
      evoi: uncertaintyMass * 0.4 + (residual / 100) * 800,
      effort: "low",
      linkedTab: "sod",
      rationale: "Collapses uncertainty on unauthorized adjustment residual.",
    },
    {
      id: "evoi_spof_interview",
      observation: "30-min knowledge interview with sole owners + name a backup",
      evoi: uncertaintyMass * 0.3 + staff.soleOwnerKnowledgeCount * 350,
      effort: "medium",
      linkedTab: "knowledge",
      rationale: "Reduces continuity residual variance and SPOF cascade uncertainty.",
    },
    {
      id: "evoi_camera_audit",
      observation: "Verify camera coverage of cash drawer/safe (or note gaps)",
      evoi: vars.hasSecurityCameras ? uncertaintyMass * 0.1 : uncertaintyMass * 0.22,
      effort: "low",
      linkedTab: "precog",
      rationale: "Confirms whether premium credit and deterrence assumptions hold.",
    },
    {
      id: "evoi_policy_terms",
      observation: "Read crime policy deductible, limit, and control warranties",
      evoi: uncertaintyMass * 0.35 + vars.deductible * 0.02,
      effort: "medium",
      linkedTab: "precog",
      rationale: "Retained vs transferred math is only as good as policy facts.",
    },
    {
      id: "evoi_vendor_master",
      observation: "List vendors added/changed in 90 days; dual-review new ones",
      evoi: uncertaintyMass * 0.28,
      effort: "medium",
      linkedTab: "sod",
      rationale: "Cuts posterior weight on vendor fraud path.",
    },
  ];

  items.sort((a, b) => b.evoi - a.evoi);

  return {
    baselineEal,
    items: items.map((i) => ({ ...i, evoi: Math.round(i.evoi) })),
    topObservation: items[0]?.observation ?? "",
    method: "EVOI ≈ CI-width × severity × path relevance (educational)",
  };
}
