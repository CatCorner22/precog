/**
 * What-if scoring: preview map health for a hypothetical process list against
 * the template's controls/people, so alternates can be scored side by side.
 */
import type { IndustryTemplate } from "../templates";
import { enrichProcess } from "../process-graph";
import { computeMapHealth, type MapHealthReport } from "../process-health";
import { validateProcessMap } from "../process-validation";
import type { Person, ProcessNode, StaffComposition } from "../types";

export interface HealthDelta {
  before: number;
  after: number;
  delta: number;
  /** Dimension with the largest movement, for a one-line explanation; absent when none moved. */
  driver?: { label: string; delta: number };
}

export function previewMapHealth(
  tpl: IndustryTemplate,
  processes: ProcessNode[],
  staff: StaffComposition,
  opts: {
    people?: Person[];
    layout?: Record<string, { x: number; y: number }>;
    customized?: boolean;
  } = {},
): MapHealthReport {
  const people = opts.people ?? tpl.people;
  const snapshots = processes.map((p) => enrichProcess(tpl, p, staff));
  const issues = validateProcessMap(
    processes,
    people,
    new Set(tpl.controls.map((c) => c.id)),
    opts.layout ?? {},
  );
  return computeMapHealth(snapshots, issues, { customized: opts.customized });
}

export function healthDelta(before: MapHealthReport, after: MapHealthReport): HealthDelta {
  let driver: HealthDelta["driver"];
  for (const d of after.dimensions) {
    const b = before.dimensions.find((x) => x.id === d.id);
    if (!b) continue;
    const dd = d.score - b.score;
    // A dimension that did not move explains nothing.
    if (dd !== 0 && (!driver || Math.abs(dd) > Math.abs(driver.delta)))
      driver = { label: d.label, delta: dd };
  }
  return { before: before.score, after: after.score, delta: after.score - before.score, driver };
}
