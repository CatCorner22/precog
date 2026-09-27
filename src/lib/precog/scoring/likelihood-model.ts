/**
 * How the owner's controls and cash intensity move a scenario's likelihood,
 * gross severity and detection lag. Every multiplier is this app's
 * assumption, named in the driver the owner reads.
 */
import { clamp } from "../number";
import type { RiskVariableState } from "./risk-variables";

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

  let likelihood = 1;
  let grossSeverity = 1;
  let detectionLag = 1;

  if (v.hasSecurityCameras) {
    likelihood *= fraud ? 0.88 : 0.95;
    detectionLag *= 0.92;
    drivers.push({
      id: "cam-l",
      label: "Security cameras",
      effect: "Assumed −12% opportunity likelihood; faster detection",
      on: "likelihood",
    });
  }
  if (v.hasDualControl) {
    likelihood *= fraud ? 0.72 : 0.9;
    grossSeverity *= 0.85;
    drivers.push({
      id: "dual-l",
      label: "Dual control",
      effect: "Assumed −28% fraud likelihood; −15% scheme size",
      on: "likelihood",
    });
  }
  if (v.hasIndependentBankRec) {
    likelihood *= 0.9;
    detectionLag *= 0.75;
    grossSeverity *= 0.88;
    drivers.push({
      id: "rec-d",
      label: "Independent bank rec",
      effect: "Assumed −25% detection lag; −12% cumulative severity",
      on: "detection",
    });
  }
  if (v.hasAlarmAccess) {
    likelihood *= cash ? 0.94 : 0.97;
    drivers.push({
      id: "alarm-l",
      label: "Alarm / access",
      effect: `Assumed −${cash ? 6 : 3}% external theft likelihood`,
      on: "likelihood",
    });
  }
  if (v.hasBondedCashHandlers) {
    likelihood *= 0.93;
    grossSeverity *= 0.97;
    drivers.push({
      id: "bond-l",
      label: "Bonded handlers",
      effect: "Assumed −7% dishonesty likelihood",
      on: "likelihood",
    });
  }

  // Cash intensity relative to an assumed $2,500/day reference (this app's choice, not a norm)
  if (cash && v.dailyCashExposure > 0) {
    const intensity = clamp(v.dailyCashExposure / 2500, 0.5, 3);
    if (intensity !== 1) {
      likelihood *= Math.sqrt(intensity);
      grossSeverity *= intensity;
      drivers.push({
        id: "cash-int",
        label: "Daily cash exposure",
        effect: `Assumed ×${intensity.toFixed(2)} severity against a $2,500/day reference; √ on likelihood`,
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
