import type { SavedProcessBlock } from "./builder/process-blocks";
import type { MapHealthPoint, MapVersion } from "./practice-profile";
import type { KnowledgeItem, KnowledgeRelation, Person, ProcessNode } from "./types";

/**
 * The lists a stored business carries, checked entry by entry. A stored copy
 * is untrusted input (an older build, a hand-edited backup, another device):
 * an entry without the string fields every engine reads is dropped rather
 * than left to throw inside the template resolver, and each list is capped.
 * `normalizeProfile` keeps what these return; the server refuses a save whose
 * lists would lose an entry here (`malformedList`).
 */

/** Most entries each list keeps (scripts/bench-register.mjs times the engines at these sizes). */
export const LIST_LIMITS = {
  people: 1_000,
  processes: 500,
  knowledge: 2_000,
  relations: 20_000,
  layoutPositions: 2_000,
  mapVersions: 50,
  savedBlocks: 200,
  healthPoints: 1_000,
} as const;

export type MapLayout = Record<string, { x: number; y: number }>;

/** The team: every person has an id, a name and a job title. Null when the value is not a list. */
export function peopleEntries(value: unknown): Person[] | null {
  return entries<Person>(value, ["id", "name", "role"], LIST_LIMITS.people);
}

/** Processes with an id and a name; their id lists are always lists of strings. */
export function processEntries(value: unknown): ProcessNode[] | null {
  return (
    entries<ProcessNode>(value, ["id", "name"], LIST_LIMITS.processes)?.map((process) => {
      const owners = process.ownerPersonIds;
      return {
        ...process,
        dependencies: strings(process.dependencies),
        controlIds: strings(process.controlIds),
        ...(owners === undefined ? {} : { ownerPersonIds: strings(owners) }),
      };
    }) ?? null
  );
}

/** Register items with an id and a name, and a list of linked process ids. */
export function knowledgeEntries(value: unknown): KnowledgeItem[] | null {
  return (
    entries<KnowledgeItem>(value, ["id", "name"], LIST_LIMITS.knowledge)?.map((item) => ({
      ...item,
      linkedProcessIds: strings(item.linkedProcessIds),
    })) ?? null
  );
}

/** Who holds which register item, and how well. */
export function relationEntries(value: unknown): KnowledgeRelation[] | null {
  return entries<KnowledgeRelation>(
    value,
    ["personId", "knowledgeId", "level"],
    LIST_LIMITS.relations,
  );
}

/** Pinned canvas positions: finite x and y, keyed by process id. */
export function mapLayoutEntries(value: unknown): MapLayout {
  if (!isRecord(value)) return {};
  const out: MapLayout = {};
  for (const [id, point] of Object.entries(value).slice(0, LIST_LIMITS.layoutPositions)) {
    if (!isRecord(point)) continue;
    const { x, y } = point;
    if (
      typeof x === "number" &&
      Number.isFinite(x) &&
      typeof y === "number" &&
      Number.isFinite(y)
    ) {
      out[id.slice(0, 120)] = { x, y };
    }
  }
  return out;
}

/** Saved map versions whose team and processes pass the same checks as the business's own. */
export function mapVersionEntries(value: unknown): MapVersion[] {
  return (entries<MapVersion>(value, ["id", "name", "createdAt"], LIST_LIMITS.mapVersions) ?? [])
    .filter((version) => Array.isArray(version.people) && Array.isArray(version.processes))
    .map((version) => ({
      ...version,
      healthScore: finite(version.healthScore) ? version.healthScore : 0,
      people: peopleEntries(version.people) ?? [],
      processes: processEntries(version.processes) ?? [],
      layout: mapLayoutEntries(version.layout),
    }));
}

/** Reusable process blocks: an id, a name and a process template. */
export function savedBlockEntries(value: unknown): SavedProcessBlock[] {
  return (entries<SavedProcessBlock>(value, ["id", "name"], LIST_LIMITS.savedBlocks) ?? []).filter(
    (block) => isRecord(block.template),
  );
}

/** Map-health points: a time and a finite score. */
export function healthPointEntries(value: unknown): MapHealthPoint[] {
  return (entries<MapHealthPoint>(value, ["at"], LIST_LIMITS.healthPoints) ?? []).filter((point) =>
    finite(point.score),
  );
}

/**
 * The first list field of a stored business that would lose an entry to the
 * checks above (or is not a list at all), or null when every list is well
 * formed. The server refuses such a save rather than storing it.
 */
export function malformedList(profile: Record<string, unknown>): string | null {
  const lists: [string, (value: unknown) => unknown[] | null][] = [
    ["customPeople", peopleEntries],
    ["customProcesses", processEntries],
    ["customKnowledge", knowledgeEntries],
    ["customRelations", relationEntries],
    ["mapVersions", mapVersionEntries],
    ["savedProcessBlocks", savedBlockEntries],
    ["mapHealthHistory", healthPointEntries],
  ];
  for (const [field, check] of lists) {
    const value = profile[field];
    if (value === null || value === undefined) continue;
    if (!Array.isArray(value) || check(value)?.length !== value.length) return field;
  }
  const layout = profile.mapLayout;
  if (layout !== null && layout !== undefined) {
    if (!isRecord(layout)) return "mapLayout";
    if (Object.keys(mapLayoutEntries(layout)).length !== Object.keys(layout).length) {
      return "mapLayout";
    }
  }
  return null;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Entries of a stored list that carry the string fields every engine relies
 * on; anything else is dropped. Null when the value is not a list, which
 * means "the template's", as it does for a business.
 */
function entries<T>(value: unknown, required: readonly string[], max: number): T[] | null {
  if (!Array.isArray(value)) return null;
  return value
    .slice(0, max)
    .filter(
      (entry): entry is T =>
        isRecord(entry) && required.every((key) => typeof entry[key] === "string"),
    );
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
