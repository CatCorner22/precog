/**
 * What-if scoring: preview map health for a hypothetical process list against
 * the template's controls/people, so alternates can be scored side by side.
 */
import type { IndustryTemplate } from "../templates";
import { detectSodConflicts, type DetectedConflict } from "../sod/detect";
import { mitigatedSodRuleIds, type DualReleasePolicy } from "../controls/dual-release";
import { findKnowledgeRisks } from "../engine";
import {
  computeMapHealth,
  enrichProcess,
  HEAT_BANDS,
  validateProcessMap,
  type MapHealthReport,
} from "../process-graph";
import type { Person, ProcessNode, StaffComposition } from "../types";

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

export interface HealthDelta {
  before: number;
  after: number;
  delta: number;
  /** Dimension with the largest movement, for a one-line explanation. */
  driver?: { label: string; delta: number };
}

export function healthDelta(before: MapHealthReport, after: MapHealthReport): HealthDelta {
  let driver: HealthDelta["driver"];
  for (const d of after.dimensions) {
    const b = before.dimensions.find((x) => x.id === d.id);
    if (!b) continue;
    const dd = d.score - b.score;
    if (!driver || Math.abs(dd) > Math.abs(driver.delta)) driver = { label: d.label, delta: dd };
  }
  return { before: before.score, after: after.score, delta: after.score - before.score, driver };
}

export interface PersonWorkload {
  person: Person;
  ownedProcesses: ProcessNode[];
  ownedHeat: number;
  entitlementCount: number;
  conflicts: DetectedConflict[];
  criticalConflicts: number;
  knowledgeExpert: number;
  soleOwnerKnowledge: number;
  /**
   * 0–100 load index computed by analyzeWorkload from this app's own weights.
   * Read it against LOAD_BANDS; it is an ordering device, not a measurement.
   */
  load: number;
  flags: string[];
}

/**
 * Bands for the composite load index that analyzeWorkload computes (ownership
 * share, entitlement count, critical duty conflicts, sole-owner knowledge, and
 * a hot-process bonus, weighted by this app). They order attention; no study
 * sets them. "Overburdened" in the UI means the index is at or above the top
 * band, nothing more.
 */
export const LOAD_BANDS = { overburdened: 70, elevated: 45 } as const;

export function analyzeWorkload(
  tpl: IndustryTemplate,
  processes: ProcessNode[],
  people: Person[],
  staff: StaffComposition,
  dualRelease: DualReleasePolicy,
): PersonWorkload[] {
  const sod = detectSodConflicts(tpl, staff, {
    dualReleaseMitigatedRuleIds: mitigatedSodRuleIds(dualRelease),
  });
  const kRisks = findKnowledgeRisks(tpl);
  const snapshots = processes.map((p) => enrichProcess(tpl, p, staff));
  const total = Math.max(1, processes.length);

  return people
    .filter((p) => p.active)
    .map((person) => {
      const owned = processes.filter((p) => (p.ownerPersonIds ?? []).includes(person.id));
      const ownedHeat = owned.length
        ? Math.round(
            owned.reduce(
              (s, p) => s + (snapshots.find((x) => x.process.id === p.id)?.heat ?? 0),
              0,
            ) / owned.length,
          )
        : 0;
      const assignment = sod.assignments.find((a) => a.personId === person.id);
      const entitlementCount = (assignment?.entitlements ?? []).filter(
        (e) => e !== "view_reports_only",
      ).length;
      const conflicts = sod.conflicts.filter((c) => c.personId === person.id);
      const criticalConflicts = conflicts.filter((c) => c.severity === "critical").length;
      const expertRels = tpl.relations.filter(
        (r) => r.personId === person.id && r.level === "expert",
      );
      const soleOwnerKnowledge = kRisks.filter(
        (k) => k.soleOwner && k.owners.some((o) => o.id === person.id),
      ).length;

      const ownershipShare = owned.length / total;
      const load = Math.min(
        100,
        Math.round(
          ownershipShare * 55 +
            Math.min(6, entitlementCount) * 4 +
            criticalConflicts * 10 +
            soleOwnerKnowledge * 8 +
            (ownedHeat >= HEAT_BANDS.hot ? 8 : 0),
        ),
      );

      const flags: string[] = [];
      if (ownershipShare >= 0.4 && total >= 4)
        flags.push(`owns ${Math.round(ownershipShare * 100)}% of processes`);
      if (criticalConflicts) flags.push(`${criticalConflicts} critical SoD conflict(s)`);
      if (soleOwnerKnowledge) flags.push(`sole owner of ${soleOwnerKnowledge} knowledge item(s)`);
      if (ownedHeat >= HEAT_BANDS.hot) flags.push("owns hot processes");
      if (!owned.length && entitlementCount === 0) flags.push("no processes or duties assigned");

      return {
        person,
        ownedProcesses: owned,
        ownedHeat,
        entitlementCount,
        conflicts,
        criticalConflicts,
        knowledgeExpert: expertRels.length,
        soleOwnerKnowledge,
        load,
        flags,
      };
    })
    .sort((a, b) => b.load - a.load);
}
