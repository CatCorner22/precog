import type { IndustryId } from "./industry";
import { getIndustryTemplate, type IndustryTemplate } from "./templates";
import type { KnowledgeItem, KnowledgeRelation, Person, ProcessNode } from "./types";

/** The slice of a practice profile that determines which template the engines see. */
export interface TemplateSource {
  industry: IndustryId;
  customProcesses?: ProcessNode[] | null;
  customPeople?: Person[] | null;
  customKnowledge?: KnowledgeItem[] | null;
  customRelations?: KnowledgeRelation[] | null;
}

/**
 * Layer a business's own people, process map, and duty/knowledge register
 * over its industry template.
 *
 * Pure: the same source always yields an equivalent template, so callers on
 * the server can build one per request and callers in React can memoize on
 * the inputs. Knowledge relations and process owners that point at people or
 * items that are no longer present are dropped so no engine ever sees a
 * dangling reference.
 */
export function resolveTemplate(source: TemplateSource): IndustryTemplate {
  const base = getIndustryTemplate(source.industry);
  const peopleOverrides = source.customPeople ?? null;
  const processOverrides = source.customProcesses ?? null;
  const knowledgeOverrides = source.customKnowledge ?? null;
  const relationOverrides = source.customRelations ?? null;
  const people = peopleOverrides ?? base.people;
  const ids = new Set(people.map((p) => p.id));
  const knowledge = knowledgeOverrides ?? base.knowledge;
  const knowledgeIds = new Set(knowledge.map((k) => k.id));
  const rawRelations = relationOverrides ?? base.relations;
  const relations =
    peopleOverrides || knowledgeOverrides || relationOverrides
      ? rawRelations.filter((r) => ids.has(r.personId) && knowledgeIds.has(r.knowledgeId))
      : rawRelations;
  // The sample business marks one control's residual risk as accepted to show
  // what an accepted risk looks like. That is the sample owner's decision, not
  // this owner's: a business with its own people starts with nothing accepted,
  // so no conflict is hidden before the owner has seen it.
  const controls = peopleOverrides
    ? base.controls.map((c) => (c.residualRiskAccepted ? { ...c, residualRiskAccepted: false } : c))
    : base.controls;
  return {
    ...base,
    people,
    knowledge,
    relations,
    controls,
    processes: (processOverrides ?? base.processes).map((p) => ({
      ...p,
      ownerPersonIds: (p.ownerPersonIds ?? []).filter((id) => ids.has(id)),
    })),
  };
}

/** The unmodified industry template (before any user overrides). */
export function getBaseTemplate(industry: IndustryId): IndustryTemplate {
  return getIndustryTemplate(industry);
}
