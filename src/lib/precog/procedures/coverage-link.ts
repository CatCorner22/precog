import type { IndustryId } from "../industry";
import type { KnowledgeItem } from "../types";
import { isWrittenProcedure } from "./lifecycle";
import type { Procedure, ProcedureLink } from "./types";

/**
 * Each register item with the procedures written for it (at least one step)
 * in this industry, on `linkedProcedures`. Derived every time the template is
 * built and never stored: an item whose procedures are all removed loses the
 * field, and `stripProcedureLinks` takes it off anything about to be saved.
 */
export function linkProcedures<T extends readonly KnowledgeItem[]>(
  knowledge: T,
  procedures: readonly Procedure[] | null | undefined,
  industry: IndustryId,
): T | KnowledgeItem[] {
  const byItem = new Map<string, ProcedureLink[]>();
  for (const p of procedures ?? []) {
    if (p.industry !== industry || !isWrittenProcedure(p)) continue;
    for (const id of p.knowledgeIds) {
      const list = byItem.get(id) ?? [];
      list.push({ id: p.id, title: p.title });
      byItem.set(id, list);
    }
  }
  // Unchanged input comes back as the same list, so caches keyed on it hold.
  if (byItem.size === 0 && !knowledge.some((item) => item.linkedProcedures)) return knowledge;
  return knowledge.map((item) => {
    const links = byItem.get(item.id);
    if (links) return { ...item, linkedProcedures: links };
    if (!item.linkedProcedures) return item;
    const { linkedProcedures: _derived, ...stored } = item;
    return stored;
  });
}

/** The register as stored: without the derived procedure links. */
export function stripProcedureLinks<T extends KnowledgeItem>(items: readonly T[]): T[] {
  return items.map((item) => {
    if (!("linkedProcedures" in item)) return item;
    const { linkedProcedures: _derived, ...stored } = item;
    return stored as T;
  });
}
