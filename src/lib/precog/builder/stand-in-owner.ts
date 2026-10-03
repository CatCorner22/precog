/**
 * Owner changes offered outside the map builder: a stand-in owner for a
 * process someone would leave with no owner ("If someone is out" on Who knows
 * what), and moving one process off an overloaded person (Workload on Team).
 * Pure: each returns the next process list, or null when nobody fits.
 */
import type { IndustryTemplate } from "../templates";
import type { Person, ProcessNode } from "../types";
import { suggestOwnerForProcess } from "./quick-fix";

export interface OwnerChange {
  next: ProcessNode[];
  process: ProcessNode;
  /** The person added (or moved in) as an owner. */
  person: Person;
}

/** Add a second owner so the process survives this person's absence. */
export function addStandInOwner(
  tpl: IndustryTemplate,
  processes: ProcessNode[],
  processId: string,
  absentPersonId: string,
): OwnerChange | null {
  const proc = processes.find((p) => p.id === processId);
  if (!proc) return null;
  const owners = proc.ownerPersonIds ?? [];
  const candidates = tpl.people.filter(
    (p) => p.id !== absentPersonId && p.active && !owners.includes(p.id),
  );
  const standIn = suggestOwnerForProcess(
    tpl,
    { ...proc, ownerPersonIds: [] },
    processes,
    candidates,
  );
  if (!standIn) return null;
  return {
    next: withOwners(processes, processId, [...owners, standIn.id]),
    process: proc,
    person: standIn,
  };
}

/** Move one process from this person to the best-suited other active person. */
export function reassignOwner(
  tpl: IndustryTemplate,
  processes: ProcessNode[],
  fromPersonId: string,
  processId: string,
): OwnerChange | null {
  const proc = processes.find((p) => p.id === processId);
  if (!proc) return null;
  const others = tpl.people.filter((p) => p.id !== fromPersonId && p.active);
  const candidate = suggestOwnerForProcess(tpl, { ...proc, ownerPersonIds: [] }, processes, others);
  if (!candidate) return null;
  const kept = (proc.ownerPersonIds ?? []).filter((o) => o !== fromPersonId);
  return {
    next: withOwners(
      processes,
      processId,
      kept.includes(candidate.id) ? kept : [...kept, candidate.id],
    ),
    process: proc,
    person: candidate,
  };
}

/**
 * Undo one owner change: the process gets back the owners it had before.
 * Only that process changes, so edits made to other processes since stay.
 */
export function undoOwnerChange(processes: ProcessNode[], change: OwnerChange): ProcessNode[] {
  const before = change.process.ownerPersonIds;
  return processes.map((p) => {
    if (p.id !== change.process.id) return p;
    const { ownerPersonIds: _changed, ...rest } = p;
    return before === undefined ? rest : { ...rest, ownerPersonIds: before };
  });
}

function withOwners(processes: ProcessNode[], processId: string, owners: string[]): ProcessNode[] {
  return processes.map((p) => (p.id === processId ? { ...p, ownerPersonIds: owners } : p));
}
