import type { PracticeProfile } from "./practice-profile";

/** What a business has entered on top of its industry template — everything an industry switch discards. */
export interface EnteredWork {
  people: number;
  processes: number;
  registerItems: number;
  registerEntries: number;
  absences: number;
  mapVersions: number;
  savedBlocks: number;
}

export function enteredWork(p: PracticeProfile): EnteredWork {
  return {
    people: p.customPeople?.length ?? 0,
    processes: p.customProcesses?.length ?? 0,
    registerItems: p.customKnowledge?.length ?? 0,
    registerEntries: p.customRelations?.length ?? 0,
    absences: p.plannedAbsences?.length ?? 0,
    mapVersions: p.mapVersions?.length ?? 0,
    savedBlocks: p.savedProcessBlocks?.length ?? 0,
  };
}

export function hasEnteredWork(work: EnteredWork): boolean {
  return Object.values(work).some((n) => n > 0);
}

function count(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/** Plain-language parts, most valuable first: "4 people", "12 register entries", … */
export function describeEnteredWork(work: EnteredWork): string[] {
  const parts: string[] = [];
  if (work.people) parts.push(count(work.people, "person", "people"));
  if (work.registerEntries) parts.push(count(work.registerEntries, "register entry", "register entries"));
  else if (work.registerItems) parts.push(count(work.registerItems, "register item"));
  if (work.absences) parts.push(count(work.absences, "absence"));
  if (work.processes) parts.push(count(work.processes, "process", "processes"));
  if (work.mapVersions) parts.push(count(work.mapVersions, "saved map version"));
  if (work.savedBlocks) parts.push(count(work.savedBlocks, "saved block"));
  return parts;
}

export function listEnteredWork(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}
