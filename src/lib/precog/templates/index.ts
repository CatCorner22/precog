import { DEFAULT_INDUSTRY, industryMeta, type IndustryId } from "../industry";
import type { ControlItem } from "../types";
import type { IndustrySample, IndustryTemplate } from "./types";
import { CONFLICT_RULES } from "../sod/conflict-rules";
import { detectSodConflicts } from "../sod/detect";
import { deriveStaffFromTeam } from "../sod/derive-staff";
import { REGISTRY } from "./registry";

export type { IndustryTemplate } from "./types";

/** The sample business for an industry, with its derived figures (see IndustrySample). */
export function getIndustryTemplate(id: IndustryId): IndustryTemplate {
  const key = id in REGISTRY ? id : DEFAULT_INDUSTRY;
  return (BUILT[key] ??= sampleTemplate(REGISTRY[key]));
}

/**
 * Built on first use, because building a sample runs the engines (conflict
 * detection, derived staff figures) and they are not ready at import time.
 * Engines that only need a sample's arrays read `./registry` instead.
 */
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
