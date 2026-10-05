import type { KnowledgeLevel, KnowledgeRelation } from "./types";

/** Weakest to strongest, matching the register's domain scale. */
export const KNOWLEDGE_LEVEL_ORDER: readonly KnowledgeLevel[] = [
  "aware",
  "basic",
  "proficient",
  "expert",
];

const LEVEL_RANK = new Map(KNOWLEDGE_LEVEL_ORDER.map((level, rank) => [level, rank]));

/**
 * One relation per knowledge/person pair, in first-seen pair order.
 * Conflicting duplicates keep the strongest valid level.
 */
export function normalizeKnowledgeRelations(
  relations: readonly KnowledgeRelation[],
): KnowledgeRelation[] {
  const normalized: KnowledgeRelation[] = [];
  const pairIndex = new Map<string, Map<string, number>>();

  for (const relation of relations) {
    const rank = LEVEL_RANK.get(relation.level);
    if (rank === undefined) continue;

    let people = pairIndex.get(relation.knowledgeId);
    if (!people) {
      people = new Map();
      pairIndex.set(relation.knowledgeId, people);
    }
    const existingIndex = people.get(relation.personId);
    if (existingIndex === undefined) {
      people.set(relation.personId, normalized.length);
      normalized.push(relation);
      continue;
    }
    if (rank > LEVEL_RANK.get(normalized[existingIndex].level)!) {
      normalized[existingIndex] = relation;
    }
  }

  return normalized;
}
