import { describe, expect, it } from "vitest";
import { defaultProfile } from "./practice-profile";
import { compareAssessmentStates, createSnapshotComparisonReport } from "./snapshot-comparison";
import { DEFAULT_VALUE_CASE, observedValueStatus } from "./value-case";

const state = (valueCase = DEFAULT_VALUE_CASE) => ({
  profile: defaultProfile("retail"),
  powerMap: [],
  valueCase,
  evidence: [],
  asOf: new Date("2026-09-01T00:00:00Z"),
});

describe("compareAssessmentStates net observed value", () => {
  it("reports no change in value when neither assessment has an observed figure", () => {
    const result = compareAssessmentStates(state(), state());
    expect(result.netObservedValueDelta).toBeNull();
    expect(createSnapshotComparisonReport("Test", "2026-08-01", result)).toContain(
      "- Net observed value: not observed in both assessments",
    );
  });

  it("reports the change once both assessments carry the owner's own hours, rate and cost", () => {
    // Net value is observed only with the owner's hours, hourly cost and program cost.
    const own = { ...DEFAULT_VALUE_CASE, hourlyCost: 60, annualProgramCost: 2_000 };
    const before = { ...own, reviewHoursBefore: 40, reviewHoursAfter: 30 };
    const after = { ...own, reviewHoursBefore: 40, reviewHoursAfter: 10 };
    const result = compareAssessmentStates(state(after), state(before));
    const expected =
      (observedValueStatus(after).net.value ?? NaN) -
      (observedValueStatus(before).net.value ?? NaN);
    expect(result.netObservedValueDelta).toBe(expected);
    expect(result.netObservedValueDelta).toBeGreaterThan(0);
  });
});

it("compares insurance content, not object identity, and detects removal of provenance", () => {
  const before = state();
  before.profile.riskVariables.insurance = {
    status: "reported",
    confirmedFields: ["deductible"],
    modeledScenarioIds: ["sc-b", "sc-a"],
  };
  const same = structuredClone(before);
  same.profile.riskVariables.insurance!.modeledScenarioIds.reverse();
  expect(compareAssessmentStates(same, before).riskChanges).toBe(0);
  const removed = state();
  const comparison = compareAssessmentStates(removed, before);
  expect(comparison.riskVariableChanges).toHaveLength(1);
  expect(comparison.riskVariableChanges[0].key).toBe("insurance");
});

describe("risk-input changes read as labels and units", () => {
  it("names each input as the panel does and shows money, percentages and the load factor", () => {
    const before = state();
    const after = state();
    after.profile.riskVariables = {
      ...after.profile.riskVariables,
      basePremiumAnnual: 6100,
      discountBankRecPct: 10,
      hasIndependentBankRec: !before.profile.riskVariables.hasIndependentBankRec,
      claimsLoadFactor: 1.2,
    };
    const rows = Object.fromEntries(
      compareAssessmentStates(after, before).riskVariableChanges.map((c) => [
        c.key,
        `${c.label}: ${c.beforeText} → ${c.afterText}`,
      ]),
    );
    expect(rows.basePremiumAnnual).toBe("Base annual premium: $4,200 → $6,100");
    expect(rows.discountBankRecPct).toBe(
      "Credit from your quote: bank reconciliation or CPA review: 0% → 10%",
    );
    expect(rows.hasIndependentBankRec).toMatch(
      /^Independent bank reconciliation: (No → Yes|Yes → No)$/,
    );
    expect(rows.claimsLoadFactor).toBe("Claims / underwriting load factor: ×1 → ×1.2");
  });

  it("describes the insurance record in words, never as JSON, in the panel and the memo", () => {
    const before = state();
    const after = state();
    after.profile.riskVariables.insurance = {
      status: "reported",
      confirmedFields: ["basePremiumAnnual", "deductible", "policyLimit", "coinsurancePct"],
      modeledScenarioIds: [],
    };
    const comparison = compareAssessmentStates(after, before);
    const change = comparison.riskVariableChanges.find((c) => c.key === "insurance");
    expect(change?.label).toBe("Insurance information status");
    expect(change?.beforeText).toBe("not assessed");
    expect(change?.afterText).toBe("policy recorded (4 figures confirmed)");
    const memo = createSnapshotComparisonReport("Q3", "2026-06-30", comparison);
    expect(memo).toContain(
      "- Insurance information status: not assessed → policy recorded (4 figures confirmed)",
    );
    expect(memo).not.toContain("{");
    expect(memo).not.toContain("- insurance:");
  });
});

describe("snapshot comparison memo", () => {
  it("prints money deltas as -$3,640 and +$3,640, never $-3,640 or +$3,640.4", () => {
    const memo = createSnapshotComparisonReport(
      "Q3",
      "2026-06-30",
      {
        teamSizeDelta: 0,
        riskChanges: 0,
        grants: 0,
        revocations: 0,
        hires: 0,
        removals: 0,
        netObservedValueDelta: -3640,
        verifiedEvidenceDelta: 0,
        evidenceReadinessDelta: 0,
        verifiedRecoveryDelta: 3640.4,
        assignmentChanges: [],
        riskVariableChanges: [],
      } as unknown as Parameters<typeof createSnapshotComparisonReport>[2],
      new Date("2026-09-26T12:00:00Z"),
    );
    expect(memo).toContain("- Net observed value: -$3,640");
    expect(memo).toContain("- Verified recoveries: +$3,640");
    expect(memo).not.toContain("$-");
    expect(memo).not.toContain("3,640.4");
  });
});
