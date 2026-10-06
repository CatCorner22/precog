import type { SavedProcessBlock } from "./builder/process-blocks";
import { CRITICALITY_ALIASES, KIND_ALIASES } from "./import/register-csv";
import { normalizeKnowledgeRelations } from "./knowledge-relations";
import { nameKey } from "./text";
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

/**
 * The team: every person has an id, a name and a job title, and a duty list
 * (when there is one) of strings only; a duty list that is not a list is
 * dropped, as a people backup drops it. Null when the value is not a list.
 */
export function peopleEntries(value: unknown): Person[] | null {
  return (
    entries<Person>(value, ["id", "name", "role"], LIST_LIMITS.people)?.map((person) =>
      rebuilt(person, { entitlements: stringList }),
    ) ?? null
  );
}

/**
 * Processes with an id and a name. Their id lists are always lists of
 * strings; their other lists, when present, hold only what the map and the
 * report read: objects in risks, ideas, wastes and evidence, strings in
 * inputs, outputs and systems. A risk keeps a likelihood and a severity from
 * 1 to 5, or is dropped. A list field that is not a list is dropped.
 */
export function processEntries(value: unknown): ProcessNode[] | null {
  return (
    entries<ProcessNode>(value, ["id", "name"], LIST_LIMITS.processes)?.map((process) => {
      const owners = process.ownerPersonIds;
      return rebuilt(
        {
          ...process,
          dependencies: strings(process.dependencies),
          controlIds: strings(process.controlIds),
          ...(owners === undefined ? {} : { ownerPersonIds: strings(owners) }),
        },
        {
          risks: riskList,
          ideas: recordList,
          wastes: recordList,
          evidence: recordList,
          inputs: stringList,
          outputs: stringList,
          systems: stringList,
        },
      );
    }) ?? null
  );
}

/**
 * Register items with an id and a name, and a list of linked process ids.
 * A criticality or kind outside the vocabulary is read through the register
 * importer's words ("high" is critical), else as important and a duty; an
 * item without a kind keeps none (it reads as know-how).
 */
export function knowledgeEntries(value: unknown): KnowledgeItem[] | null {
  return (
    entries<KnowledgeItem>(value, ["id", "name"], LIST_LIMITS.knowledge)?.map((item) => {
      const out = { ...item, linkedProcessIds: strings(item.linkedProcessIds) };
      if (!CRITICALITIES.has(item.criticality)) {
        out.criticality = vocabularyWord(CRITICALITY_ALIASES, item.criticality) ?? "important";
      }
      if (item.kind !== undefined && !KINDS.has(item.kind)) {
        out.kind = vocabularyWord(KIND_ALIASES, item.kind) ?? "duty";
      }
      return out;
    }) ?? null
  );
}

/** Who holds which register item, and how well. */
export function relationEntries(value: unknown): KnowledgeRelation[] | null {
  const relations = entries<KnowledgeRelation>(
    value,
    ["personId", "knowledgeId", "level"],
    LIST_LIMITS.relations,
  );
  return relations && normalizeKnowledgeRelations(relations);
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
 * formed. The team, the processes and the register are compared entry by
 * entry with what the checks above rebuild: a value they would change makes
 * the list malformed, a field they only fill in (a missing list read as
 * empty) does not. The server refuses such a save rather than storing it, so
 * a stored list reads back as it was saved.
 */
export function malformedList(profile: Record<string, unknown>): string | null {
  const lists: [string, (value: unknown) => unknown[] | null, boolean][] = [
    ["customPeople", peopleEntries, true],
    ["customProcesses", processEntries, true],
    ["customKnowledge", knowledgeEntries, true],
    ["customRelations", relationEntries, false],
    ["mapVersions", mapVersionEntries, false],
    ["savedProcessBlocks", savedBlockEntries, false],
    ["mapHealthHistory", healthPointEntries, false],
    ["mapCompletenessHistory", healthPointEntries, false],
  ];
  for (const [field, check, compareEntries] of lists) {
    const value = profile[field];
    if (value === null || value === undefined) continue;
    if (!Array.isArray(value)) return field;
    const kept = check(value);
    if (kept?.length !== value.length) return field;
    if (compareEntries && kept.some((entry, i) => !sameEntry(value[i], entry))) return field;
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

/** The value as a record, or an empty one when it is not an object (an array counts as not one). */
export function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

/** A stored string, trimmed and cut at `max` characters; anything that is not a string reads as "". */
export function readText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
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

type ListRebuild = (list: unknown[]) => unknown[];

/**
 * A copy of the entry with each named list field rebuilt, and dropped when
 * it holds something other than a list. A field the entry does not have stays
 * absent, and every field keeps its place, so a well-formed entry comes back
 * as it went in.
 */
function rebuilt<T extends object>(entry: T, lists: Record<string, ListRebuild>): T {
  const out = { ...entry } as Record<string, unknown>;
  for (const [field, rebuild] of Object.entries(lists)) {
    const value = out[field];
    if (value === undefined) continue;
    if (Array.isArray(value)) out[field] = rebuild(value);
    else delete out[field];
  }
  return out as T;
}

const stringList: ListRebuild = (list) => list.filter((v) => typeof v === "string");

const recordList: ListRebuild = (list) => list.filter(isRecord);

/** Risks with a likelihood and a severity, each held to 1–5; a risk without either is dropped. */
const riskList: ListRebuild = (list) =>
  list.filter(isRecord).flatMap((risk) => {
    const { likelihood, severity } = risk;
    if (!finite(likelihood) || !finite(severity)) return [];
    return [{ ...risk, likelihood: riskLevel(likelihood), severity: riskLevel(severity) }];
  });

function riskLevel(value: number): number {
  return Math.min(5, Math.max(1, value));
}

const CRITICALITIES = new Set<unknown>(Object.values(CRITICALITY_ALIASES));
const KINDS = new Set<unknown>(Object.values(KIND_ALIASES));

/** The vocabulary word a stored value names in the register importer's table, if any. */
function vocabularyWord<T extends string>(
  aliases: Readonly<Record<string, T>>,
  value: unknown,
): T | undefined {
  if (typeof value !== "string") return undefined;
  const key = nameKey(value);
  return Object.hasOwn(aliases, key) ? aliases[key] : undefined;
}

/**
 * True when a rebuilt entry holds every value the stored entry holds. A field
 * the stored entry lacks and the rebuild fills in (an empty id list, the
 * default criticality) does not count, nor does a null list the rebuild
 * leaves out, which every reader already reads as none; a value the rebuild
 * changes or drops does.
 */
function sameEntry(stored: unknown, kept: unknown): boolean {
  if (!isRecord(stored) || !isRecord(kept)) return false;
  for (const key of new Set([...Object.keys(stored), ...Object.keys(kept)])) {
    if (stored[key] === undefined) continue;
    if (stored[key] === null && !Object.hasOwn(kept, key)) continue;
    if (!sameValue(stored[key], kept[key])) return false;
  }
  return true;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a)) {
    return Array.isArray(b) && a.length === b.length && a.every((v, i) => sameValue(v, b[i]));
  }
  if (isRecord(a) && isRecord(b)) {
    const keys = Object.keys(a);
    return (
      keys.length === Object.keys(b).length &&
      keys.every((key) => Object.hasOwn(b, key) && sameValue(a[key], b[key]))
    );
  }
  return false;
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
