import { describe, expect, it } from "vitest";
import {
  emptyInsurance, enteredFact, modelInsuranceScenario, newPolicy, normalizeInsurance, policyPremium,
  type InsuranceWorkspace,
} from "./model";
import {
  computeLikelihoodSeverity, DEFAULT_RISK_VARIABLES, policyEntered, policyFieldIsDefault, readInsurance, withInsurance,
} from "../scoring/dynamic-variables";
import { normalizeProfile, defaultProfile } from "../practice-profile";

function fixture(): InsuranceWorkspace {
  const policy = newPolicy("policy-one");
  policy.limitBasis = "per_event";
  policy.scenarios.theft = "assumed_covered";
  policy.terms.deductible = enteredFact(5000);
  policy.terms.insurerPaymentLimit = enteredFact(30000);
  policy.terms.unreimbursedPct = enteredFact(0);
  policy.terms.premiumAnnual = enteredFact(1000);
  return { ...emptyInsurance(), status: "terms_entered", policies: [policy], selectedPolicyId: policy.id };
}

describe("conditional insurance model", () => {
  it("keeps unknown coverage distinct from owner-reported absence", () => {
    expect(modelInsuranceScenario(emptyInsurance(), "theft", 50000)).toMatchObject({
      status: "not_assessed", potentialRecovery: null, retainedIfAssumptionsHold: null,
    });
    expect(modelInsuranceScenario({ ...emptyInsurance(), status: "none_reported" }, "theft", 50000)).toMatchObject({
      status: "none_reported", potentialRecovery: 0, retainedIfAssumptionsHold: 50000,
    });
  });
  it("calculates the approved 50000 loss / 5000 deductible / 30000 limit example", () => {
    expect(modelInsuranceScenario(fixture(), "theft", 50000)).toMatchObject({
      status: "conditional", potentialRecovery: 30000, retainedIfAssumptionsHold: 20000,
      annualCostOfRisk: null,
    });
  });
  it("requires scenario-specific applicability, not merely a policy category", () => {
    expect(modelInsuranceScenario(fixture(), "staff-absence", 50000).potentialRecovery).toBeNull();
  });
  it("recognizes explicitly entered values even when they equal old defaults", () => {
    const state = fixture();
    state.policies[0].terms.premiumAnnual = enteredFact(4200);
    state.policies[0].terms.insurerPaymentLimit = enteredFact(100000);
    const variables = withInsurance(DEFAULT_RISK_VARIABLES, state);
    expect(policyEntered(variables)).toBe(true);
    for (const key of ["basePremiumAnnual", "deductible", "policyLimit"] as const) {
      expect(policyFieldIsDefault(variables, key)).toBe(false);
    }
  });
  it("does not turn legacy defaults or changed numbers into confirmed facts", () => {
    expect(policyEntered({ ...DEFAULT_RISK_VARIABLES, policyLimit: 250000 })).toBe(false);
    expect(normalizeInsurance({ deductible: 5000 }).status).toBe("not_assessed");
  });
  it("requires confirmed terms and preserves a genuine zero deductible", () => {
    const state = fixture();
    state.policies[0].terms.deductible = enteredFact(0);
    expect(modelInsuranceScenario(state, "theft", 1000).potentialRecovery).toBe(1000);
    state.policies[0].terms.deductible.source = "unverified";
    expect(modelInsuranceScenario(state, "theft", 1000).potentialRecovery).toBeNull();
  });
  it("never pays beyond loss, sublimit, or remaining aggregate", () => {
    const state = fixture();
    state.policies[0].terms.sublimit = enteredFact(12000);
    state.policies[0].terms.aggregateLimit = enteredFact(50000);
    state.policies[0].terms.aggregateRemaining = enteredFact(8000);
    expect(modelInsuranceScenario(state, "theft", 50000).potentialRecovery).toBe(8000);
    expect(modelInsuranceScenario(state, "theft", 1000).potentialRecovery).toBe(0);
  });
  it("rejects contradictory aggregate information", () => {
    const state = fixture();
    state.policies[0].terms.aggregateLimit = enteredFact(10000);
    state.policies[0].terms.aggregateRemaining = enteredFact(20000);
    expect(modelInsuranceScenario(state, "theft", 50000).status).toBe("not_established");
  });
  it("treats dates outside the period as requiring review, not a final denial", () => {
    const state = fixture();
    state.policies[0].effectiveFrom = "2026-01-01";
    state.policies[0].effectiveTo = "2026-12-31";
    expect(modelInsuranceScenario(state, "theft", 50000, "2027-01-01").status).toBe("not_established");
    expect(modelInsuranceScenario(state, "theft", 50000, "2026-06-01").status).toBe("conditional");
  });
  it("does not add overlapping policy recoveries", () => {
    const state = fixture();
    state.policies.push({ ...state.policies[0], id: "policy-two" });
    state.selectedPolicyId = null;
    expect(modelInsuranceScenario(state, "theft", 50000).status).toBe("coordination_needed");
    state.selectedPolicyId = "policy-one";
    expect(modelInsuranceScenario(state, "theft", 50000).potentialRecovery).toBe(30000);
  });
  it("never discounts an already-net quote a second time", () => {
    const policy = fixture().policies[0];
    policy.terms.premiumCreditPct = enteredFact(10, "Quote page 2");
    expect(policyPremium(policy)).toBe(1000);
    policy.premiumBasis = "base_before_quoted_credit";
    expect(policyPremium(policy)).toBe(900);
  });
  it("keeps annual cost blank until the owner supplies a frequency assumption", () => {
    const state = fixture();
    expect(modelInsuranceScenario(state, "theft", 50000).annualCostOfRisk).toBeNull();
    state.annualFrequencyPct = 10;
    expect(modelInsuranceScenario(state, "theft", 50000).annualCostOfRisk).toBe(3000);
  });
  it("does not let insurance financing or bonding mechanically change operating likelihood", () => {
    const base = computeLikelihoodSeverity(DEFAULT_RISK_VARIABLES);
    const changed = computeLikelihoodSeverity({ ...DEFAULT_RISK_VARIABLES, deductible: 50000, policyLimit: 500000, claimsLoadFactor: 2, hasBondedCashHandlers: true });
    expect(changed).toEqual(base);
  });
  it("preserves policy provenance through profile normalization and JSON reload", () => {
    const profile = defaultProfile();
    profile.riskVariables = withInsurance(profile.riskVariables, fixture());
    const restored = normalizeProfile(JSON.parse(JSON.stringify(profile)));
    expect(readInsurance(restored.riskVariables)).toEqual(fixture());
  });
  it("conserves cents and refuses nonfinite loss inputs", () => {
    const state = fixture();
    state.policies[0].terms.deductible = enteredFact(0.13);
    state.policies[0].terms.unreimbursedPct = enteredFact(33.33);
    const result = modelInsuranceScenario(state, "theft", 100.07);
    expect(result.potentialRecovery! + result.retainedIfAssumptionsHold!).toBeCloseTo(100.07, 8);
    for (const amount of [-1, NaN, Infinity]) expect(() => modelInsuranceScenario(state, "theft", amount)).toThrow();
  });
});
