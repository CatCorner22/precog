import { describe, expect, it } from "vitest";
import { DEFAULT_RISK_VARIABLES, type RiskVariableState } from "./dynamic-variables";
import { withPolicyEdit } from "./insurance-record";
import { normalizeRiskVariables } from "../practice-profile";

const reported: RiskVariableState = {
  ...DEFAULT_RISK_VARIABLES,
  basePremiumAnnual: 6100,
  deductible: 2500,
  policyLimit: 250_000,
  insurance: {
    status: "reported",
    confirmedFields: ["basePremiumAnnual", "deductible", "policyLimit"],
    modeledScenarioIds: ["sc-a", "sc-b"],
    source: "Broker renewal letter",
    reviewedOn: "2026-09-01",
  },
};

describe("withPolicyEdit", () => {
  it("un-confirms an edited policy figure and clears modelled scenarios", () => {
    const next = withPolicyEdit(reported, { ...reported, deductible: 5000 });
    expect(next.deductible).toBe(5000);
    expect(next.insurance?.confirmedFields).toEqual(["basePremiumAnnual", "policyLimit"]);
    expect(next.insurance?.modeledScenarioIds).toEqual([]);
    expect(next.insurance?.source).toBe("Broker renewal letter");
  });

  it("leaves the record alone when no policy figure changed", () => {
    const next = withPolicyEdit(reported, { ...reported, hasSecurityCameras: true });
    expect(next.insurance?.confirmedFields).toHaveLength(3);
    expect(next.insurance?.modeledScenarioIds).toEqual(["sc-a", "sc-b"]);
  });

  it("keeps the owner's record through a reset to app defaults", () => {
    const next = withPolicyEdit(reported, { ...DEFAULT_RISK_VARIABLES });
    expect(next.insurance?.status).toBe("reported");
    expect(next.insurance?.source).toBe("Broker renewal letter");
    expect(next.insurance?.reviewedOn).toBe("2026-09-01");
    expect(next.insurance?.confirmedFields).toEqual([]);
    expect(next.basePremiumAnnual).toBe(DEFAULT_RISK_VARIABLES.basePremiumAnnual);
  });

  it("passes the state through when there is no record", () => {
    const next = withPolicyEdit(DEFAULT_RISK_VARIABLES, {
      ...DEFAULT_RISK_VARIABLES,
      deductible: 1,
    });
    expect(next.insurance).toBeUndefined();
    expect(next.deductible).toBe(1);
  });
});

describe("policy figures above the slider range", () => {
  it("keep a real $2,000,000 limit and $60,000 premium through a reload", () => {
    const saved = { ...reported, policyLimit: 2_000_000, basePremiumAnnual: 60_000 };
    const loaded = normalizeRiskVariables(
      JSON.parse(JSON.stringify(saved)),
      DEFAULT_RISK_VARIABLES,
    );
    expect(loaded.policyLimit).toBe(2_000_000);
    expect(loaded.basePremiumAnnual).toBe(60_000);
  });
});
