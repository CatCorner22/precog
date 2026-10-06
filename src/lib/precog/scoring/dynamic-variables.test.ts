import { describe, expect, it } from "vitest";
import { normalizeProfile, defaultProfile } from "../practice-profile";
import { pioneerProfileFrom } from "../coach/pioneer-profile";
import { parsePioneerInput } from "../public-inputs";
import {
  APP_DEFAULT_POLICY,
  DEFAULT_RISK_VARIABLES,
  applyInsuranceTransfer,
  computeAppliedDiscounts,
  evaluateDynamicRisk,
  effectiveRiskVariables,
  insuranceBasis,
  insuranceFigureNote,
  policyDefaultsInForce,
  policyEntered,
  retainLoss,
  VARIABLE_CATALOG,
  withoutPolicy,
  type RiskVariableState,
} from "./dynamic-variables";
import { CORE_POLICY_FIELDS, normalizeInsuranceRecord } from "./insurance-record";

const computeLikelihoodSeverity = (variables: RiskVariableState) =>
  evaluateDynamicRisk(variables, { expected: 50000, low: 10000, high: 100000 }).likelihoodSeverity;

const confirmed = (changes: Partial<RiskVariableState> = {}): RiskVariableState => ({
  ...DEFAULT_RISK_VARIABLES,
  insurance: {
    status: "reported",
    confirmedFields: [...CORE_POLICY_FIELDS],
    modeledScenarioIds: ["sc-vendor-fraud"],
    source: "Owner's policy worksheet",
    reviewedOn: "2026-09-25",
  },
  ...changes,
});

describe("explicit insurance status", () => {
  it("does not infer a policy from a changed sample number", () => {
    expect(policyEntered(DEFAULT_RISK_VARIABLES)).toBe(false);
    expect(policyEntered({ ...DEFAULT_RISK_VARIABLES, deductible: 2500 })).toBe(false);
    expect(insuranceBasis({ ...DEFAULT_RISK_VARIABLES, deductible: 2500 }, true)).toBe("unknown");
  });
  it("accepts confirmed policy values that exactly match demonstration defaults", () => {
    expect(policyEntered(confirmed())).toBe(true);
    expect(policyDefaultsInForce(confirmed())).toBe(false);
    expect(insuranceBasis(confirmed(), true)).toBe("entered");
  });
  it("distinguishes unknown, reported none, incomplete and complete records", () => {
    expect(insuranceBasis(DEFAULT_RISK_VARIABLES, true)).toBe("unknown");
    expect(insuranceBasis(DEFAULT_RISK_VARIABLES, false)).toBe("app_default");
    expect(
      insuranceBasis(
        confirmed({ insurance: { status: "none", confirmedFields: [], modeledScenarioIds: [] } }),
        true,
      ),
    ).toBe("none");
    expect(
      insuranceBasis(
        confirmed({
          insurance: {
            status: "reported",
            confirmedFields: ["basePremiumAnnual"],
            modeledScenarioIds: [],
          },
        }),
        true,
      ),
    ).toBe("incomplete");
  });
  it("models no recovery or premium from unknown legacy terms without calling the business uninsured", () => {
    const effective = effectiveRiskVariables(DEFAULT_RISK_VARIABLES, true, "sc-vendor-fraud");
    const result = applyInsuranceTransfer(50000, 10000, 100000, effective, 1);
    expect(result.retainedExpected).toBe(50000);
    expect(result.transferredExpected).toBe(0);
    expect(result.premiumAnnualNet).toBe(0);
    expect(insuranceFigureNote(DEFAULT_RISK_VARIABLES, true)).toContain(
      "does not mean you are uninsured",
    );
    expect(result.notes.join(" ")).toContain("not a finding that the business is uninsured");
  });
  it("preserves a confirmed premium but never guesses recovery from incomplete terms", () => {
    const input = confirmed({
      basePremiumAnnual: 1800,
      insurance: {
        status: "reported",
        confirmedFields: ["basePremiumAnnual"],
        modeledScenarioIds: ["sc-vendor-fraud"],
      },
    });
    const effective = effectiveRiskVariables(input, true, "sc-vendor-fraud");
    expect(effective.basePremiumAnnual).toBe(1800);
    expect(retainLoss(50000, effective).transferred).toBe(0);
    expect(insuranceFigureNote(input, true)).toContain("confirm deductible");
  });
  it("requires a separate coverage assumption for each scenario", () => {
    const input = confirmed();
    expect(
      retainLoss(50000, effectiveRiskVariables(input, true, "sc-vendor-fraud")).transferred,
    ).toBe(45000);
    expect(
      retainLoss(50000, effectiveRiskVariables(input, true, "sc-front-desk-leaves")).transferred,
    ).toBe(0);
    expect(retainLoss(50000, effectiveRiskVariables(input, true)).transferred).toBe(0);
    expect(insuranceFigureNote(input, true, "sc-vendor-fraud")).toContain(
      "not a coverage or claim determination",
    );
  });
  it("retains zero deductible and zero unreimbursed share as confirmed values", () => {
    const effective = effectiveRiskVariables(confirmed({ deductible: 0 }), true, "sc-vendor-fraud");
    expect(retainLoss(50000, effective)).toEqual({ retained: 0, transferred: 50000 });
  });
  it("ignores unconfirmed carrier discounts and does not double-discount a net premium", () => {
    const effective = effectiveRiskVariables(
      confirmed({ discountAlarmPct: 10 }),
      true,
      "sc-vendor-fraud",
    );
    expect(effective.discountAlarmPct).toBe(0);
    expect(applyInsuranceTransfer(50000, 10000, 100000, effective, 1).premiumAnnualNet).toBe(4200);
  });
  it("continues to label the sample policy as a demonstration", () => {
    expect(effectiveRiskVariables(DEFAULT_RISK_VARIABLES, false)).toBe(DEFAULT_RISK_VARIABLES);
    expect(insuranceFigureNote(DEFAULT_RISK_VARIABLES, false)).toBe(APP_DEFAULT_POLICY);
  });
  it("retains the whole loss and charges no premium for an explicitly uninsured scenario", () => {
    const variables = withoutPolicy(DEFAULT_RISK_VARIABLES);
    expect(retainLoss(56095, variables)).toEqual({ retained: 56095, transferred: 0 });
    const result = applyInsuranceTransfer(56095, 10000, 120000, variables, 1);
    expect(result.expectedAnnualCostOfRisk).toBe(Math.round(56095 * 0.12));
    expect(result.notes.join(" ")).toContain("Precog's assumption");
  });
});

describe("insurance arithmetic", () => {
  it("reproduces the approved $50k/$5k/$30k fixture", () => {
    expect(
      retainLoss(50000, { ...DEFAULT_RISK_VARIABLES, deductible: 5000, policyLimit: 30000 }),
    ).toEqual({ retained: 20000, transferred: 30000 });
  });
  it("treats unreimbursed share as 0–100 percent, not a fraction", () => {
    expect(retainLoss(15000, { ...DEFAULT_RISK_VARIABLES, coinsurancePct: 20 })).toEqual({
      retained: 7000,
      transferred: 8000,
    });
  });
  it("never invents loss by rounding both layers up", () => {
    expect(retainLoss(1, { ...DEFAULT_RISK_VARIABLES, deductible: 0, coinsurancePct: 50 })).toEqual(
      { retained: 0, transferred: 1 },
    );
  });
  it("conserves the gross loss for a grid of amounts and limits", () => {
    for (const gross of [0, 1, 10.5, 4999, 5000, 5001, 50000, 1000000]) {
      for (const deductible of [0, 5000, 50000])
        for (const policyLimit of [0, 1, 30000, 1000000]) {
          const result = retainLoss(gross, {
            ...DEFAULT_RISK_VARIABLES,
            deductible,
            policyLimit,
            coinsurancePct: 50,
          });
          expect(result.retained + result.transferred).toBe(Math.round(gross));
          expect(result.retained).toBeGreaterThanOrEqual(0);
          expect(result.transferred).toBeGreaterThanOrEqual(0);
          expect(result.transferred).toBeLessThanOrEqual(policyLimit);
        }
    }
  });
  it("rejects nonfinite inputs", () => {
    expect(() => retainLoss(NaN, DEFAULT_RISK_VARIABLES)).toThrow();
    expect(() => retainLoss(5000, { ...DEFAULT_RISK_VARIABLES, deductible: Infinity })).toThrow();
  });
  it("does not alter operational likelihood, loss severity or detection by changing insurance financing", () => {
    const baseline = computeLikelihoodSeverity(DEFAULT_RISK_VARIABLES);
    expect(
      computeLikelihoodSeverity({
        ...DEFAULT_RISK_VARIABLES,
        deductible: 50000,
        policyLimit: 1000000,
        basePremiumAnnual: 9999,
        claimsLoadFactor: 2.5,
      }),
    ).toEqual(baseline);
  });
  it("does not imply that a zero credit came from a quote", () => {
    const alarm = computeAppliedDiscounts({ ...DEFAULT_RISK_VARIABLES, hasAlarmAccess: true }).find(
      (d) => d.id === "alarm",
    )!;
    expect(alarm.reason).toContain("you entered no credit");
  });
});

describe("insurance provenance persistence and validation", () => {
  it("survives a profile reload and the actual advisor input parser", () => {
    const profile = { ...defaultProfile(), riskVariables: confirmed({ deductible: 9876.54 }) };
    expect(normalizeProfile(JSON.parse(JSON.stringify(profile))).riskVariables).toEqual(
      profile.riskVariables,
    );
    const parsed = parsePioneerInput({ profile });
    expect(pioneerProfileFrom(parsed.profile).riskVariables.insurance).toEqual(
      profile.riskVariables.insurance,
    );
  });
  it("preserves old numbers without manufacturing confirmation", () => {
    const profile = normalizeProfile({
      ...defaultProfile(),
      riskVariables: { ...DEFAULT_RISK_VARIABLES, deductible: 7777 },
    });
    expect(profile.riskVariables.deductible).toBe(7777);
    expect(profile.riskVariables.insurance).toBeUndefined();
    expect(insuranceBasis(profile.riskVariables, true)).toBe("unknown");
  });
  it("normalizes malformed metadata and caps the retained source", () => {
    const record = normalizeInsuranceRecord({
      status: "reported",
      confirmedFields: ["deductible", "bad", "deductible"],
      modeledScenarioIds: ["sc-a", "sc-a", "<script>", 1],
      source: "a".repeat(300),
      reviewedOn: "2026-02-30",
    })!;
    expect(record.confirmedFields).toEqual(["deductible"]);
    expect(record.modeledScenarioIds).toEqual(["sc-a"]);
    expect(record.source).toHaveLength(240);
    expect(record.reviewedOn).toBeUndefined();
    expect(
      normalizeInsuranceRecord({ status: "invalid", confirmedFields: ["deductible"] })
        ?.confirmedFields,
    ).toEqual([]);
  });
});

describe("likelihood and the timeline", () => {
  const base = { expected: 50000, low: 10000, high: 100000 };

  it("does not lengthen the days until found when a control makes a scheme less likely", () => {
    const off = evaluateDynamicRisk(DEFAULT_RISK_VARIABLES, base);
    const on = evaluateDynamicRisk({ ...DEFAULT_RISK_VARIABLES, hasDualControl: true }, base);
    expect(on.likelihoodSeverity.likelihoodMultiplier).toBeLessThan(
      off.likelihoodSeverity.likelihoodMultiplier,
    );
    expect(on.timelineMultiplier).toBe(off.timelineMultiplier);
    expect(on.timelineMultiplier).toBe(on.likelihoodSeverity.detectionLagMultiplier);
  });
});

describe("the alarm", () => {
  it("is not assumed: a fresh business gets no alarm credit", () => {
    expect(DEFAULT_RISK_VARIABLES.hasAlarmAccess).toBe(false);
    const drivers = computeLikelihoodSeverity(DEFAULT_RISK_VARIABLES).drivers;
    expect(drivers.some((d) => d.id === "alarm-l")).toBe(false);
    const catalog = VARIABLE_CATALOG.find((v) => v.id === "hasAlarmAccess")!;
    expect(catalog.defaultValue).toBe(false);
  });

  it("states the credit it applies", () => {
    const withAlarm = { ...DEFAULT_RISK_VARIABLES, hasAlarmAccess: true };
    const effect = (cashRelated: boolean) =>
      evaluateDynamicRisk(
        withAlarm,
        { expected: 1, low: 1, high: 1 },
        {
          fraudRelated: true,
          cashRelated,
        },
      ).likelihoodSeverity.drivers.find((d) => d.id === "alarm-l")!.effect;
    expect(effect(true)).toContain("−6%");
    expect(effect(false)).toContain("−3%");
  });
});

describe("the variable catalog", () => {
  it("shows the defaults the engine uses", () => {
    for (const v of VARIABLE_CATALOG) {
      expect(v.defaultValue, v.id).toBe(
        DEFAULT_RISK_VARIABLES[v.id as keyof typeof DEFAULT_RISK_VARIABLES],
      );
    }
  });
});

describe("insurance on a scenario that is not fraud", () => {
  const base = { expected: 50000, low: 10000, high: 100000 };

  it("models a recovery only for a fraud scenario", () => {
    const fraud = evaluateDynamicRisk(DEFAULT_RISK_VARIABLES, base, { fraudRelated: true });
    expect(fraud.transfer.transferredExpected).toBeGreaterThan(0);
    for (const opts of [undefined, { fraudRelated: false }]) {
      const t = evaluateDynamicRisk(DEFAULT_RISK_VARIABLES, base, opts).transfer;
      expect(t.transferredExpected).toBe(0);
      expect([t.retainedExpected, t.retainedLow, t.retainedHigh]).toEqual([
        t.grossLossExpected,
        t.grossLossLow,
        t.grossLossHigh,
      ]);
      // The premium is still paid, so the annual cost keeps it.
      expect(t.premiumAnnualNet).toBe(fraud.transfer.premiumAnnualNet);
      expect(t.notes.join(" ")).toContain(
        "Not an insured loss under a crime policy: the business keeps the whole assumed loss.",
      );
      expect(t.notes.join(" ")).not.toMatch(/deductible|enter coverage/i);
    }
  });
});

describe("notes with a premium but no modeled recovery", () => {
  it("do not describe a deductible and limit that are not in the calculation", () => {
    const v = { ...DEFAULT_RISK_VARIABLES, deductible: 0, policyLimit: 0, coinsurancePct: 0 };
    const t = applyInsuranceTransfer(80000, 40000, 120000, v, 1);
    expect(t.notes.join(" ")).toContain("models no recovery");
    expect(t.notes.join(" ")).not.toMatch(/deductible/i);
  });
});
