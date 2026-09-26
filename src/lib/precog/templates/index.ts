import type { IndustryId } from "../industry";
import type { ScenarioTemplate } from "../types";
import type { IndustryTemplate } from "./types";
import { CASE_LIBRARY, casesForSodRules } from "../evidence";
import type { CaseStudy } from "../evidence/types";
import { CONFLICT_RULES } from "../sod/conflict-rules";
import { dentalTemplate } from "./dental";
import { retailTemplate } from "./retail";
import { professionalServicesTemplate } from "./professional-services";
import { restaurantTemplate } from "./restaurant";
import { constructionTemplate } from "./construction";
import { nonprofitTemplate } from "./nonprofit";
import { generalTemplate } from "./general";

export type { IndustryTemplate } from "./types";

export function getIndustryTemplate(id: IndustryId): IndustryTemplate {
  return REGISTRY[id] ?? dentalTemplate;
}

/**
 * The prosecuted cases behind a scenario: any case it names, then the cases
 * that show a duty pair it plays out, whether the conflict rule links to the
 * scenario or the scenario names the rule.
 */
export function scenarioCases(
  scenario: Pick<ScenarioTemplate, "id" | "sodRuleIds" | "caseIds">,
): CaseStudy[] {
  const ruleIds = new Set(scenario.sodRuleIds ?? []);
  for (const rule of CONFLICT_RULES)
    if (rule.linkedScenarioId === scenario.id) ruleIds.add(rule.id);
  const named = (scenario.caseIds ?? []).flatMap((id) => CASE_LIBRARY.filter((c) => c.id === id));
  const byRule = ruleIds.size ? casesForSodRules([...ruleIds]) : [];
  return [...named, ...byRule.filter((c) => !named.includes(c))];
}

const REGISTRY: Record<IndustryId, IndustryTemplate> = {
  dental: dentalTemplate,
  retail: retailTemplate,
  professional_services: professionalServicesTemplate,
  restaurant: restaurantTemplate,
  construction: constructionTemplate,
  nonprofit: nonprofitTemplate,
  general: generalTemplate,
};
