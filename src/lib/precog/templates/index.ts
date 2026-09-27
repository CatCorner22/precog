import { DEFAULT_INDUSTRY, industryMeta, type IndustryId } from "../industry";
import type { ControlItem, ScenarioTemplate } from "../types";
import type { IndustrySample, IndustryTemplate } from "./types";
import { CASE_LIBRARY, casesForSodRules } from "../evidence";
import type { CaseStudy } from "../evidence/types";
import { CONFLICT_RULES } from "../sod/conflict-rules";
import { detectSodConflicts } from "../sod/detect";
import { deriveStaffFromTeam } from "../sod/derive-staff";
import { dentalTemplate } from "./dental";
import { retailTemplate } from "./retail";
import { professionalServicesTemplate } from "./professional-services";
import { restaurantTemplate } from "./restaurant";
import { constructionTemplate } from "./construction";
import { automotiveTemplate } from "./automotive";
import { nonprofitTemplate } from "./nonprofit";
import { generalTemplate } from "./general";

export type { IndustryTemplate } from "./types";

/** The sample business for an industry, with its derived figures (see IndustrySample). */
export function getIndustryTemplate(id: IndustryId): IndustryTemplate {
  const key = id in REGISTRY ? id : DEFAULT_INDUSTRY;
  return (BUILT[key] ??= sampleTemplate(REGISTRY[key]));
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

const REGISTRY: Record<IndustryId, IndustrySample> = {
  dental: dentalTemplate,
  retail: retailTemplate,
  professional_services: professionalServicesTemplate,
  restaurant: restaurantTemplate,
  construction: constructionTemplate,
  automotive: automotiveTemplate,
  nonprofit: nonprofitTemplate,
  general: generalTemplate,
};

/** Built on first use: the engines it runs import this module in turn. */
const BUILT: Partial<Record<IndustryId, IndustryTemplate>> = {};

/**
 * Derive a sample's figures from its people exactly as an owner's are
 * derived from theirs, so no screen shows a typed-in figure next to one the
 * engines compute from the same team.
 */
function sampleTemplate(sample: IndustrySample): IndustryTemplate {
  const { dualControlPayments, independentBankRec } = sample.staffComposition;
  const safeguards = { dualControlPayments, independentBankRec };
  const draft: IndustryTemplate = {
    ...sample,
    businessName: industryMeta(sample.id).demoName,
    staffComposition: {
      teamSize: 0,
      soleOwnerKnowledgeCount: 0,
      avgTenureYears: 0,
      segregationScore: 0,
      ...safeguards,
    },
  };
  const tpl = { ...draft, controls: controlsAsHeld(draft) };
  // The sample states who reconciles; its people carry no duty lists to read it from.
  const derived = deriveStaffFromTeam(tpl, { ...tpl.staffComposition, bankRecSource: "manual" });
  return {
    ...tpl,
    staffComposition: {
      teamSize: derived.teamSize,
      soleOwnerKnowledgeCount: derived.soleOwnerKnowledgeCount,
      avgTenureYears: derived.avgTenureYears,
      segregationScore: derived.segregationScore,
      ...safeguards,
    },
  };
}

const RULE_LINKED_CONTROLS = new Set(
  CONFLICT_RULES.map((r) => r.linkedControlId).filter((id): id is string => Boolean(id)),
);

/**
 * A control a conflict rule covers is segregated exactly when nobody but the
 * owner holds one of its pairs, as on an owner's own team; the sample's flag
 * stands for every other control.
 */
function controlsAsHeld(tpl: IndustryTemplate): ControlItem[] {
  const open = new Set<string>();
  for (const c of detectSodConflicts(tpl).conflicts) {
    if (c.linkedControlId && !c.ownerHeld) open.add(c.linkedControlId);
  }
  return tpl.controls.map((c) =>
    RULE_LINKED_CONTROLS.has(c.id) ? { ...c, segregated: !open.has(c.id) } : c,
  );
}
