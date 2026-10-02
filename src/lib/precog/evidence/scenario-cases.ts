import type { ScenarioTemplate } from "../types";
import { CONFLICT_RULES } from "../sod/conflict-rules";
import { CASE_LIBRARY, casesForSodRules } from "./index";
import type { CaseStudy } from "./types";

/**
 * The prosecuted cases behind a scenario: any case it names, then the cases
 * that show a duty pair it plays out, whether the conflict rule links to the
 * scenario or the scenario names the rule. Kept here, not with the
 * templates, so the case library loads only with the pages that show cases.
 */
export function casesBehindScenario(
  scenario: Pick<ScenarioTemplate, "id" | "sodRuleIds" | "caseIds">,
): CaseStudy[] {
  const ruleIds = new Set(scenario.sodRuleIds ?? []);
  for (const rule of CONFLICT_RULES)
    if (rule.linkedScenarioId === scenario.id) ruleIds.add(rule.id);
  const named = (scenario.caseIds ?? []).flatMap((id) => CASE_LIBRARY.filter((c) => c.id === id));
  const byRule = ruleIds.size ? casesForSodRules([...ruleIds]) : [];
  return [...named, ...byRule.filter((c) => !named.includes(c))];
}
