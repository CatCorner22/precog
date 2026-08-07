/**
 * Multivariate anomaly scoring (Mahalanobis-lite on diagonal prior).
 * Flags unusual practice control/insurance configurations vs healthy prior.
 */
import {
  buildFeatureVector,
  zScores,
  type PracticeFeatureVector,
} from "./features";
import type { StaffComposition } from "../types";
import type { RiskVariableState } from "../scoring/dynamic-variables";

export interface AnomalyFinding {
  feature: string;
  value: number;
  z: number;
  severity: "info" | "watch" | "alert";
  message: string;
}

export interface AnomalyReport {
  overallScore: number; // 0–100 higher = more anomalous / stressed
  band: "stable" | "elevated" | "stressed" | "critical";
  findings: AnomalyFinding[];
  featureVector: PracticeFeatureVector;
  method: string;
}

const FEATURE_MESSAGES: Record<string, (v: number, z: number) => string> = {
  avg_residual: (v, z) =>
    z > 0
      ? `Average residual ${v} is ${z.toFixed(1)}σ above a healthy practice prior`
      : `Average residual ${v} is healthier than prior`,
  critical_path_count: (v) =>
    `${v} critical-path residual(s) — each needs owner attention`,
  spof_count: (v) => `${v} knowledge SPOF(s) elevate continuity anomaly`,
  open_sod_without_accept: (v) =>
    `${v} SoD gap(s) without residual acceptance — unmeasured risk`,
  dual_control: (v) =>
    v < 0.5 ? "Dual control off — control + insurance credit both weak" : "Dual control on",
  independent_bank_rec: (v) =>
    v < 0.5
      ? "Independent bank rec off — detection lag anomaly"
      : "Independent bank rec on",
  claims_load: (v, z) =>
    z > 0.5
      ? `Claims load factor ${v.toFixed(2)} elevates premium and likelihood priors`
      : `Claims load ${v.toFixed(2)} near clean`,
  sole_owner_knowledge: (v) =>
    `${v} sole-owner knowledge items in staff composition`,
  segregation_score: (v, z) =>
    z < -0.5
      ? `Segregation score ${v} is weak vs prior — staff residual uplift`
      : `Segregation score ${v}`,
  daily_cash: (v, z) =>
    z > 1
      ? `Daily cash exposure ${v} is high — severity scale elevated`
      : `Daily cash exposure ${v}`,
  coso_overall: (v, z) =>
    z < -0.5
      ? `COSO overall ${v} below healthy prior`
      : `COSO overall ${v}`,
};

export function scoreAnomalies(
  staff: StaffComposition,
  riskVars: RiskVariableState,
): AnomalyReport {
  const fv = buildFeatureVector(staff, riskVars);
  const z = zScores(fv);

  // Higher residual / gaps / load → positive stress; controls present → negative stress
  const stressWeights: Record<string, number> = {
    avg_residual: 1.4,
    critical_path_count: 1.2,
    act_now_count: 0.8,
    spof_count: 1.1,
    open_sod_without_accept: 1.3,
    sod_gap_count: 0.6,
    sole_owner_knowledge: 0.7,
    claims_load: 0.9,
    daily_cash: 0.5,
    dual_control: -1.0, // missing dual control → positive z when value 0
    independent_bank_rec: -1.0,
    cameras: -0.4,
    bonded: -0.3,
    segregation_score: -0.9,
    coso_overall: -1.0,
  };

  let stress = 0;
  const findings: AnomalyFinding[] = [];

  for (const name of fv.names) {
    const zi = z[name];
    const w = stressWeights[name] ?? 0.2;
    // For negative-weight features, low values (missing controls) increase stress
    const contribution =
      w < 0 ? Math.max(0, -zi) * Math.abs(w) : Math.max(0, zi) * w;
    stress += contribution;

    if (Math.abs(zi) >= 1.0 || contribution >= 0.8) {
      const msgFn = FEATURE_MESSAGES[name];
      const message = msgFn
        ? msgFn(fv.labeled[name], zi)
        : `${name}=${fv.labeled[name]} (z=${zi.toFixed(2)})`;
      const severity: AnomalyFinding["severity"] =
        Math.abs(zi) >= 2 || contribution >= 1.5
          ? "alert"
          : Math.abs(zi) >= 1.2
            ? "watch"
            : "info";
      findings.push({
        feature: name,
        value: fv.labeled[name],
        z: Math.round(zi * 100) / 100,
        severity,
        message,
      });
    }
  }

  findings.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));

  // Map stress to 0–100
  const overallScore = Math.min(100, Math.round(stress * 12));
  const band: AnomalyReport["band"] =
    overallScore >= 75
      ? "critical"
      : overallScore >= 55
        ? "stressed"
        : overallScore >= 35
          ? "elevated"
          : "stable";

  return {
    overallScore,
    band,
    findings: findings.slice(0, 10),
    featureVector: fv,
    method: "diagonal-prior z-score stress (Mahalanobis-lite)",
  };
}
