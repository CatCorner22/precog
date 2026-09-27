import { clamp } from "@/lib/precog/number";

/** A process card in reading order: its stage lane, then its height in the lane. */
export interface OrderedProcess {
  id: string;
  stage: number;
  y: number;
}

export type ArrowKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown";

/**
 * Where an arrow key moves the selection in build mode: left and right to
 * the nearest process in the neighbouring stage lane (matching height where
 * possible), up and down within the lane. With nothing selected, the first
 * process. At an edge the selection stays put. `order` is sorted by stage,
 * then height.
 */
export function processAfterArrow(
  order: readonly OrderedProcess[],
  currentId: string | null,
  key: ArrowKey,
): OrderedProcess | undefined {
  if (!order.length) return undefined;
  const here = order.find((p) => p.id === currentId);
  if (!here) return order[0];
  if (key === "ArrowRight" || key === "ArrowLeft") {
    const lanes = [...new Set(order.map((p) => p.stage))];
    const lane = lanes.indexOf(here.stage) + (key === "ArrowRight" ? 1 : -1);
    if (lane < 0 || lane >= lanes.length) return here;
    return order
      .filter((p) => p.stage === lanes[lane])
      .reduce((best, p) => (Math.abs(p.y - here.y) < Math.abs(best.y - here.y) ? p : best));
  }
  const lane = order.filter((p) => p.stage === here.stage);
  const i = lane.findIndex((p) => p.id === here.id) + (key === "ArrowDown" ? 1 : -1);
  return lane[clamp(i, 0, lane.length - 1)];
}
