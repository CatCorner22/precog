import type { IndustryId } from "./industry";
import { getIndustryTemplate, type IndustryTemplate } from "./templates";
import type { ControlItem, KnowledgeItem, KnowledgeRelation, Person, ProcessNode } from "./types";
import { CONFLICT_RULES } from "./sod/conflict-rules";
import { detectSodConflicts, type DetectedConflict } from "./sod/detect";

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
 * accepted residual risk, compensating controls its people perform,
 * "segregated" flags written by hand and descriptions of the sample's gaps.
 * None of that is a fact about this owner's business. With the owner's own
 * people:
 * - a control a conflict rule links to is segregated exactly when no employee
 *   holds one of its pairs, and its description names the pairs that are open;
 * - every other control is marked as a starter the owner has not confirmed;
 * - nothing is accepted, and nothing is credited as in place until the owner
 *   records it.
 */
function ownControls(controls: readonly ControlItem[], tpl: IndustryTemplate): ControlItem[] {
  const openByControl = new Map<string, DetectedConflict[]>();
  const ownerHolds = new Set<string>();
  for (const conflict of detectSodConflicts(tpl).conflicts) {
    const controlId = conflict.linkedControlId;
    if (!controlId) continue;
    if (conflict.ownerHeld) {
      ownerHolds.add(controlId);
      continue;
    }
    openByControl.set(controlId, [...(openByControl.get(controlId) ?? []), conflict]);
  }
  return controls.map((c) => {
    const own = { ...c, residualRiskAccepted: false, compensatingControls: [] };
    if (!RULE_LINKED_CONTROLS.has(c.id)) return { ...own, starter: true };
    const open = openByControl.get(c.id) ?? [];
    return {
      ...own,
      segregated: open.length === 0,
      description: describeOwnControl(open, ownerHolds.has(c.id)),
    };
  });
}

/** Lower-cases a rule title's first word unless it is an acronym ("ACH initiation"). */
function lowerFirst(title: string): string {
  return /^[A-Z][a-z]/.test(title) ? title[0].toLowerCase() + title.slice(1) : title;
}

/** What a rule-linked control covers on this team, named from the pairs actually open. */
function describeOwnControl(open: readonly DetectedConflict[], ownerHolds: boolean): string {
  if (open.length === 0) {
    return ownerHolds
      ? "Only the owner holds a pair of duties this control covers; someone outside the pair reading the records closes it."
      : "Nobody on your team holds a pair of duties this control covers.";
  }
  const shown = open
    .slice(0, 3)
    .map((c) => `${c.personName} (${lowerFirst(c.title)})`)
    .join("; ");
  const more = open.length - 3;
  return `Open on your team: ${shown}${more > 0 ? `; and ${more} more` : ""}.`;
}

/** The unmodified industry template (before any user overrides). */
export function getBaseTemplate(industry: IndustryId): IndustryTemplate {
  return getIndustryTemplate(industry);
}
