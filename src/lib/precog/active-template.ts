import type { IndustryId } from "./industry";
import { getIndustryTemplate, type IndustryTemplate } from "./templates";
import type { Person, ProcessNode } from "./types";

let base: IndustryTemplate = getIndustryTemplate("dental");
let processOverrides: ProcessNode[] | null = null;
let peopleOverrides: Person[] | null = null;
let active: IndustryTemplate = base;
let revision = 0;

function rebuild() {
  const people = peopleOverrides ?? base.people;
  const ids = new Set(people.map((p) => p.id));
  active = {
    ...base,
    people,
    // Drop knowledge relations that point at removed people so engines never see dangling owners.
    relations: peopleOverrides
      ? base.relations.filter((r) => ids.has(r.personId))
      : base.relations,
    processes: (processOverrides ?? base.processes).map((p) => ({
      ...p,
      ownerPersonIds: (p.ownerPersonIds ?? []).filter((id) => ids.has(id)),
    })),
  };
  revision += 1;
}

export function getActiveTemplate(): IndustryTemplate {
  return active;
}

/** The unmodified industry template (before any user overrides). */
export function getBaseTemplate(): IndustryTemplate {
  return base;
}

export function getTemplateRevision(): number {
  return revision;
}

/** Swap the in-memory demo template (processes, people, scenarios, controls). */
export function setActiveIndustry(id: IndustryId): IndustryTemplate {
  base = getIndustryTemplate(id);
  processOverrides = null;
  peopleOverrides = null;
  rebuild();
  return active;
}

/**
 * Layer user-built processes over the base template so every engine
 * (process map, residual scoring, COSO, Pioneer tools) sees the custom map.
 * Pass null to revert to the template's processes.
 */
export function setProcessOverrides(processes: ProcessNode[] | null): IndustryTemplate {
  processOverrides = processes;
  rebuild();
  return active;
}

/** Layer the user's real team over the template people. Pass null to revert. */
export function setPeopleOverrides(people: Person[] | null): IndustryTemplate {
  peopleOverrides = people;
  rebuild();
  return active;
}
