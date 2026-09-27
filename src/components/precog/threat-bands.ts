import { priorityBand, type PriorityBand } from "@/lib/precog/map-vision";

/**
 * The priority page's one band scale. The overall index reads against the
 * same priorityBand cutoffs as every item, so the header badge, its colour
 * and the items below can never disagree.
 */
export function overallBand(index: number): PriorityBand {
  return priorityBand(index);
}

export function isUrgent(band: PriorityBand): boolean {
  return band === "white_hot" || band === "critical";
}

export const BAND_VARIANT: Record<PriorityBand, "danger" | "warn" | "ok"> = {
  white_hot: "danger",
  critical: "danger",
  elevated: "warn",
  watch: "ok",
  cold: "ok",
};

export const DOMAIN_LABEL: Record<string, string> = {
  control: "Control",
  sod: "Duty conflict",
  knowledge: "Know-how",
  scenario: "Scenario",
  leading: "Early warning",
  portfolio: "Residual risk",
};

/** The early-warning bands (ml/leading-indicators) in words. */
export const LEADING_BAND_LABEL: Record<string, string> = {
  calm: "Calm",
  watch: "Worth watching",
  heat: "Rising",
  red: "High",
};
