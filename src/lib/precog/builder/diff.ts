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
    .map((p) => {
      const b = baseById.get(p.id)!;
      const changes: string[] = [];
      if (p.name !== b.name) changes.push("renamed");
      if (p.description !== b.description) changes.push("description");
      if ((p.stage ?? 0) !== (b.stage ?? 0)) changes.push("stage");
      if (p.dependencies.join("|") !== b.dependencies.join("|")) changes.push("dependencies");
      if ((p.ownerPersonIds ?? []).join("|") !== (b.ownerPersonIds ?? []).join("|"))
        changes.push("owners");
      if (p.controlIds.join("|") !== b.controlIds.join("|")) changes.push("controls");
      const d = (a?: unknown[], c?: unknown[]) => (a?.length ?? 0) - (c?.length ?? 0);
      const dr = d(p.risks, b.risks);
      const di = d(p.ideas, b.ideas);
      const dw = d(p.wastes, b.wastes);
      if (dr) changes.push(`${dr > 0 ? "+" : ""}${dr} risk${Math.abs(dr) === 1 ? "" : "s"}`);
      if (di) changes.push(`${di > 0 ? "+" : ""}${di} idea${Math.abs(di) === 1 ? "" : "s"}`);
      if (dw) changes.push(`${dw > 0 ? "+" : ""}${dw} waste`);
      return { p, changes };
    })
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
