import type { IndustryId } from "./industry";
import { getIndustryTemplate, type IndustryTemplate } from "./templates";

let active: IndustryTemplate = getIndustryTemplate("dental");
let revision = 0;

export function getActiveTemplate(): IndustryTemplate {
  return active;
}

export function getTemplateRevision(): number {
  return revision;
}

/** Swap the in-memory demo template (processes, people, scenarios, controls). */
export function setActiveIndustry(id: IndustryId): IndustryTemplate {
  active = getIndustryTemplate(id);
  revision += 1;
  return active;
}
