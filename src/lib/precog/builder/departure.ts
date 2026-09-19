/**
 * Key-person departure simulation — what breaks if someone leaves tomorrow.
 * Pure client-side; nothing is mutated.
 */
import { getActiveTemplate } from "../active-template";
import { previewMapHealth } from "./what-if";
import type { Person, ProcessNode, StaffComposition } from "../types";

export interface DepartureImpact {
  person: Person;
  healthBefore: number;
  healthAfter: number;
  healthDelta: number;
  /** Processes that would have no owner left. */
  orphanedProcesses: ProcessNode[];
  /** Processes they own that still have another owner. */
  coveredProcesses: ProcessNode[];
  /** Knowledge items where no strong holder remains. */
  orphanedKnowledge: { id: string; name: string; criticality: string }[];
  /** Knowledge items they hold strongly that others also hold. */
  sharedKnowledge: { id: string; name: string }[];
  /** 0–100 — how much this departure would hurt. */
  impact: number;
  recommendations: string[];
}

const STRONG = new Set(["expert", "proficient"]);

export function simulateDeparture(
  person: Person,
  processes: ProcessNode[],
  people: Person[],
  staff: StaffComposition,
): DepartureImpact {
  const tpl = getActiveTemplate();
  const remainingPeople = people.filter((p) => p.id !== person.id);
  const nextProcesses = processes.map((p) => ({
    ...p,
    ownerPersonIds: (p.ownerPersonIds ?? []).filter((id) => id !== person.id),
  }));

  const before = previewMapHealth(processes, staff, { people });
  const after = previewMapHealth(nextProcesses, staff, { people: remainingPeople });

  const owned = processes.filter((p) => (p.ownerPersonIds ?? []).includes(person.id));
  const orphanedProcesses = owned.filter(
    (p) => (p.ownerPersonIds ?? []).filter((id) => id !== person.id).length === 0,
  );
  const coveredProcesses = owned.filter((p) => !orphanedProcesses.includes(p));

  const held = tpl.relations.filter((r) => r.personId === person.id && STRONG.has(r.level));
  const orphanedKnowledge: DepartureImpact["orphanedKnowledge"] = [];
  const sharedKnowledge: DepartureImpact["sharedKnowledge"] = [];
  for (const rel of held) {
    const k = tpl.knowledge.find((x) => x.id === rel.knowledgeId);
    if (!k) continue;
    const others = tpl.relations.filter(
      (r) =>
        r.knowledgeId === k.id &&
        r.personId !== person.id &&
        STRONG.has(r.level) &&
        remainingPeople.some((p) => p.id === r.personId && p.active),
    );
    if (others.length === 0)
      orphanedKnowledge.push({ id: k.id, name: k.name, criticality: k.criticality });
    else sharedKnowledge.push({ id: k.id, name: k.name });
  }

  const criticalKnowledge = orphanedKnowledge.filter((k) => k.criticality === "critical").length;
  const impact = Math.min(
    100,
    Math.round(
      Math.max(0, before.score - after.score) * 2.2 +
        orphanedProcesses.length * 12 +
        criticalKnowledge * 15 +
        (orphanedKnowledge.length - criticalKnowledge) * 7 +
        Math.min(10, person.tenureYears ?? 0),
    ),
  );

  const recommendations: string[] = [];
  if (orphanedProcesses.length)
    recommendations.push(
      `Name a backup owner on ${orphanedProcesses
        .slice(0, 3)
        .map((p) => `"${p.name}"`)
        .join(
          ", ",
        )}${orphanedProcesses.length > 3 ? ` and ${orphanedProcesses.length - 3} more` : ""}.`,
    );
  if (orphanedKnowledge.length)
    recommendations.push(
      `Cross-train someone on ${orphanedKnowledge
        .slice(0, 2)
        .map((k) => k.name)
        .join(" and ")} — write the runbook while ${person.name.split(" ")[0]} is still here.`,
    );
  if ((person.tenureYears ?? 0) >= 5 && (orphanedProcesses.length || orphanedKnowledge.length))
    recommendations.push(
      "Years in the role usually mean know-how nobody wrote down — walk through the processes and knowledge above with a successor and record what they say.",
    );
  if (!recommendations.length)
    recommendations.push("Coverage looks good; keep backups current as processes change.");

  return {
    person,
    healthBefore: before.score,
    healthAfter: after.score,
    healthDelta: after.score - before.score,
    orphanedProcesses,
    coveredProcesses,
    orphanedKnowledge,
    sharedKnowledge,
    impact,
    recommendations,
  };
}

/** Rank the whole team by departure impact — a bus-factor view. */
export function rankDepartureRisk(
  processes: ProcessNode[],
  people: Person[],
  staff: StaffComposition,
): DepartureImpact[] {
  return people
    .filter((p) => p.active)
    .map((p) => simulateDeparture(p, processes, people, staff))
    .sort((a, b) => b.impact - a.impact);
}

/** Number of people whose loss would orphan at least one process or critical knowledge item. */
export function busFactor(impacts: DepartureImpact[]): number {
  return impacts.filter(
    (i) =>
      i.orphanedProcesses.length > 0 ||
      i.orphanedKnowledge.some((k) => k.criticality === "critical"),
  ).length;
}
