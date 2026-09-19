/**
 * The two band scales every 0–100 index in this app reads against.
 *
 * An index is this app's weighting of the owner's answers. It is never a
 * measurement, and the cutoffs are presentation choices that order attention;
 * no study set them. They live in one place so the same number can never be
 * "weak" on one screen and "adequate" on another.
 */

/** Indices where higher is better: COSO, map health, segregation health. */
export const HEALTH_SCALE = { strong: 80, adequate: 60, weak: 40 } as const;

/** Indices where higher is worse: residual, knowledge risk, departure impact. */
export const RISK_SCALE = { critical: 80, actNow: 60, mitigate: 40 } as const;

export type HealthLevel = "strong" | "adequate" | "weak" | "critical";

export function healthLevel(score: number): HealthLevel {
  if (score >= HEALTH_SCALE.strong) return "strong";
  if (score >= HEALTH_SCALE.adequate) return "adequate";
  if (score >= HEALTH_SCALE.weak) return "weak";
  return "critical";
}

/** The one sentence every index surface shows beside its number. */
export const INDEX_BASIS =
  "Indices are this app's weighting of your answers, not measurements. The bands order attention; no study set them.";
