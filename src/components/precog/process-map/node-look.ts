import {
  predatorThermalColor,
  terminatorThreatColor,
  type MapVisionMode,
} from "@/lib/precog/map-vision";
import { heatColorStandard } from "@/components/precog/process-map/style";

/**
 * Border colour for a node. The two risk visions colour by priority, the same
 * number the card's THERMAL / THREAT label, its band and the priority stack
 * show, so a card never glows hotter than its label says.
 */
export function nodeAccent(vision: MapVisionMode, heat: number, priority: number): string {
  if (vision === "predator") return predatorThermalColor(priority);
  if (vision === "terminator") return terminatorThreatColor(priority);
  return heatColorStandard(heat);
}

/** Whether a card pulses as a locked target: only an `immediate` target, the set the Terminator legend counts. */
export function targetLocked(
  vision: MapVisionMode,
  node: { unscored?: boolean; immediate?: boolean },
): boolean {
  return vision === "terminator" && !node.unscored && Boolean(node.immediate);
}
