import type { PriorityBand } from "@/lib/precog/map-vision";

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
  portfolio: "Residual risk",
};
