import { resolveTemplate, type TemplateSource } from "./active-template";
import type { ProcessNode } from "./types";

/**
 * The process map an edit starts from: the business's own map, or the
 * template's with owners limited to people on this team. Seeding from the raw
 * template saved the sample's owner ids (p1…p6) into an owner's map, where a
 * later import holding those ids would have brought the sample's owners back.
 */
export function processesToEdit(source: TemplateSource): ProcessNode[] {
  return source.customProcesses ?? resolveTemplate(source).processes;
}
