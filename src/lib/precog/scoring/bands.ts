/**
 * The three band scales every 0–100 figure in Precog reads against, and the
 * only place a band cutoff is written (scoring/bands-lint.test.ts checks).
 * One exception remains: the early-warning pressure bands in
 * ml/leading-indicators.ts, which step 4.3 replaces with a list.
 *
 * - HEALTH_SCALE, higher is better: COSO, map health, segregation health,
 *   the "Has a stand-in" and "Written down" shares.
 * - RISK_SCALE, higher is worse: residual risk (the "Fix first", "Fix soon",
 *   "Worth doing" and "Watch" action bands), knowledge risk, departure
 *   impact, a person's authority, and (stricter, `dependenceTone`) how much
 *   must-do work stops when someone is out.
 * - PRIORITY_SCALE, higher is worse: what the map and the priority list look
 *   at first. Process heat, a priority item and a person's workload band on
 *   it, in words of their own ("Top priority" and so on), so no priority
 *   band borrows a residual band's name.
 *
 * An index is Precog's weighting of the owner's answers. It is never a
 * measurement, and the cutoffs are presentation choices that order attention;
 * no study set them. They live in one place so the same number can never be
 * "weak" on one screen and "adequate" on another.
 */

/** Indices where higher is better: COSO, map health, segregation health, stand-in and written-down shares. */
export const HEALTH_SCALE = { strong: 80, adequate: 60, weak: 40 } as const;

/** Indices where higher is worse: residual, knowledge risk, departure impact, work that stops, authority. */
export const RISK_SCALE = { critical: 80, actNow: 60, mitigate: 40 } as const;

/**
 * Where the map and the priority list look first: process heat, priority
 * items and workload. Higher is worse.
 */
export const PRIORITY_SCALE = { top: 88, high: 70, medium: 45, low: 35 } as const;

/**
 * Display bands for a process's composite `heat` (process-graph's
 * enrichProcess): Precog's own 0–100 blend of a process's worst risk
 * (severity × likelihood), its open duty conflicts, sole-owner knowledge, and
 * any linked residual score, read on PRIORITY_SCALE. The cutoffs order
 * attention on the map; no study sets them and they carry no probability
 * meaning. The map badge, the health card, the review, and the weekly
 * actions all read them from here.
 */
export const HEAT_BANDS = { hot: PRIORITY_SCALE.high, warm: PRIORITY_SCALE.medium } as const;

/** A priority item's band, top first. The keys are internal; users read PRIORITY_BAND_LABEL. */
export type PriorityBand = "white_hot" | "critical" | "elevated" | "watch" | "cold";

export function priorityBand(score: number): PriorityBand {
  if (score >= PRIORITY_SCALE.top) return "white_hot";
  if (score >= PRIORITY_SCALE.high) return "critical";
  if (score >= PRIORITY_SCALE.medium) return "elevated";
  if (score >= PRIORITY_SCALE.low) return "watch";
  return "cold";
}

/** Priority bands in words that differ from the residual action bands ("Fix first" means only residual 80+). */
export const PRIORITY_BAND_LABEL: Record<PriorityBand, string> = {
  white_hot: "Top priority",
  critical: "High priority",
  elevated: "Medium priority",
  watch: "Low priority",
  cold: "Not urgent",
};

/** The colour of a higher-is-worse figure on RISK_SCALE: red from "Fix soon" up, amber from "Worth doing". */
export function riskTone(score: number): "danger" | "warn" | "ok" {
  if (score >= RISK_SCALE.actNow) return "danger";
  if (score >= RISK_SCALE.mitigate) return "warn";
  return "ok";
}

/**
 * The colour of the share of must-do work that stops when someone is out,
 * stricter than `riskTone` so a large share never looks calm: red from
 * RISK_SCALE "Worth doing" (40%), amber once the work that keeps running
 * falls below HEALTH_SCALE "strong" (more than 20% stops), green below that.
 */
export function dependenceTone(share: number): "danger" | "warn" | "ok" {
  if (share >= RISK_SCALE.mitigate) return "danger";
  if (100 - share < HEALTH_SCALE.strong) return "warn";
  return "ok";
}

export type HealthLevel = "strong" | "adequate" | "weak" | "critical";

export function healthLevel(score: number): HealthLevel {
  if (score >= HEALTH_SCALE.strong) return "strong";
  if (score >= HEALTH_SCALE.adequate) return "adequate";
  if (score >= HEALTH_SCALE.weak) return "weak";
  return "critical";
}

/** Open duty-conflict findings by severity, counted by sod/open-findings `openSeverityCounts`. */
export interface OpenSeverityCounts {
  openCritical: number;
  openHigh: number;
}

/**
 * The band word for segregation health. The number stays as computed, but one
 * open critical conflict costs only about 15 points, so on the number alone a
 * team with one would read "strong". While any critical finding is open the
 * word is at best "weak"; while any high one is open, at best "adequate".
 * Other indices band on `healthLevel` alone.
 */
export function segregationLevel(health: number, open: OpenSeverityCounts): HealthLevel {
  const level = healthLevel(health);
  const cap: HealthLevel | null =
    open.openCritical > 0 ? "weak" : open.openHigh > 0 ? "adequate" : null;
  return cap && LEVEL_RANK[level] > LEVEL_RANK[cap] ? cap : level;
}

const LEVEL_RANK: Record<HealthLevel, number> = { critical: 0, weak: 1, adequate: 2, strong: 3 };

/** The colour every health index is drawn in, by level: one scale for the badge, ring, bars and pill. */
type HealthTone = "ok" | "primary" | "warn" | "danger";

export function healthTone(score: number): HealthTone {
  return HEALTH_TONE[healthLevel(score)];
}

const HEALTH_TONE: Record<HealthLevel, HealthTone> = {
  strong: "ok",
  adequate: "primary",
  weak: "warn",
  critical: "danger",
};

/** The one sentence every index surface shows beside its number. */
export const INDEX_BASIS =
  "Indices are Precog's weighting of your answers, not measurements. The bands order attention; no study set them.";
