/**
 * Residual trajectory forecast under do-nothing vs control levers.
 * Simple discrete-time model with exponential decay under remediation
 * and drift under neglected residual — educational, not actuarial.
 */
import type { StaffComposition } from "../types";
import type { RiskVariableState } from "../scoring/dynamic-variables";
import { portfolioSummary } from "../scoring/residual-engine";
import {
  simulateCascadeLever,
  type CascadeLeverId,
} from "../scoring/variable-cascade";
import { scoreAnomalies } from "./anomaly";
import { scoreLeadingIndicators } from "./leading-indicators";

export interface ForecastPoint {
  week: number;
  residualDoNothing: number;
  residualWithPlan: number;
  anomalyDoNothing: number;
  anomalyWithPlan: number;
}

export interface ResidualForecast {
  horizonWeeks: number;
  baselineResidual: number;
  baselineAnomaly: number;
  planLabel: string;
  planLeverIds: CascadeLeverId[];
  points: ForecastPoint[];
  narrative: string[];
  p50CrossingWeek: number | null; // when residual may hit act-now if drifting
  method: string;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Do-nothing: residual drifts up slowly when SPOFs / open SoD / high anomaly.
 * With plan: step-down when levers applied, then mild mean-reversion.
 */
export function forecastResidualTrajectory(
  staff: StaffComposition,
  riskVars: RiskVariableState,
  opts: {
    horizonWeeks?: number;
    leverIds?: CascadeLeverId[];
  } = {},
): ResidualForecast {
  const horizonWeeks = opts.horizonWeeks ?? 12;
  const leverIds: CascadeLeverId[] =
    opts.leverIds ??
    ([
      "enable_dual_control",
      "enable_independent_bank_rec",
    ] as CascadeLeverId[]);

  const base = portfolioSummary(staff);
  const anomaly = scoreAnomalies(staff, riskVars);
  const leading = scoreLeadingIndicators(staff, riskVars);

  let residualDn = base.averageResidual;
  let residualPlan = base.averageResidual;
  let anomalyDn = anomaly.overallScore;
  let anomalyPlan = anomaly.overallScore;

  // Apply levers instantly at week 1 for plan path
  let plannedStaff = { ...staff };
  let plannedVars = { ...riskVars };
  const labels: string[] = [];
  for (const id of leverIds) {
    const sim = simulateCascadeLever(id, plannedVars, plannedStaff);
    plannedStaff = sim.staffAfter;
    plannedVars = sim.variablesAfter;
    labels.push(sim.lever.label);
  }
  const planPortfolio = portfolioSummary(plannedStaff);
  const planAnomaly = scoreAnomalies(plannedStaff, plannedVars);
  const planTargetResidual = planPortfolio.averageResidual;
  const planTargetAnomaly = planAnomaly.overallScore;

  // Drift rate: higher leading pressure → faster residual climb if ignored
  const driftPerWeek =
    0.15 +
    leading.pressureIndex / 200 +
    (anomaly.band === "critical" ? 0.35 : anomaly.band === "stressed" ? 0.2 : 0.05);

  const points: ForecastPoint[] = [];
  let p50CrossingWeek: number | null = null;

  for (let w = 0; w <= horizonWeeks; w++) {
    if (w === 0) {
      points.push({
        week: 0,
        residualDoNothing: Math.round(residualDn * 10) / 10,
        residualWithPlan: Math.round(residualPlan * 10) / 10,
        anomalyDoNothing: anomalyDn,
        anomalyWithPlan: anomalyPlan,
      });
      continue;
    }

    // Do nothing drifts toward higher residual, capped
    residualDn = clamp(residualDn + driftPerWeek, 0, 95);
    anomalyDn = clamp(anomalyDn + driftPerWeek * 1.2, 0, 100);

    // Plan: exponential approach to improved target after week 1
    if (w === 1) {
      residualPlan = planTargetResidual;
      anomalyPlan = planTargetAnomaly;
    } else {
      residualPlan = residualPlan * 0.92 + planTargetResidual * 0.08;
      anomalyPlan = anomalyPlan * 0.9 + planTargetAnomaly * 0.1;
      // mild re-drift if leading indicators still hot
      residualPlan = clamp(
        residualPlan + leading.pressureIndex / 800,
        0,
        95,
      );
    }

    if (p50CrossingWeek == null && residualDn >= 60 && base.averageResidual < 60) {
      p50CrossingWeek = w;
    }

    points.push({
      week: w,
      residualDoNothing: Math.round(residualDn * 10) / 10,
      residualWithPlan: Math.round(residualPlan * 10) / 10,
      anomalyDoNothing: Math.round(anomalyDn),
      anomalyWithPlan: Math.round(anomalyPlan),
    });
  }

  const end = points[points.length - 1];
  const narrative = [
    `Baseline avg residual ${base.averageResidual}; anomaly band ${anomaly.band} (${anomaly.overallScore}/100).`,
    `Leading-indicator pressure ${leading.pressureIndex}/100 drives do-nothing drift ~${driftPerWeek.toFixed(2)} residual pts/week.`,
    `Plan (${labels.join(" + ")}) targets residual ~${planTargetResidual} and anomaly ~${planTargetAnomaly}.`,
    `At week ${horizonWeeks}: do-nothing residual ${end.residualDoNothing} vs plan ${end.residualWithPlan}.`,
  ];
  if (p50CrossingWeek != null) {
    narrative.push(
      `Under neglect, residual may enter Act-now (≥60) around week ${p50CrossingWeek}.`,
    );
  }
  narrative.push(
    "Educational trajectory model — re-score after real staff or insurance changes.",
  );

  return {
    horizonWeeks,
    baselineResidual: base.averageResidual,
    baselineAnomaly: anomaly.overallScore,
    planLabel: labels.join(" + "),
    planLeverIds: leverIds,
    points,
    narrative,
    p50CrossingWeek,
    method: "discrete residual drift + lever step-down (classical time series)",
  };
}
