import { defaultProfile, type PracticeProfile } from "./practice-profile";

/** What a business has entered on top of its industry template — everything an industry switch discards. */
export interface EnteredWork {
  people: number;
  processes: number;
  registerItems: number;
  registerEntries: number;
  absences: number;
  mapVersions: number;
  savedBlocks: number;
  /** Map nodes dragged into a chosen position. */
  pinnedPositions: number;
  /** An override that exists but is empty: the team, map or register was cleared on purpose. */
  emptiedTeam: boolean;
  emptiedProcesses: boolean;
  emptiedRegister: boolean;
  /** Team sliders, risk variables or dual-release rules moved off the industry defaults. */
  settings: boolean;
}

function stable(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
        )
      : v,
  );
}

export function enteredWork(p: PracticeProfile): EnteredWork {
  const defaults = defaultProfile(p.industry);
  return {
    people: p.customPeople?.length ?? 0,
    processes: p.customProcesses?.length ?? 0,
    registerItems: p.customKnowledge?.length ?? 0,
    registerEntries: p.customRelations?.length ?? 0,
    absences: p.plannedAbsences?.length ?? 0,
    mapVersions: p.mapVersions?.length ?? 0,
    savedBlocks: p.savedProcessBlocks?.length ?? 0,
    pinnedPositions: Object.keys(p.mapLayout ?? {}).length,
    emptiedTeam: p.customPeople !== null && p.customPeople !== undefined && !p.customPeople.length,
    emptiedProcesses:
      p.customProcesses !== null && p.customProcesses !== undefined && !p.customProcesses.length,
    emptiedRegister:
      (p.customKnowledge !== null && p.customKnowledge !== undefined) ||
      (p.customRelations !== null && p.customRelations !== undefined)
        ? !p.customKnowledge?.length && !p.customRelations?.length
        : false,
    settings:
      stable(p.staff) !== stable(defaults.staff) ||
      stable(p.riskVariables) !== stable(defaults.riskVariables) ||
      stable(p.dualRelease) !== stable(defaults.dualRelease),
  };
}

export function hasEnteredWork(work: EnteredWork): boolean {
  return Object.values(work).some((v) => v === true || (typeof v === "number" && v > 0));
}

function count(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/** Plain-language parts, most valuable first: "4 people", "12 register entries", … */
export function describeEnteredWork(work: EnteredWork): string[] {
  const parts: string[] = [];
  if (work.people) parts.push(count(work.people, "person", "people"));
  else if (work.emptiedTeam) parts.push("a cleared team");
  if (work.registerEntries)
    parts.push(count(work.registerEntries, "register entry", "register entries"));
  else if (work.registerItems) parts.push(count(work.registerItems, "register item"));
  else if (work.emptiedRegister) parts.push("a cleared register");
  if (work.absences) parts.push(count(work.absences, "absence"));
  if (work.processes) parts.push(count(work.processes, "process", "processes"));
  else if (work.emptiedProcesses) parts.push("a cleared process map");
  if (work.mapVersions) parts.push(count(work.mapVersions, "saved map version"));
  if (work.savedBlocks) parts.push(count(work.savedBlocks, "saved block"));
  if (work.pinnedPositions) parts.push(count(work.pinnedPositions, "pinned map position"));
  if (work.settings) parts.push("edited team and control settings");
  return parts;
}

export function listEnteredWork(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}
