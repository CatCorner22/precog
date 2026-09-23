import type { IndustryId } from "./industry";
import { getIndustryTemplate, type IndustryTemplate } from "./templates";
import type { ControlItem, KnowledgeItem, KnowledgeRelation, Person, ProcessNode } from "./types";
import { CONFLICT_RULES } from "./sod/conflict-rules";
import { detectSodConflicts } from "./sod/detect";

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
  const processes = (processOverrides ?? base.processes).map((p) => ({
    ...p,
    ownerPersonIds: (p.ownerPersonIds ?? []).filter((id) => ids.has(id)),
  }));
  const resolved = { ...base, people, knowledge, relations, processes };
  return {
    ...resolved,
    controls: peopleOverrides ? ownControls(base.controls, resolved) : base.controls,
  };
}

const RULE_LINKED_CONTROLS = new Set(
  CONFLICT_RULES.map((r) => r.linkedControlId).filter((id): id is string => Boolean(id)),
);

/**
 * The sample business's control records describe the sample team: one
 * accepted residual risk, compensating controls its people perform, and
 * "segregated" flags written by hand. None of that is a fact about this
 * owner's business. With the owner's own people, a control a conflict rule
 * links to is segregated exactly when no employee holds that rule's pair,
 * nothing is accepted, and nothing is credited as in place until the owner
 * records it.
 */
function ownControls(controls: readonly ControlItem[], tpl: IndustryTemplate): ControlItem[] {
  const open = new Set(
    detectSodConflicts(tpl)
      .conflicts.filter((c) => !c.ownerHeld && c.linkedControlId)
      .map((c) => c.linkedControlId as string),
  );
  return controls.map((c) => ({
    ...c,
    segregated: RULE_LINKED_CONTROLS.has(c.id) ? !open.has(c.id) : c.segregated,
    residualRiskAccepted: false,
    compensatingControls: [],
  }));
}

/** The unmodified industry template (before any user overrides). */
export function getBaseTemplate(industry: IndustryId): IndustryTemplate {
  return getIndustryTemplate(industry);
}
