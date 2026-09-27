import { CRITICALITY_WEIGHT } from "../continuity/coverage";
import type { IndustryId } from "../industry";
import type { KnowledgeItem } from "../types";
import type { Procedure } from "./types";

/** A register item nothing is written for yet: a procedure worth starting. */
export interface UnwrittenRow {
  item: KnowledgeItem;
}

const KIND_ORDER: Record<string, number> = { duty: 0, task: 1, knowledge: 2 };

/**
 * Register items with no procedure in this industry and nothing written down
 * elsewhere, duties and tasks first, then by criticality. Nothing is invented:
 * starting one creates an empty procedure named after the item.
 */
export function unwrittenProcedureRows(
  knowledge: readonly KnowledgeItem[],
  procedures: readonly Procedure[],
  industry: IndustryId,
): UnwrittenRow[] {
  const covered = new Set(
    procedures.filter((p) => p.industry === industry).flatMap((p) => p.knowledgeIds),
  );
  return knowledge
    .filter((item) => !covered.has(item.id) && !item.documented)
    .sort(
      (a, b) =>
        (KIND_ORDER[a.kind ?? "knowledge"] ?? 2) - (KIND_ORDER[b.kind ?? "knowledge"] ?? 2) ||
        CRITICALITY_WEIGHT[b.criticality] - CRITICALITY_WEIGHT[a.criticality] ||
        a.name.localeCompare(b.name),
    )
    .map((item) => ({ item }));
}
