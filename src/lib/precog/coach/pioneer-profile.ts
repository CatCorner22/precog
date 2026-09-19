import { INDUSTRIES, type IndustryId } from "../industry";
import { resolveTemplate } from "../active-template";
import { mergeDualReleasePolicy, type DualReleasePolicy } from "../controls/dual-release";
import { defaultProfile, type PracticeProfile } from "../practice-profile";
import type { RiskVariableState } from "../scoring/dynamic-variables";
import type { Person, ProcessNode, StaffComposition } from "../types";

/** The slice of a PracticeProfile that changes what Pioneer computes. */
export interface PioneerProfileInput {
  industry?: IndustryId;
  practiceName?: string;
  staff?: Partial<StaffComposition>;
  riskVariables?: Partial<RiskVariableState>;
  dualRelease?: Partial<DualReleasePolicy> | null;
  customProcesses?: ProcessNode[] | null;
  customPeople?: Person[] | null;
}

const MAX_CUSTOM_NODES = 250;

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
  const dualRelease = mergeDualReleasePolicy(
    resolveTemplate({ industry, customProcesses, customPeople }),
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
  };
}
