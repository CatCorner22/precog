import type { IndustryId } from "./industry";
import { getIndustryTemplate, type IndustryTemplate } from "./templates";
import type { Person, ProcessNode } from "./types";

/** The slice of a practice profile that determines which template the engines see. */
export interface TemplateSource {
  industry: IndustryId;
  customProcesses?: ProcessNode[] | null;
  customPeople?: Person[] | null;
}

/**
 * Layer a business's own people and process map over its industry template.
 *
 * Pure: the same source always yields an equivalent template, so callers on
 * the server can build one per request and callers in React can memoize on
 * the three inputs. Knowledge relations and process owners that point at
 * people who are no longer on the team are dropped so no engine ever sees a
 * dangling owner.
 */
export function resolveTemplate(source: TemplateSource): IndustryTemplate {
  const base = getIndustryTemplate(source.industry);
  const peopleOverrides = source.customPeople ?? null;
  const processOverrides = source.customProcesses ?? null;
  const people = peopleOverrides ?? base.people;
  const ids = new Set(people.map((p) => p.id));
  return {
    ...base,
    people,
    relations: peopleOverrides ? base.relations.filter((r) => ids.has(r.personId)) : base.relations,
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
