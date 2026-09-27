/**
 * The Workload panel's engine: how much of the map, the duties and the
 * sole-owner knowledge rests on each active person, as a load index.
 */
import type { IndustryTemplate } from "../templates";
import { detectSodConflicts, sodDetectionOptions, type DetectedConflict } from "../sod/detect";
import type { DualReleasePolicy } from "../controls/dual-release";
import { findKnowledgeRisks } from "../engine";
import { enrichProcess } from "../process-graph";
import { HEAT_BANDS } from "../scoring/bands";
import type { Person, ProcessNode, StaffComposition } from "../types";
import { formatPct } from "../../utils";
import { isOperatingDuty } from "../sod/conflict-rules";

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
  const sod = detectSodConflicts(tpl, staff, sodDetectionOptions(tpl, dualRelease));
  const kRisks = findKnowledgeRisks(tpl);
  const heatById = new Map(processes.map((p) => [p.id, enrichProcess(tpl, p, staff).heat]));
  const total = Math.max(1, processes.length);

  return people
    .filter((p) => p.active)
    .map((person) => {
      const owned = processes.filter((p) => (p.ownerPersonIds ?? []).includes(person.id));
      const ownedHeat = owned.length
        ? Math.round(owned.reduce((s, p) => s + (heatById.get(p.id) ?? 0), 0) / owned.length)
        : 0;
      const assignment = sod.assignments.find((a) => a.personId === person.id);
      const entitlementCount = (assignment?.entitlements ?? []).filter(isOperatingDuty).length;
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
        flags.push(`owns ${formatPct(ownershipShare)} of processes`);
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
