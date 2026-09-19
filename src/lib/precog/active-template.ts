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

/**
 * Run `fn` with different overrides in place, then restore the caller's state.
 * Must be synchronous — engines read module state, so no `await` inside `fn`.
 * Used for what-if scoring (baselines, stress tests) without touching the live map.
 */
export function withTemplateOverrides<T>(
  overrides: { processes?: ProcessNode[] | null; people?: Person[] | null },
  fn: (tpl: IndustryTemplate) => T,
): T {
  const prevP = processOverrides;
  const prevPeople = peopleOverrides;
  const prevRevision = revision;
  if (overrides.processes !== undefined) processOverrides = overrides.processes;
  if (overrides.people !== undefined) peopleOverrides = overrides.people;
  rebuild();
  try {
    return fn(active);
  } finally {
    processOverrides = prevP;
    peopleOverrides = prevPeople;
    rebuild();
    // Scratch rebuilds must not look like real edits to revision-driven memoisation.
    revision = prevRevision;
  }
}
