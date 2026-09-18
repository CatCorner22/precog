import type { IndustryId } from "./industry";
import { getIndustryTemplate, type IndustryTemplate } from "./templates";
import type { ProcessNode } from "./types";

let base: IndustryTemplate = getIndustryTemplate("dental");
let active: IndustryTemplate = base;
let revision = 0;

export function getActiveTemplate(): IndustryTemplate {
  return active;
}

/** The unmodified industry template (before any user process overrides). */
export function getBaseTemplate(): IndustryTemplate {
  return base;
}

export function getTemplateRevision(): number {
  return revision;
}

/** Swap the in-memory demo template (processes, people, scenarios, controls). */
export function setActiveIndustry(id: IndustryId): IndustryTemplate {
  base = getIndustryTemplate(id);
  active = base;
  revision += 1;
  return active;
}

/**
 * Layer user-built processes over the base template so every engine
 * (process map, residual scoring, COSO, Pioneer tools) sees the custom map.
 * Pass null to revert to the template's processes.
 */
export function setProcessOverrides(processes: ProcessNode[] | null): IndustryTemplate {
  active = processes ? { ...base, processes } : base;
  revision += 1;
  return active;
}
