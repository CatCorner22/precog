import * as legacy from "./dynamic-variable-catalog";
import {
  emptyInsurance,
  enteredFact,
  known,
  modelInsuranceScenario,
  newPolicy,
  normalizeInsurance,
  policyPremium,
  type InsuranceWorkspace,
  type TermKey,
} from "../insurance/model";

export * from "./dynamic-variable-catalog";
export type InsuranceBasis = "entered" | "none" | "app_default" | "unassessed";
type Variables = legacy.RiskVariableState;
type Context = { insurance?: unknown; insuranceScenarioId?: string; insuranceDemo?: boolean };

/** Versioned metadata extends the stored JSON while preserving the public numeric-variable API. */
export function readInsurance(v: Variables): InsuranceWorkspace {
  return normalizeInsurance((v as Variables & Context).insurance);
}
export function withInsurance(v: Variables, insurance: InsuranceWorkspace): Variables {
  return { ...v, insurance: normalizeInsurance(insurance) } as Variables;
}
export function withInsuranceScenario(v: Variables, scenarioId: string): Variables {
  return { ...v, insuranceScenarioId: scenarioId } as Variables;
}
const scenarioFor = (v: Variables) =>
  (v as Variables & Context).insuranceScenarioId ?? "illustration";
const selectedPolicy = (v: Variables) => {
  const state = readInsurance(v);
  return (
    state.policies.find((p) => p.id === state.selectedPolicyId) ??
    (state.policies.length === 1 ? state.policies[0] : undefined)
  );
};

export function policyEntered(v: Variables): boolean {
  return ["reported_incomplete", "terms_entered"].includes(readInsurance(v).status);
}
export function policyFieldIsDefault(v: Variables, key: legacy.PolicyField): boolean {
  const fields: Partial<Record<legacy.PolicyField, TermKey>> = {
    basePremiumAnnual: "premiumAnnual",
    deductible: "deductible",
    policyLimit: "insurerPaymentLimit",
    coinsurancePct: "unreimbursedPct",
  };
  const field = fields[key];
  const policy = selectedPolicy(v);
  return !field || !policy || !known(policy.terms[field]);
}
export function policyDefaultsInForce(v: Variables): boolean {
  return (["basePremiumAnnual", "deductible", "policyLimit"] as const).some((key) =>
    policyFieldIsDefault(v, key),
  );
}
export function insuranceBasis(v: Variables, ownBusiness: boolean): InsuranceBasis {
  const state = readInsurance(v);
  if ((v as Variables & Context).insuranceDemo) return "app_default";
  if (state.status === "none_reported") return "none";
  if (state.status === "not_assessed") return ownBusiness ? "unassessed" : "app_default";
  return "entered";
}
export function withoutPolicy(v: Variables): Variables {
  const state = readInsurance(v);
  return withInsurance(legacy.withoutPolicy(v), { ...state, status: "none_reported" });
}

export function effectiveRiskVariables(v: Variables, ownBusiness: boolean): Variables {
  const state = readInsurance(v);
  if (ownBusiness)
    return state.status === "none_reported" ? withoutPolicy(v) : withInsurance(v, state);
  if (state.status !== "not_assessed") return withInsurance(v, state);
  // Examples remain examples. These facts are never inferred for an owner's business.
  const policy = newPolicy("sample-policy");
  policy.label = "Application demonstration policy";
  policy.limitBasis = "per_event";
  policy.terms.premiumAnnual = enteredFact(v.basePremiumAnnual, "Application example", "sample");
  policy.terms.deductible = enteredFact(v.deductible, "Application example", "sample");
  policy.terms.insurerPaymentLimit = enteredFact(v.policyLimit, "Application example", "sample");
  policy.terms.unreimbursedPct = enteredFact(v.coinsurancePct, "Application example", "sample");
  policy.scenarios[scenarioFor(v)] = "assumed_covered";
  return {
    ...withInsurance(v, {
      ...emptyInsurance(),
      status: "terms_entered",
      policies: [policy],
      selectedPolicyId: policy.id,
    }),
    insuranceDemo: true,
  } as Variables;
}

export function insuranceFigureNote(v: Variables, ownBusiness: boolean): string | null {
  const basis = insuranceBasis(v, ownBusiness);
  if (basis === "unassessed")
    return "Coverage not established. No recovery is credited; unknown coverage is not a finding that the business is uninsured.";
  if (basis === "none") return "No applicable policy reported by the owner.";
  if (basis === "app_default") return "Demonstration assumptions only, not your insurance policy.";
  const state = readInsurance(v);
  const suffix =
    state.annualFrequencyPct === null
      ? " Annual-frequency figures elsewhere remain explicitly hypothetical until you enter an assumption."
      : "";
  return `Recovery is conditional on recorded terms and scenario applicability, not an insurer's decision.${suffix}`;
}

export function computeAppliedDiscounts(v: Variables): legacy.AppliedDiscount[] {
  const policy = selectedPolicy(v);
  const credit = policy?.terms.premiumCreditPct;
  const active = Boolean(
    policy?.premiumBasis === "base_before_quoted_credit" && credit && known(credit),
  );
  return [
    {
      id: "recorded-policy-credit",
      label: "Recorded quote credit",
      pct: active ? credit!.value! : 0,
      active,
      reason: active
        ? "Applied only to a premium recorded before this quoted credit."
        : "No inferred discount; a net quoted premium is never discounted again.",
    },
  ];
}
export function computeNetPremium(v: Variables): ReturnType<typeof legacy.computeNetPremium> {
  const policy = selectedPolicy(v);
  const discounts = computeAppliedDiscounts(v);
  return {
    premiumAnnualNet: policy ? (policyPremium(policy) ?? 0) : 0,
    discountPctApplied: discounts[0].pct,
    discounts,
  };
}

/** Insurance financing and bonding do not mechanically alter operational likelihood. */
export function computeLikelihoodSeverity(
  v: Variables,
  options?: { fraudRelated?: boolean; cashRelated?: boolean },
): legacy.LikelihoodSeverityBreakdown {
  return legacy.computeLikelihoodSeverity(
    { ...v, deductible: 0, claimsLoadFactor: 1, hasBondedCashHandlers: false },
    options,
  );
}

/** Conditional arithmetic helper; calling this alone never establishes coverage. */
export function retainLoss(gross: number, v: Variables): { retained: number; transferred: number } {
  if (![gross, v.deductible, v.policyLimit, v.coinsurancePct].every(Number.isFinite))
    throw new Error("Insurance arithmetic requires finite numbers");
  const cents = Math.round(Math.max(0, gross) * 100);
  const deductible = Math.round(Math.max(0, v.deductible) * 100);
  const insurerLayer = Math.round(
    Math.max(0, cents - deductible) * (1 - Math.max(0, Math.min(100, v.coinsurancePct)) / 100),
  );
  const transferred = Math.max(
    0,
    Math.min(cents, insurerLayer, Math.round(Math.max(0, v.policyLimit) * 100)),
  );
  return { retained: (cents - transferred) / 100, transferred: transferred / 100 };
}

export function applyInsuranceTransfer(
  expected: number,
  low: number,
  high: number,
  v: Variables,
  likelihoodMultiplier: number,
): legacy.InsuranceTransferResult {
  const state = readInsurance(v);
  const scenario = scenarioFor(v);
  const central = modelInsuranceScenario(state, scenario, expected);
  const lower = modelInsuranceScenario(state, scenario, low);
  const upper = modelInsuranceScenario(state, scenario, high);
  const retainedExpected = central.retainedIfAssumptionsHold ?? expected;
  const retainedLow = lower.retainedIfAssumptionsHold ?? low;
  const retainedHigh = upper.retainedIfAssumptionsHold ?? high;
  const premium = central.premiumAnnual ?? 0;
  const frequency =
    state.annualFrequencyPct === null
      ? legacy.assumedAnnualFrequency(likelihoodMultiplier)
      : state.annualFrequencyPct / 100;
  const quote = computeNetPremium(v);
  const notes = [...central.notes];
  if (central.potentialRecovery === null)
    notes.push(
      "Coverage is not established. Zero recovery is credited for conservative scenario comparison; this does not mean the policy excludes the loss.",
    );
  if (central.premiumAnnual === null)
    notes.push(
      "Premium is unknown, not zero. Any numeric cost comparison excludes that unknown premium and is incomplete.",
    );
  if (state.annualFrequencyPct === null)
    notes.push(
      `The legacy scenario cost figure is only a what-if using this app's ${(frequency * 100).toFixed(1)}% one-event annual-frequency assumption, not a measured frequency. The insurance review leaves annual cost blank until an assumption is entered.`,
    );
  return {
    grossLossExpected: expected,
    grossLossLow: low,
    grossLossHigh: high,
    retainedExpected,
    retainedLow,
    retainedHigh,
    transferredExpected: central.potentialRecovery ?? 0,
    premiumAnnualNet: premium,
    discountPctApplied: quote.discountPctApplied,
    discounts: quote.discounts,
    expectedAnnualCostOfRisk: Math.round(premium + retainedExpected * frequency),
    eventPlusPremiumExpected: Math.round(premium + retainedExpected),
    notes,
  };
}

export function evaluateDynamicRisk(
  v: Variables,
  baseImpact: { expected: number; low: number; high: number },
  options?: { fraudRelated?: boolean; cashRelated?: boolean; staffImpactMult?: number },
): legacy.DynamicRiskOutcome {
  const likelihoodSeverity = computeLikelihoodSeverity(v, options);
  const impactMultiplier =
    likelihoodSeverity.grossSeverityMultiplier * (options?.staffImpactMult ?? 1);
  return {
    variables: v,
    likelihoodSeverity,
    impactMultiplier,
    timelineMultiplier:
      likelihoodSeverity.detectionLagMultiplier /
      Math.sqrt(likelihoodSeverity.likelihoodMultiplier),
    transfer: applyInsuranceTransfer(
      baseImpact.expected * impactMultiplier,
      baseImpact.low * impactMultiplier,
      baseImpact.high * impactMultiplier,
      v,
      likelihoodSeverity.likelihoodMultiplier,
    ),
  };
}
