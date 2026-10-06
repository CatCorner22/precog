import * as z from "zod/mini";
import type { IndustryId } from "../industry";
import { peopleFromBackup } from "../import/people-backup";
import { normalizeSystems, parseCadence } from "../process-record";
import { IDEA_CATEGORIES, IDEA_STATUSES, LEVELS, RISK_KINDS, WASTE_KINDS } from "../process-vocab";
import type { EvidenceFrequency, Person, ProcessNode } from "../types";
import { FREQUENCY_LABEL } from "./evidence";
import { PROCESS_TEXT_LIMITS } from "./process-text-sync";

/** A process map read back from a JSON backup, with what had to be left out. */
export interface MapBackup {
  processes: ProcessNode[];
  /** The backup's team, each field checked (empty when the backup has none). */
  people: Person[];
  layout: Record<string, { x: number; y: number }>;
  /** Processes, risks, ideas, waste, evidence and positions left out as malformed. */
  dropped: number;
}

/** Largest map backup the importer reads, in bytes; checked before the file is parsed. */
export const MAX_MAP_BACKUP_BYTES = 2 * 1024 * 1024;

/** Why a backup of `bytes` refuses to import, or null when its size is fine. */
export function mapBackupSizeRefusal(bytes: number): string | null {
  if (bytes <= MAX_MAP_BACKUP_BYTES) return null;
  return `This file is too large to import (${Math.ceil(bytes / 1024 / 1024)} MB; the limit is 2 MB). Export a smaller map, or split it first.`;
}

/** The JSON backup the builder's Export writes. */
export function mapBackupJson(backup: {
  industry: IndustryId;
  businessName: string;
  processes: ProcessNode[];
  people: Person[];
  layout: Record<string, { x: number; y: number }>;
}): string {
  return JSON.stringify(
    {
      version: 3,
      industry: backup.industry,
      businessName: backup.businessName,
      exportedAt: new Date().toISOString(),
      processes: backup.processes,
      people: backup.people,
      layout: backup.layout,
    },
    null,
    2,
  );
}

/**
 * Read a JSON backup (a file the owner may have edited by hand). A process
 * needs an id and a name; each risk, idea, waste, evidence item and position
 * is checked on its own and left out when malformed, so one bad entry never
 * turns a score into NaN. Dependencies on processes not in the file are
 * dropped. Throws with a plain message when there is nothing to restore.
 */
export function parseMapBackup(raw: unknown): MapBackup {
  const file = z.safeParse(
    z.object({ processes: z.array(z.unknown()).check(z.minLength(1)) }),
    raw,
  );
  if (!file.success) throw new Error("The file has no processes to restore.");
  const record = raw as { people?: unknown; layout?: unknown };
  let dropped = 0;
  const keep = <T>(items: unknown, schema: z.ZodMiniType<T>): T[] => {
    if (!Array.isArray(items)) return [];
    const kept: T[] = [];
    for (const item of items) {
      const parsed = z.safeParse(schema, item);
      if (parsed.success) kept.push(parsed.data);
      else dropped += 1;
    }
    return kept;
  };

  const shells = keep(file.data.processes, processShell);
  const ids = new Set(shells.map((p) => p.id));
  const processes: ProcessNode[] = shells.map((p) => ({
    id: p.id,
    name: p.name,
    layer: "process",
    description: p.description,
    dependencies: p.dependencies.filter((d) => ids.has(d)),
    controlIds: p.controlIds,
    stage: p.stage,
    ownerPersonIds: p.ownerPersonIds,
    risks: keep(p.risks, risk),
    ideas: keep(p.ideas, idea),
    wastes: keep(p.wastes, waste),
    inputs: p.inputs,
    outputs: p.outputs,
    evidence: keep(p.evidence, evidence),
    cadence: parseCadence(p.cadence),
    systems: p.systems ? normalizeSystems(p.systems) : undefined,
    documented: p.documented,
    procedureLocation: p.procedureLocation,
  }));
  if (!processes.length) throw new Error("None of the processes in the file has an id and a name.");

  const layout: MapBackup["layout"] = {};
  if (record.layout && typeof record.layout === "object") {
    for (const [id, at] of Object.entries(record.layout)) {
      const parsed = z.safeParse(position, at);
      if (parsed.success) layout[id] = parsed.data;
      else dropped += 1;
    }
  }

  return { processes, people: peopleFromBackup(record.people), layout, dropped };
}

/** A list of strings, keeping only the strings. */
const strings = z.pipe(
  z.catch(z.array(z.unknown()), []),
  z.transform((items) => items.filter((x): x is string => typeof x === "string")),
);
/** Absent, or anything but a string, reads as undefined rather than dropping the whole entry. */
const optionalOrUndefined = <T extends z.ZodMiniType>(schema: T) =>
  z.catch(z.optional(schema), undefined);
const optionalText = (max: number) =>
  z.pipe(
    optionalOrUndefined(z.string()),
    z.transform((s) => s?.trim().slice(0, max) || undefined),
  );
const note = z.catch(z.string(), "");
const requiredId = z.string().check(z.minLength(1));
const title = z.string().check(z.trim(), z.minLength(1));
const score = z.pipe(
  z.int().check(z.minimum(1), z.maximum(5)),
  z.transform((n) => n as 1 | 2 | 3 | 4 | 5),
);

const processShell = z.object({
  id: requiredId,
  name: title,
  description: note,
  dependencies: strings,
  controlIds: strings,
  stage: z.catch(z.int().check(z.minimum(0)), 0),
  ownerPersonIds: strings,
  risks: z.optional(z.unknown()),
  ideas: z.optional(z.unknown()),
  wastes: z.optional(z.unknown()),
  inputs: strings,
  outputs: strings,
  evidence: z.optional(z.unknown()),
  cadence: optionalOrUndefined(z.string()),
  systems: z.optional(strings),
  documented: optionalOrUndefined(z.boolean()),
  procedureLocation: optionalText(PROCESS_TEXT_LIMITS.location),
});

const risk = z.object({
  id: requiredId,
  title,
  kind: z.enum(RISK_KINDS),
  severity: score,
  likelihood: score,
  note,
  linkedControlId: optionalText(200),
  linkedScenarioId: optionalText(200),
  linkedKnowledgeId: optionalText(200),
});

const idea = z.object({
  id: requiredId,
  title,
  category: z.enum(IDEA_CATEGORIES),
  effort: z.enum(LEVELS),
  impact: z.enum(LEVELS),
  status: z.enum(IDEA_STATUSES),
  note,
});

const waste = z.object({
  id: requiredId,
  kind: z.enum(WASTE_KINDS),
  label: title,
  note,
});

const evidence = z.object({
  id: requiredId,
  label: title,
  frequency: z.enum(Object.keys(FREQUENCY_LABEL) as EvidenceFrequency[]),
  reviewerPersonId: optionalText(200),
  lastDoneAt: optionalOrUndefined(z.iso.datetime({ offset: true })),
  note: optionalText(PROCESS_TEXT_LIMITS.itemNote),
});

const position = z.object({ x: z.number(), y: z.number() });
