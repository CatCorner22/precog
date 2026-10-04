import { z } from "zod";
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
  const file = z.object({ processes: z.array(z.unknown()).min(1) }).safeParse(raw);
  if (!file.success) throw new Error("The file has no processes to restore.");
  const record = raw as { people?: unknown; layout?: unknown };
  let dropped = 0;
  const keep = <T>(items: unknown, schema: z.ZodType<T>): T[] => {
    if (!Array.isArray(items)) return [];
    const kept: T[] = [];
    for (const item of items) {
      const parsed = schema.safeParse(item);
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
      const parsed = position.safeParse(at);
      if (parsed.success) layout[id] = parsed.data;
      else dropped += 1;
    }
  }

  return { processes, people: peopleFromBackup(record.people), layout, dropped };
}

/** A list of strings, keeping only the strings. */
const strings = z
  .array(z.unknown())
  .catch([])
  .transform((items) => items.filter((x): x is string => typeof x === "string"));
const optionalText = (max: number) =>
  z
    .string()
    .optional()
    .catch(undefined)
    .transform((s) => s?.trim().slice(0, max) || undefined);
const note = z.string().catch("");
const title = z.string().trim().min(1);
const score = z.number().int().min(1).max(5);

const processShell = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  description: z.string().catch(""),
  dependencies: strings,
  controlIds: strings,
  stage: z.number().int().min(0).catch(0),
  ownerPersonIds: strings,
  risks: z.unknown().optional(),
  ideas: z.unknown().optional(),
  wastes: z.unknown().optional(),
  inputs: strings,
  outputs: strings,
  evidence: z.unknown().optional(),
  cadence: z.string().optional().catch(undefined),
  systems: strings.optional(),
  documented: z.boolean().optional().catch(undefined),
  procedureLocation: optionalText(PROCESS_TEXT_LIMITS.location),
});

const risk = z.object({
  id: z.string().min(1),
  title,
  kind: z.enum(RISK_KINDS),
  severity: score.transform((n) => n as 1 | 2 | 3 | 4 | 5),
  likelihood: score.transform((n) => n as 1 | 2 | 3 | 4 | 5),
  note,
  linkedControlId: optionalText(200),
  linkedScenarioId: optionalText(200),
  linkedKnowledgeId: optionalText(200),
});

const idea = z.object({
  id: z.string().min(1),
  title,
  category: z.enum(IDEA_CATEGORIES),
  effort: z.enum(LEVELS),
  impact: z.enum(LEVELS),
  status: z.enum(IDEA_STATUSES),
  note,
});

const waste = z.object({
  id: z.string().min(1),
  kind: z.enum(WASTE_KINDS),
  label: title,
  note,
});

const evidence = z.object({
  id: z.string().min(1),
  label: title,
  frequency: z.enum(Object.keys(FREQUENCY_LABEL) as EvidenceFrequency[]),
  reviewerPersonId: optionalText(200),
  lastDoneAt: z.iso.datetime({ offset: true }).optional().catch(undefined),
  note: optionalText(PROCESS_TEXT_LIMITS.itemNote),
});

const position = z.object({ x: z.number(), y: z.number() });
