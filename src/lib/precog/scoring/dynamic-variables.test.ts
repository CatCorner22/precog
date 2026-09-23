import { describe, expect, it } from "vitest";
import {
  APP_DEFAULT_POLICY,
  DEFAULT_RISK_VARIABLES,
  applyInsuranceTransfer,
  computeAppliedDiscounts,
  effectiveRiskVariables,
  insuranceBasis,
  insuranceFigureNote,
  policyDefaultsInForce,
  policyEntered,
  retainLoss,
  withoutPolicy,
} from "./dynamic-variables";

describe("policy defaults", () => {
  it("counts a policy as entered once the premium, deductible or limit changes", () => {
    expect(policyEntered(DEFAULT_RISK_VARIABLES)).toBe(false);
    expect(policyEntered({ ...DEFAULT_RISK_VARIABLES, deductible: 2500 })).toBe(true);
    expect(policyEntered({ ...DEFAULT_RISK_VARIABLES, hasSecurityCameras: true })).toBe(false);
    expect(policyDefaultsInForce({ ...DEFAULT_RISK_VARIABLES, deductible: 2500 })).toBe(true);
    expect(
      policyDefaultsInForce({
        ...DEFAULT_RISK_VARIABLES,
        basePremiumAnnual: 1800,
        deductible: 2500,
        policyLimit: 50000,
      }),
    ).toBe(false);
  });

  it("treats an own business with no policy entered as having none", () => {
    expect(insuranceBasis(DEFAULT_RISK_VARIABLES, true)).toBe("none");
    expect(insuranceBasis(DEFAULT_RISK_VARIABLES, false)).toBe("app_default");
    expect(insuranceBasis({ ...DEFAULT_RISK_VARIABLES, deductible: 2500 }, true)).toBe("entered");
    const eff = effectiveRiskVariables(DEFAULT_RISK_VARIABLES, true);
    expect(eff).toEqual(withoutPolicy(DEFAULT_RISK_VARIABLES));
    expect(effectiveRiskVariables(DEFAULT_RISK_VARIABLES, false)).toBe(DEFAULT_RISK_VARIABLES);
  });

  it("retains the whole loss, charges no premium and applies no credit without a policy", () => {
    const v = withoutPolicy({ ...DEFAULT_RISK_VARIABLES, hasAlarmAccess: true });
    expect(retainLoss(56_095, v)).toEqual({ retained: 56_095, transferred: 0 });
    const t = applyInsuranceTransfer(56_095, 10_000, 120_000, v, 1);
    expect(t.premiumAnnualNet).toBe(0);
    expect(t.discountPctApplied).toBe(0);
    expect(t.retainedExpected).toBe(56_095);
    // Cost of risk is the retained loss × the assumed 12% chance a year, nothing else.
    expect(t.expectedAnnualCostOfRisk).toBe(Math.round(56_095 * 0.12));
    expect(t.notes[0]).toMatch(/^No crime policy in these figures/);
    expect(t.notes.join(" ")).toContain("this app's assumption");
  });

  it("labels every figure while a default is in force", () => {
    expect(insuranceFigureNote(DEFAULT_RISK_VARIABLES, true)).toBe(
      `No crime policy entered (${APP_DEFAULT_POLICY})`,
    );
    expect(insuranceFigureNote(DEFAULT_RISK_VARIABLES, false)).toBe(APP_DEFAULT_POLICY);
    expect(insuranceFigureNote({ ...DEFAULT_RISK_VARIABLES, basePremiumAnnual: 1800 }, true)).toBe(
      `deductible and limit still the ${APP_DEFAULT_POLICY}`,
    );
    expect(
      insuranceFigureNote(
        {
          ...DEFAULT_RISK_VARIABLES,
          basePremiumAnnual: 1800,
          deductible: 2500,
          policyLimit: 50000,
        },
        true,
      ),
    ).toBeNull();
  });

  it("never says a credit was entered when it is 0%", () => {
    const alarm = computeAppliedDiscounts(DEFAULT_RISK_VARIABLES).find((d) => d.id === "alarm")!;
    expect(alarm.pct).toBe(0);
    expect(alarm.reason).toBe(
      "Alarm or access control present; no credit entered from your quote, so none is applied.",
    );
    const entered = computeAppliedDiscounts({
      ...DEFAULT_RISK_VARIABLES,
      discountAlarmPct: 3,
    }).find((d) => d.id === "alarm")!;
    expect(entered.reason).toBe(
      "Alarm or access control present; the 3% credit you entered from your quote is applied.",
    );
  });
});
