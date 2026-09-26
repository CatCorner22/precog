import type { IndustryTemplate } from "../templates";
import {
  computeMapHealth,
  enrichProcess,
  validateProcessMap,
  type MapHealthReport,
  type MapValidationIssue,
} from "../process-graph";
import type { Person, ProcessNode, StaffComposition } from "../types";
import { untouchedStarterProcessIds, type MapProfile } from "./map-state";

/** Map health over the processes the owner has worked on. */
export interface ScoredMap {
  health: MapHealthReport;
  /** Validation issues on scored processes, plus the map-wide ones. */
  issues: MapValidationIssue[];
  /** Starter processes nobody has touched yet: on the map, not scored. */
  unscoredCount: number;
}

/**
 * Score a process list the way the map page does: a starter process the
 * owner has not touched yet (see untouchedStarterProcessIds) is left out of
 * every figure, so the dashboard card, the builder's pill and the map page
 * count the same processes. Validation still reads the whole list, so a link
 * to a starter process is never reported as broken.
 */
export function scoreMap(
  tpl: IndustryTemplate,
  processes: ProcessNode[],
  staff: StaffComposition,
  opts: {
    profile: Pick<MapProfile, "industry" | "customPeople">;
    people?: Person[];
    layout?: Record<string, { x: number; y: number }>;
    customized?: boolean;
  },
): ScoredMap {
  const unscored = untouchedStarterProcessIds({ ...opts.profile, customProcesses: processes });
  const snapshots = processes
    .filter((p) => !unscored.has(p.id))
    .map((p) => enrichProcess(tpl, p, staff));
  const issues = validateProcessMap(
    processes,
    opts.people ?? tpl.people,
    new Set(tpl.controls.map((c) => c.id)),
    opts.layout ?? {},
  ).filter((i) => !i.processId || !unscored.has(i.processId));
  return {
    health: computeMapHealth(snapshots, issues, { customized: opts.customized }),
    issues,
    unscoredCount: unscored.size,
  };
}
