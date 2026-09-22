import type { Person, ProcessNode } from "../types";

export interface MapDiff {
  added: ProcessNode[];
  removed: ProcessNode[];
  modified: { p: ProcessNode; changes: string[] }[];
  peopleAdded: Person[];
  peopleRemoved: Person[];
  total: number;
}

/** Structural diff of two maps: `current` vs `base`. */
export function diffMaps(
  base: { processes: ProcessNode[]; people: Person[] },
  current: { processes: ProcessNode[]; people: Person[] },
): MapDiff {
  const baseById = new Map(base.processes.map((p) => [p.id, p]));
  const curById = new Map(current.processes.map((p) => [p.id, p]));

  const added = current.processes.filter((p) => !baseById.has(p.id));
  const removed = base.processes.filter((p) => !curById.has(p.id));
  const modified = current.processes
    .filter((p) => baseById.has(p.id))
    .map((p) => ({ p, changes: processChanges(baseById.get(p.id)!, p) }))
    .filter((x) => x.changes.length);

  const basePeople = new Set(base.people.map((p) => p.id));
  const curPeople = new Set(current.people.map((p) => p.id));
  const peopleAdded = current.people.filter((p) => !basePeople.has(p.id));
  const peopleRemoved = base.people.filter((p) => !curPeople.has(p.id));

  return {
    added,
    removed,
    modified,
    peopleAdded,
    peopleRemoved,
    total:
      added.length + removed.length + modified.length + peopleAdded.length + peopleRemoved.length,
  };
}

/** Human-readable list of what differs between two versions of one process. */
export function processChanges(before: ProcessNode, after: ProcessNode): string[] {
  const changes: string[] = [];
  if (after.name !== before.name) changes.push("renamed");
  if (after.description !== before.description) changes.push("description");
  if ((after.stage ?? 0) !== (before.stage ?? 0)) changes.push("stage");
  if (after.dependencies.join("|") !== before.dependencies.join("|")) changes.push("dependencies");
  if ((after.ownerPersonIds ?? []).join("|") !== (before.ownerPersonIds ?? []).join("|"))
    changes.push("owners");
  if (after.controlIds.join("|") !== before.controlIds.join("|")) changes.push("controls");
  if ((after.cadence ?? "") !== (before.cadence ?? "")) changes.push("cadence");
  if ((after.systems ?? []).join("|") !== (before.systems ?? []).join("|")) changes.push("systems");
  if (
    Boolean(after.documented) !== Boolean(before.documented) ||
    (after.procedureLocation ?? "") !== (before.procedureLocation ?? "")
  )
    changes.push("procedure");
  if ((after.inputs ?? []).join("|") !== (before.inputs ?? []).join("|")) changes.push("inputs");
  if ((after.outputs ?? []).join("|") !== (before.outputs ?? []).join("|")) changes.push("outputs");
  const d = (a?: unknown[], c?: unknown[]) => (a?.length ?? 0) - (c?.length ?? 0);
  const dr = d(after.risks, before.risks);
  const di = d(after.ideas, before.ideas);
  const dw = d(after.wastes, before.wastes);
  if (dr) changes.push(`${dr > 0 ? "+" : ""}${dr} risk${Math.abs(dr) === 1 ? "" : "s"}`);
  if (di) changes.push(`${di > 0 ? "+" : ""}${di} idea${Math.abs(di) === 1 ? "" : "s"}`);
  if (dw) changes.push(`${dw > 0 ? "+" : ""}${dw} waste`);
  return changes;
}
