import { CRITICALITY_WEIGHT } from "../continuity/coverage";
import type { IndustryId } from "../industry";
import type { KnowledgeItem } from "../types";
import { isWrittenProcedure } from "./lifecycle";
import type { Procedure } from "./types";

/** A register item nothing is written for yet: a procedure worth starting. */
export interface UnwrittenRow {
  item: KnowledgeItem;
  /** A procedure already started for it with no steps yet, to continue rather than start another. */
  startedId?: string;
}

const KIND_ORDER: Record<string, number> = { duty: 0, task: 1, knowledge: 2 };

/**
 * Register items with no written procedure in this industry (one with at
 * least one step, the rule Who knows what uses) and nothing written down
 * elsewhere, duties and tasks first, then by criticality. Nothing is invented:
 * starting one creates an empty procedure named after the item.
 */
export function unwrittenProcedureRows(
  knowledge: readonly KnowledgeItem[],
  procedures: readonly Procedure[],
  industry: IndustryId,
): UnwrittenRow[] {
  const own = procedures.filter((p) => p.industry === industry);
  const covered = new Set(own.filter(isWrittenProcedure).flatMap((p) => p.knowledgeIds));
  const started = new Map<string, string>();
  for (const p of own) {
    if (isWrittenProcedure(p)) continue;
    for (const id of p.knowledgeIds) if (!started.has(id)) started.set(id, p.id);
  }
  return knowledge
    .filter((item) => !covered.has(item.id) && !item.documented)
    .sort(
      (a, b) =>
        (KIND_ORDER[a.kind ?? "knowledge"] ?? 2) - (KIND_ORDER[b.kind ?? "knowledge"] ?? 2) ||
        CRITICALITY_WEIGHT[b.criticality] - CRITICALITY_WEIGHT[a.criticality] ||
        a.name.localeCompare(b.name),
    )
    .map((item) => {
      const startedId = started.get(item.id);
      return startedId ? { item, startedId } : { item };
    });
}
