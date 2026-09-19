/**
 * Risk appetite — one setting that retunes what counts as "hot", what health you're
 * aiming for, and how aggressive the weekly recommendations are. Module-level like
 * the active template so scoring engines read it without prop drilling.
 */
export type RiskAppetite = "conservative" | "balanced" | "tolerant";

export interface AppetiteThresholds {
  id: RiskAppetite;
  label: string;
  tagline: string;
  /** Process heat at or above which a process is "hot". */
  hotHeat: number;
  /** Process heat at or above which a process is "warm". */
  warmHeat: number;
  /** Map health the owner is aiming for. */
  targetHealth: number;
  /** Residual risk score below which "accept residual" is a reasonable default. */
  acceptResidualBelow: number;
  /** Max weekly actions to surface. */
  weeklyActions: number;
  /** Evidence "due soon" window as a share of the cadence. */
  dueSoonShare: number;
}

export const APPETITES: Record<RiskAppetite, AppetiteThresholds> = {
  conservative: {
    id: "conservative",
    label: "Conservative",
    tagline: "Regulated, lender-scrutinised, or just been burned. Flag early, fix fast.",
    hotHeat: 58,
    warmHeat: 38,
    targetHealth: 85,
    acceptResidualBelow: 30,
    weeklyActions: 6,
    dueSoonShare: 0.3,
  },
  balanced: {
    id: "balanced",
    label: "Balanced",
    tagline: "Sensible defaults for most owner-operated teams.",
    hotHeat: 68,
    warmHeat: 45,
    targetHealth: 75,
    acceptResidualBelow: 45,
    weeklyActions: 5,
    dueSoonShare: 0.2,
  },
  tolerant: {
    id: "tolerant",
    label: "Tolerant",
    tagline: "Lean team, thin margins — only the material stuff should light up.",
    hotHeat: 76,
    warmHeat: 55,
    targetHealth: 65,
    acceptResidualBelow: 55,
    weeklyActions: 4,
    dueSoonShare: 0.15,
  },
};

let current: AppetiteThresholds = APPETITES.balanced;

export function setRiskAppetite(id: RiskAppetite | undefined) {
  current = APPETITES[id ?? "balanced"] ?? APPETITES.balanced;
}

export function getAppetite(): AppetiteThresholds {
  return current;
}

export function heatBand(heat: number): "hot" | "warm" | "cool" {
  const a = getAppetite();
  return heat >= a.hotHeat ? "hot" : heat >= a.warmHeat ? "warm" : "cool";
}
