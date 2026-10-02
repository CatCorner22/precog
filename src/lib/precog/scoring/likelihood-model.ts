/**
 * How the owner's controls and cash intensity move a scenario's likelihood,
 * gross severity and detection lag. Every multiplier is this app's
 * assumption (weights.likelihood), named in the driver the owner reads.
 */
import { clamp } from "../number";
import type { RiskVariableState } from "./risk-variables";
import { DEFAULT_WEIGHTS } from "./weights";

/** "−12%" for a multiplier of 0.88. */
function cut(multiplier: number): string {
  return `−${Math.round((1 - multiplier) * 100)}%`;
}

export interface LikelihoodSeverityBreakdown {
  /** Relative likelihood multiplier vs base scenario (1 = unchanged) */
  likelihoodMultiplier: number;
  /** Relative severity multiplier on gross loss before insurance (1 = unchanged) */
  grossSeverityMultiplier: number;
  /** Detection lag multiplier (<1 = faster detection) */
  detectionLagMultiplier: number;
  drivers: {
    id: string;
    label: string;
    effect: string;
    on: "likelihood" | "severity" | "detection";
  }[];
}

export function computeLikelihoodSeverity(
  v: RiskVariableState,
  opts?: { fraudRelated?: boolean; cashRelated?: boolean },
): LikelihoodSeverityBreakdown {
  const fraud = opts?.fraudRelated ?? true;
  const cash = opts?.cashRelated ?? fraud;
  const drivers: LikelihoodSeverityBreakdown["drivers"] = [];
  const w = DEFAULT_WEIGHTS.likelihood;

  let likelihood = 1;
  let grossSeverity = 1;
  let detectionLag = 1;

  if (v.hasSecurityCameras) {
    likelihood *= fraud ? w.camerasFraudLikelihood : w.camerasOtherLikelihood;
    detectionLag *= w.camerasDetectionLag;
    drivers.push({
      id: "cam-l",
      label: "Security cameras",
      effect: `Assumed ${cut(w.camerasFraudLikelihood)} opportunity likelihood; faster detection`,
      on: "likelihood",
    });
  }
  // The scenario page's loss and days read dual release on every scenario.
  // The residual index reads it on fraud scenarios only (scoring/scenario-level),
  // since it guards against someone moving money, not against a departure.
  if (v.hasDualControl) {
    likelihood *= fraud ? w.dualFraudLikelihood : w.dualOtherLikelihood;
    grossSeverity *= w.dualSeverity;
    drivers.push({
      id: "dual-l",
      label: "Dual release",
      effect: `Assumed ${cut(w.dualFraudLikelihood)} fraud likelihood; ${cut(w.dualSeverity)} scheme size`,
      on: "likelihood",
    });
  }
  if (v.hasIndependentBankRec) {
    likelihood *= w.bankRecLikelihood;
    detectionLag *= w.bankRecDetectionLag;
    grossSeverity *= w.bankRecSeverity;
    drivers.push({
      id: "rec-d",
      label: "Independent bank reconciliation",
      effect: `Assumed ${cut(w.bankRecDetectionLag)} detection lag; ${cut(w.bankRecSeverity)} cumulative severity`,
      on: "detection",
    });
  }
  if (v.hasAlarmAccess) {
    const alarm = cash ? w.alarmCashLikelihood : w.alarmOtherLikelihood;
    likelihood *= alarm;
    drivers.push({
      id: "alarm-l",
      label: "Alarm / access",
      effect: `Assumed ${cut(alarm)} external theft likelihood`,
      on: "likelihood",
    });
  }
  if (v.hasBondedCashHandlers) {
    likelihood *= w.bondedLikelihood;
    grossSeverity *= w.bondedSeverity;
    drivers.push({
      id: "bond-l",
      label: "Bonded handlers",
      effect: `Assumed ${cut(w.bondedLikelihood)} dishonesty likelihood`,
      on: "likelihood",
    });
  }

  // Cash intensity relative to an assumed daily reference (this app's choice, not a norm)
  if (cash && v.dailyCashExposure > 0) {
    const intensity = clamp(v.dailyCashExposure / w.cashReferenceUsd, 0.5, 3);
    if (intensity !== 1) {
      likelihood *= Math.sqrt(intensity);
      grossSeverity *= intensity;
      drivers.push({
        id: "cash-int",
        label: "Daily cash exposure",
        effect: `Assumed ×${intensity.toFixed(2)} severity against a $${w.cashReferenceUsd.toLocaleString("en-US")}/day reference; √ on likelihood`,
        on: "severity",
      });
    }
  }

  return {
    likelihoodMultiplier: clamp(likelihood, 0.25, 2.5),
    grossSeverityMultiplier: clamp(grossSeverity, 0.35, 3),
    detectionLagMultiplier: clamp(detectionLag, 0.4, 1.4),
    drivers,
  };
}
