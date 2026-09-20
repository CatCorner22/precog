import { INDUSTRIES, type IndustryId } from "../industry";
import { resolveTemplate } from "../active-template";
import { mergeDualReleasePolicy, type DualReleasePolicy } from "../controls/dual-release";
import { defaultProfile, type PracticeProfile } from "../practice-profile";
import type { RiskVariableState } from "../scoring/dynamic-variables";
import type {
  KnowledgeItem,
  KnowledgeRelation,
  Person,
  ProcessNode,
  StaffComposition,
} from "../types";

/** The slice of a PracticeProfile that changes what Pioneer computes. */
export interface PioneerProfileInput {
  industry?: IndustryId;
  practiceName?: string;
  staff?: Partial<StaffComposition>;
  riskVariables?: Partial<RiskVariableState>;
  dualRelease?: Partial<DualReleasePolicy> | null;
  customProcesses?: ProcessNode[] | null;
  customPeople?: Person[] | null;
  customKnowledge?: KnowledgeItem[] | null;
  customRelations?: KnowledgeRelation[] | null;
}

const MAX_CUSTOM_NODES = 250;
const MAX_RELATIONS = 2500;

function isIndustryId(value: unknown): value is IndustryId {
  return typeof value === "string" && INDUSTRIES.some((i) => i.id === value);
}

function capList<T>(list: T[] | null | undefined): T[] | null {
  return Array.isArray(list) ? list.slice(0, MAX_CUSTOM_NODES) : null;
}

/**
 * Build the canonical profile Pioneer reasons over. Missing fields fall back
 * to the chosen industry's template — never to another industry's.
 */
export function pioneerProfileFrom(input: PioneerProfileInput): PracticeProfile {
  const industry: IndustryId = isIndustryId(input.industry) ? input.industry : "general";
  const base = defaultProfile(industry);
  const staff: StaffComposition = { ...base.staff, ...(input.staff ?? {}) };
  const customProcesses = capList(input.customProcesses);
  const customPeople = capList(input.customPeople);
  const customKnowledge = capList(input.customKnowledge);
  const customRelations = Array.isArray(input.customRelations)
    ? input.customRelations.slice(0, MAX_RELATIONS)
    : null;
  const dualRelease = mergeDualReleasePolicy(
    resolveTemplate({ industry, customProcesses, customPeople, customKnowledge, customRelations }),
    input.dualRelease,
    staff,
  );
  const riskVariables: RiskVariableState = {
    ...base.riskVariables,
    ...(input.riskVariables ?? {}),
    hasDualControl: staff.dualControlPayments,
    hasIndependentBankRec: staff.independentBankRec,
  };
  const practiceName = (input.practiceName ?? "").trim().slice(0, 80);
  return {
    ...base,
    practiceName: practiceName || base.practiceName,
    industry,
    staff,
    riskVariables,
    dualRelease,
    customProcesses,
    customPeople,
    customKnowledge,
    customRelations,
  };
}
