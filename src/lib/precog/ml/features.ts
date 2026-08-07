/**
 * Feature vectorization for classical ML scoring.
 * Pure TypeScript — no heavy deps.
 */
import type { StaffComposition } from "../types";
import type { RiskVariableState } from "../scoring/dynamic-variables";
import { controls } from "../demo-data";
import { findKnowledgeRisks } from "../engine";
import { portfolioSummary } from "../scoring/residual-engine";
import { assessCoso } from "../coso";

export interface PracticeFeatureVector {
  names: string[];
  values: number[];
  labeled: Record<string, number>;
}

export function buildFeatureVector(
  staff: StaffComposition,
  riskVars: RiskVariableState,
): PracticeFeatureVector {
  const portfolio = portfolioSummary(staff);
  const coso = assessCoso();
  const spofs = findKnowledgeRisks().filter((r) => r.soleOwner);
  const sodGaps = controls.filter((c) => !c.segregated).length;
  const openSod = controls.filter(
    (c) => !c.segregated && !c.residualRiskAccepted,
  ).length;

  const labeled: Record<string, number> = {
    team_size: staff.teamSize,
    segregation_score: staff.segregationScore,
    sole_owner_knowledge: staff.soleOwnerKnowledgeCount,
    avg_tenure: staff.avgTenureYears,
    dual_control: staff.dualControlPayments ? 1 : 0,
    independent_bank_rec: staff.independentBankRec ? 1 : 0,
    cameras: riskVars.hasSecurityCameras ? 1 : 0,
    alarm: riskVars.hasAlarmAccess ? 1 : 0,
    bonded: riskVars.hasBondedCashHandlers ? 1 : 0,
    deductible: riskVars.deductible,
    policy_limit: riskVars.policyLimit,
    base_premium: riskVars.basePremiumAnnual,
    claims_load: riskVars.claimsLoadFactor,
    daily_cash: riskVars.dailyCashExposure,
    avg_residual: portfolio.averageResidual,
    critical_path_count: portfolio.criticalPath,
    act_now_count: portfolio.actNow,
    coso_overall: coso.overall,
    spof_count: spofs.length,
    sod_gap_count: sodGaps,
    open_sod_without_accept: openSod,
    discount_cap: riskVars.maxDiscountPct,
  };

  const names = Object.keys(labeled);
  const values = names.map((n) => labeled[n]);
  return { names, values, labeled };
}

/** Z-score normalize against a reference "healthy small practice" prior. */
export const HEALTHY_PRIOR: Record<string, { mean: number; std: number }> = {
  team_size: { mean: 8, std: 3 },
  segregation_score: { mean: 70, std: 15 },
  sole_owner_knowledge: { mean: 1, std: 1.5 },
  avg_tenure: { mean: 4, std: 2 },
  dual_control: { mean: 1, std: 0.35 },
  independent_bank_rec: { mean: 1, std: 0.35 },
  cameras: { mean: 1, std: 0.4 },
  alarm: { mean: 0.7, std: 0.4 },
  bonded: { mean: 0.6, std: 0.4 },
  deductible: { mean: 5000, std: 4000 },
  policy_limit: { mean: 100000, std: 50000 },
  base_premium: { mean: 4000, std: 1500 },
  claims_load: { mean: 1.0, std: 0.25 },
  daily_cash: { mean: 2500, std: 1500 },
  avg_residual: { mean: 35, std: 12 },
  critical_path_count: { mean: 0.5, std: 1 },
  act_now_count: { mean: 1, std: 1.5 },
  coso_overall: { mean: 72, std: 12 },
  spof_count: { mean: 1, std: 1.2 },
  sod_gap_count: { mean: 1, std: 1.5 },
  open_sod_without_accept: { mean: 0.5, std: 1 },
  discount_cap: { mean: 25, std: 5 },
};

export function zScores(fv: PracticeFeatureVector): Record<string, number> {
  const out: Record<string, number> = {};
  for (const name of fv.names) {
    const prior = HEALTHY_PRIOR[name] ?? { mean: 0, std: 1 };
    out[name] = (fv.labeled[name] - prior.mean) / (prior.std || 1);
  }
  return out;
}
