import type { IndustryId } from "../industry";
import type { KnowledgeItem } from "../types";
import { isWrittenProcedure } from "./lifecycle";
import { DEFAULT_REVIEW_DAYS } from "./normalize";
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

/** What a register link reads from a written procedure: never its steps, people or pictures. */
export interface ProcedureLinkInput {
  id: string;
  title: string;
  knowledgeIds: string[];
}

/** The links for this industry's written procedures, as the Pioneer coach is sent them. */
export function writtenProcedureLinks(
  procedures: readonly Procedure[] | null | undefined,
  industry: IndustryId,
): ProcedureLinkInput[] {
  return (procedures ?? [])
    .filter((p) => p.industry === industry && isWrittenProcedure(p) && p.knowledgeIds.length > 0)
    .map((p) => ({ id: p.id, title: p.title, knowledgeIds: [...p.knowledgeIds] }));
}

/** The step text a link-only procedure carries, so it counts as written. */
export const LINK_ONLY_STEP = "Written in Procedures.";

/**
 * A procedure that holds only its link to the register, for a server that is
 * sent the links and not the steps. It counts as written (one placeholder
 * step), is never verified, and names no one, so it adds no reminder or
 * duty warning of its own.
 */
export function linkOnlyProcedure(
  link: ProcedureLinkInput,
  industry: IndustryId,
  today: string,
): Procedure {
  return {
    id: link.id,
    industry,
    title: link.title,
    prerequisites: [],
    steps: [{ id: `${link.id}-linked`, text: LINK_ONLY_STEP }],
    knowledgeIds: link.knowledgeIds,
    processIds: [],
    backupPersonIds: [],
    reviewEveryDays: DEFAULT_REVIEW_DAYS,
    version: 1,
    changelog: [],
    proofs: [],
    createdAt: today,
    updatedAt: today,
  };
}
