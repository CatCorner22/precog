/**
 * The continuity planner's decisions that do not need React: what a
 * confirmation says before the register loses data. The hook in
 * use-continuity-planner.ts calls these; the tests call them directly.
 */
import type { KnowledgeItem, KnowledgeRelation } from "@/lib/precog/types";
import { count } from "@/lib/precog/text";

/** Asked before "Back to starter list" throws away the owner's own register. */
export function resetRegisterPrompt(
  register: { knowledge: readonly KnowledgeItem[]; relations: readonly KnowledgeRelation[] },
  industryLabel: string,
): string {
  return `Replace your ${registerSize(register)} with the ${industryLabel.toLowerCase()} starter list? Your items and every mark on them are lost, and this cannot be undone.`;
}

/** Asked before an imported file replaces the owner's own register. */
export function importRegisterPrompt(
  register: { knowledge: readonly KnowledgeItem[]; relations: readonly KnowledgeRelation[] },
  file: { knowledge: readonly KnowledgeItem[]; relations: readonly KnowledgeRelation[] },
): string {
  return `Replace your ${registerSize(register)} with the ${registerSize(file)} in this file? What the register says now is lost, and this cannot be undone.`;
}

/** Asked before one item, and everyone's mark on it, leaves the register. */
export function removeItemPrompt(
  item: Pick<KnowledgeItem, "id" | "name">,
  relations: readonly KnowledgeRelation[],
): string {
  const marks = relations.filter((r) => r.knowledgeId === item.id).length;
  return `Remove "${item.name}" from the register${
    marks > 0 ? ` with the ${count(marks, "mark")} on it` : ""
  }? This cannot be undone.`;
}

function registerSize(register: {
  knowledge: readonly KnowledgeItem[];
  relations: readonly KnowledgeRelation[];
}): string {
  return `${count(register.knowledge.length, "item")} and ${count(register.relations.length, "mark")}`;
}
